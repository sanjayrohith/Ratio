import { Database } from 'bun:sqlite';

export type PendingWriteStatus = 'PENDING' | 'APPROVED' | 'COMMITTED' | 'REJECTED';

export interface PendingWriteRecord {
  ticket_id: string;
  file_path: string;
  content: string;
  operation: 'write' | 'edit';
  question: string;
  concept?: string | null;
  rationale?: string | null;
  status: PendingWriteStatus;
  rejection_reason?: string | null;
  created_at: string;
  resolved_at?: string | null;
  metadata?: Record<string, any> | null;
}

export interface InsertPendingWriteInput {
  ticketId: string;
  filePath: string;
  content: string;
  operation: 'write' | 'edit';
  question: string;
  concept?: string | null;
  rationale?: string | null;
  metadata?: Record<string, any> | null;
  createdAt?: string;
}

/**
 * Data Access Object for persisting and retrieving staged writes in SQLite.
 */
export class PendingWriteRepository {
  constructor(private readonly db: Database) {}

  /**
   * Persists a staged write into the pending_writes table.
   */
  insert(input: InsertPendingWriteInput): PendingWriteRecord {
    const createdAt = input.createdAt ?? new Date().toISOString();
    const metaJson = input.metadata ? JSON.stringify(input.metadata) : null;

    const stmt = this.db.prepare(`
      INSERT INTO pending_writes (
        ticket_id,
        file_path,
        content,
        operation,
        question,
        concept,
        rationale,
        status,
        created_at,
        metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
    `);

    stmt.run(
      input.ticketId,
      input.filePath,
      input.content,
      input.operation,
      input.question,
      input.concept ?? null,
      input.rationale ?? null,
      createdAt,
      metaJson
    );

    const record = this.getByTicketId(input.ticketId);
    if (!record) {
      throw new Error(`Failed to retrieve newly inserted pending write: ${input.ticketId}`);
    }
    return record;
  }

  /**
   * Retrieves a pending write by ticket ID.
   */
  getByTicketId(ticketId: string): PendingWriteRecord | null {
    const stmt = this.db.prepare('SELECT * FROM pending_writes WHERE ticket_id = ?');
    const row = stmt.get(ticketId) as any;
    if (!row) return null;
    return this.mapRow(row);
  }

  /**
   * Retrieves the latest pending write for a specific file path.
   */
  getPendingForFile(filePath: string): PendingWriteRecord | null {
    const stmt = this.db.prepare(`
      SELECT * FROM pending_writes
      WHERE file_path = ? AND status = 'PENDING'
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const row = stmt.get(filePath) as any;
    if (!row) return null;
    return this.mapRow(row);
  }

  /**
   * Transitions status to APPROVED.
   */
  markApproved(ticketId: string, resolvedAt?: string): PendingWriteRecord {
    const at = resolvedAt ?? new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE pending_writes
      SET status = 'APPROVED', resolved_at = ?
      WHERE ticket_id = ?
    `);
    const res = stmt.run(at, ticketId);
    if (res.changes === 0) {
      throw new Error(`Pending write not found for ticket: ${ticketId}`);
    }
    return this.getByTicketId(ticketId)!;
  }

  /**
   * Transitions status to COMMITTED.
   */
  markCommitted(ticketId: string, resolvedAt?: string): PendingWriteRecord {
    const at = resolvedAt ?? new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE pending_writes
      SET status = 'COMMITTED', resolved_at = ?
      WHERE ticket_id = ?
    `);
    const res = stmt.run(at, ticketId);
    if (res.changes === 0) {
      throw new Error(`Pending write not found for ticket: ${ticketId}`);
    }
    return this.getByTicketId(ticketId)!;
  }

  /**
   * Transitions status to REJECTED with reason.
   */
  markRejected(ticketId: string, reason?: string, resolvedAt?: string): PendingWriteRecord {
    const at = resolvedAt ?? new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE pending_writes
      SET status = 'REJECTED', rejection_reason = ?, resolved_at = ?
      WHERE ticket_id = ?
    `);
    const res = stmt.run(reason ?? null, at, ticketId);
    if (res.changes === 0) {
      throw new Error(`Pending write not found for ticket: ${ticketId}`);
    }
    return this.getByTicketId(ticketId)!;
  }

  /**
   * Lists all writes with given status (default: PENDING).
   */
  listByStatus(status: PendingWriteStatus = 'PENDING'): PendingWriteRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM pending_writes
      WHERE status = ?
      ORDER BY created_at ASC
    `);
    const rows = stmt.all(status) as any[];
    return rows.map((r) => this.mapRow(r));
  }

  /**
   * Deletes a pending write entry.
   */
  delete(ticketId: string): boolean {
    const res = this.db.prepare('DELETE FROM pending_writes WHERE ticket_id = ?').run(ticketId);
    return res.changes > 0;
  }

  private mapRow(row: any): PendingWriteRecord {
    let metadata: Record<string, any> | null = null;
    if (row.metadata) {
      try {
        metadata = JSON.parse(row.metadata);
      } catch {
        metadata = null;
      }
    }

    return {
      ticket_id: row.ticket_id,
      file_path: row.file_path,
      content: row.content,
      operation: row.operation,
      question: row.question,
      concept: row.concept,
      rationale: row.rationale,
      status: row.status,
      rejection_reason: row.rejection_reason,
      created_at: row.created_at,
      resolved_at: row.resolved_at,
      metadata,
    };
  }
}
