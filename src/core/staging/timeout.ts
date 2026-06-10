import { StagingBuffer, StagedWrite } from './buffer.js';
import { PendingWriteRepository, PendingWriteRecord } from '../../storage/pending-writes.js';
import { CheckpointRepository } from '../../storage/checkpoint-repo.js';

export interface TimeoutOptions {
  timeoutMs?: number; // default: 10 * 60 * 1000 (10 minutes)
}

export interface ExpiredTicketResult {
  ticketId: string;
  filePath: string;
  ageMs: number;
  expiredAt: string;
  reason: string;
}

export interface DeadlockDetail {
  ticketId: string;
  filePath: string;
  ageMs: number;
  reason: string;
  severity: 'warning' | 'critical';
}

export interface DeadlockReport {
  hasDeadlocks: boolean;
  deadlockedTickets: string[];
  blockedFiles: string[];
  details: DeadlockDetail[];
  summary: string;
}

export interface SweepResult {
  expiredCount: number;
  expiredTickets: ExpiredTicketResult[];
  releasedFiles: string[];
}

export interface TicketTimeoutManagerOptions {
  stagingBuffer?: StagingBuffer;
  pendingRepo?: PendingWriteRepository;
  checkpointRepo?: CheckpointRepository;
  defaultTimeoutMs?: number;
}

/**
 * Manages ticket lifecycle timeouts, deadlock detection, and clean lock expiration
 * for abandoned pending writes awaiting comprehension verification.
 */
export class TicketTimeoutManager {
  private readonly stagingBuffer?: StagingBuffer;
  private readonly pendingRepo?: PendingWriteRepository;
  private readonly checkpointRepo?: CheckpointRepository;
  private readonly defaultTimeoutMs: number;
  private timer?: ReturnType<typeof setInterval>;

  constructor(options: TicketTimeoutManagerOptions = {}) {
    this.stagingBuffer = options.stagingBuffer;
    this.pendingRepo = options.pendingRepo;
    this.checkpointRepo = options.checkpointRepo;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 10 * 60 * 1000; // 10 minutes
  }

  /**
   * Returns effective timeout duration in milliseconds.
   */
  public getTimeoutMs(override?: number): number {
    return override !== undefined && override > 0 ? override : this.defaultTimeoutMs;
  }

  /**
   * Helper to parse date string or Date object into millisecond epoch.
   */
  private parseDateMs(dateVal: string | Date): number {
    if (dateVal instanceof Date) {
      return dateVal.getTime();
    }
    const parsed = new Date(dateVal).getTime();
    return isNaN(parsed) ? Date.now() : parsed;
  }

  /**
   * Evaluates if a given timestamp exceeds the timeout threshold.
   */
  public isExpired(
    createdAt: string | Date,
    timeoutMs?: number,
    now: number = Date.now()
  ): boolean {
    const createdTime = this.parseDateMs(createdAt);
    const effectiveTimeout = this.getTimeoutMs(timeoutMs);
    return now - createdTime >= effectiveTimeout;
  }

  /**
   * Scans SQLite ledger and in-memory buffer to locate all pending write tickets
   * that have exceeded their permitted lifespan.
   */
  public findExpiredTickets(options: { timeoutMs?: number; now?: number } = {}): Array<{
    ticketId: string;
    filePath: string;
    ageMs: number;
    createdAt: string;
  }> {
    const now = options.now ?? Date.now();
    const effectiveTimeout = this.getTimeoutMs(options.timeoutMs);
    const expiredMap = new Map<string, { ticketId: string; filePath: string; ageMs: number; createdAt: string }>();

    // 1. Scan SQLite pending_writes
    if (this.pendingRepo) {
      const pendingRecords = this.pendingRepo.listByStatus('PENDING');
      for (const record of pendingRecords) {
        const createdMs = this.parseDateMs(record.created_at);
        const ageMs = Math.max(0, now - createdMs);
        if (ageMs >= effectiveTimeout) {
          expiredMap.set(record.ticket_id, {
            ticketId: record.ticket_id,
            filePath: record.file_path,
            ageMs,
            createdAt: record.created_at,
          });
        }
      }
    }

    // 2. Scan in-memory buffer
    if (this.stagingBuffer) {
      const memoryPending = this.stagingBuffer.listPending();
      for (const staged of memoryPending) {
        const createdMs = staged.createdAt.getTime();
        const ageMs = Math.max(0, now - createdMs);
        if (ageMs >= effectiveTimeout) {
          if (!expiredMap.has(staged.ticketId)) {
            expiredMap.set(staged.ticketId, {
              ticketId: staged.ticketId,
              filePath: staged.file,
              ageMs,
              createdAt: staged.createdAt.toISOString(),
            });
          }
        }
      }
    }

    return Array.from(expiredMap.values());
  }

  /**
   * Analyzes active pending tickets to detect deadlocks, resource lock starvation,
   * and abandoned tickets blocking file write operations.
   */
  public detectDeadlocks(options: { timeoutMs?: number; now?: number } = {}): DeadlockReport {
    const now = options.now ?? Date.now();
    const effectiveTimeout = this.getTimeoutMs(options.timeoutMs);

    const pendingTickets: Array<{ ticketId: string; filePath: string; ageMs: number }> = [];

    if (this.pendingRepo) {
      const records = this.pendingRepo.listByStatus('PENDING');
      for (const r of records) {
        const age = Math.max(0, now - this.parseDateMs(r.created_at));
        pendingTickets.push({ ticketId: r.ticket_id, filePath: r.file_path, ageMs: age });
      }
    } else if (this.stagingBuffer) {
      for (const s of this.stagingBuffer.listPending()) {
        const age = Math.max(0, now - s.createdAt.getTime());
        pendingTickets.push({ ticketId: s.ticketId, filePath: s.file, ageMs: age });
      }
    }

    const details: DeadlockDetail[] = [];
    const deadlockedTickets: string[] = [];
    const blockedFilesSet = new Set<string>();

    // Group by file path to detect file lock contention
    const byFile = new Map<string, Array<{ ticketId: string; ageMs: number }>>();
    for (const t of pendingTickets) {
      const list = byFile.get(t.filePath) ?? [];
      list.push(t);
      byFile.set(t.filePath, list);
    }

    // 1. Detect expired abandoned locks
    for (const t of pendingTickets) {
      if (t.ageMs >= effectiveTimeout) {
        deadlockedTickets.push(t.ticketId);
        blockedFilesSet.add(t.filePath);
        details.push({
          ticketId: t.ticketId,
          filePath: t.filePath,
          ageMs: t.ageMs,
          reason: `Ticket exceeded max lifespan of ${effectiveTimeout}ms (age: ${Math.round(t.ageMs / 1000)}s) without answer.`,
          severity: 'critical',
        });
      }
    }

    // 2. Detect multiple pending writes queued on the same file
    for (const [filePath, tickets] of byFile.entries()) {
      if (tickets.length > 1) {
        blockedFilesSet.add(filePath);
        for (const t of tickets) {
          if (!deadlockedTickets.includes(t.ticketId)) {
            deadlockedTickets.push(t.ticketId);
          }
          details.push({
            ticketId: t.ticketId,
            filePath,
            ageMs: t.ageMs,
            reason: `Multiple concurrent pending writes (${tickets.length}) conflicting on file "${filePath}".`,
            severity: 'critical',
          });
        }
      }
    }

    const blockedFiles = Array.from(blockedFilesSet);
    const hasDeadlocks = deadlockedTickets.length > 0;

    const summary = hasDeadlocks
      ? `Detected ${deadlockedTickets.length} deadlocked ticket(s) blocking ${blockedFiles.length} file(s).`
      : 'No deadlocks or abandoned file locks detected.';

    return {
      hasDeadlocks,
      deadlockedTickets,
      blockedFiles,
      details,
      summary,
    };
  }

  /**
   * Expires an individual ticket, rejecting it in SQLite and memory,
   * updating any corresponding checkpoint status, and releasing its file lock.
   */
  public expireTicket(ticketId: string, reason?: string): ExpiredTicketResult {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const expireReason = reason ?? `Abandoned pending write timed out after exceeding timeout window.`;

    let filePath = 'unknown';
    let ageMs = 0;

    // 1. Update SQLite pending_writes
    if (this.pendingRepo) {
      const record = this.pendingRepo.getByTicketId(ticketId);
      if (record) {
        filePath = record.file_path;
        ageMs = Math.max(0, now - this.parseDateMs(record.created_at));
        if (record.status === 'PENDING') {
          this.pendingRepo.markRejected(ticketId, expireReason, nowIso);
        }
      }
    }

    // 2. Update Checkpoint ledger
    if (this.checkpointRepo) {
      const cp = this.checkpointRepo.getCheckpoint(ticketId);
      if (cp && cp.status === 'pending') {
        this.checkpointRepo.resolveCheckpoint({
          ticketId,
          status: 'failed',
          evaluationScore: 0,
          evaluationReason: `EXPIRED: ${expireReason}`,
          resolvedAt: nowIso,
        });
      }
    }

    // 3. Update memory buffer
    if (this.stagingBuffer) {
      const staged = this.stagingBuffer.get(ticketId);
      if (staged) {
        if (filePath === 'unknown') {
          filePath = staged.file;
        }
        if (ageMs === 0) {
          ageMs = Math.max(0, now - staged.createdAt.getTime());
        }
        try {
          this.stagingBuffer.reject(ticketId, expireReason);
        } catch {
          // Ignore if already marked
        }
      }
    }

    return {
      ticketId,
      filePath,
      ageMs,
      expiredAt: nowIso,
      reason: expireReason,
    };
  }

  /**
   * Sweeps and expires all abandoned pending writes across SQLite and memory.
   */
  public sweepExpired(options: { timeoutMs?: number; reason?: string } = {}): SweepResult {
    const expired = this.findExpiredTickets(options);
    const results: ExpiredTicketResult[] = [];
    const releasedFilesSet = new Set<string>();

    for (const item of expired) {
      const res = this.expireTicket(item.ticketId, options.reason);
      results.push(res);
      if (res.filePath !== 'unknown') {
        releasedFilesSet.add(res.filePath);
      }
    }

    return {
      expiredCount: results.length,
      expiredTickets: results,
      releasedFiles: Array.from(releasedFilesSet),
    };
  }

  /**
   * Checks if an existing pending write on a file has expired and releases it,
   * returning true if an expired lock was cleaned up.
   */
  public checkAndReleaseFile(filePath: string, options: { timeoutMs?: number; reason?: string } = {}): boolean {
    const now = Date.now();
    const effectiveTimeout = this.getTimeoutMs(options.timeoutMs);

    // Check SQLite
    if (this.pendingRepo) {
      const pending = this.pendingRepo.getPendingForFile(filePath);
      if (pending) {
        const age = Math.max(0, now - this.parseDateMs(pending.created_at));
        if (age >= effectiveTimeout) {
          this.expireTicket(pending.ticket_id, options.reason);
          return true;
        }
        return false;
      }
    }

    // Check memory buffer
    if (this.stagingBuffer) {
      const staged = this.stagingBuffer.getPendingForFile(filePath);
      if (staged) {
        const age = Math.max(0, now - staged.createdAt.getTime());
        if (age >= effectiveTimeout) {
          this.expireTicket(staged.ticketId, options.reason);
          return true;
        }
        return false;
      }
    }

    return false;
  }

  /**
   * Starts periodic background sweeps to clean up abandoned tickets.
   */
  public startSweeper(intervalMs: number = 60_000, timeoutMs?: number): void {
    if (this.timer) {
      clearInterval(this.timer);
    }

    this.timer = setInterval(() => {
      this.sweepExpired({ timeoutMs });
    }, intervalMs);

    // Unref timer so it doesn't hold the runtime process open
    if (typeof this.timer === 'object' && 'unref' in this.timer && typeof (this.timer as any).unref === 'function') {
      (this.timer as any).unref();
    }
  }

  /**
   * Stops background sweeper timer.
   */
  public stopSweeper(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
