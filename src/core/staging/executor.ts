import { PendingWriteRepository, PendingWriteRecord } from '../../storage/pending-writes.js';
import { atomicWriteFile, AtomicWriteResult } from '../../storage/fs.js';
import { StagingBuffer } from './buffer.js';

export interface CommitResult {
  ticketId: string;
  filePath: string;
  bytesWritten: number;
  status: 'COMMITTED';
  committedAt: string;
}

/**
 * Executes approved commit transactions:
 * 1. Loads staged payload from SQLite pending_writes (and optional memory buffer).
 * 2. Validates that the status is APPROVED (or PENDING -> auto-approved).
 * 3. Atomically writes the payload to disk via atomicWriteFile.
 * 4. Transitions database record status to COMMITTED.
 */
export class CommitTransactionExecutor {
  constructor(
    private readonly pendingRepo: PendingWriteRepository,
    private readonly memoryBuffer?: StagingBuffer
  ) {}

  /**
   * Commits an approved pending write to disk.
   */
  public async commit(ticketId: string): Promise<CommitResult> {
    const pending = this.pendingRepo.getByTicketId(ticketId);
    if (!pending) {
      throw new Error(`Pending write not found for ticket ID: ${ticketId}`);
    }

    if (pending.status === 'REJECTED') {
      throw new Error(`Cannot commit rejected write ticket: ${ticketId}`);
    }

    if (pending.status === 'COMMITTED') {
      throw new Error(`Write ticket has already been committed: ${ticketId}`);
    }

    // Atomically write file to destination disk
    const writeResult: AtomicWriteResult = await atomicWriteFile(
      pending.file_path,
      pending.content,
      { encoding: 'utf-8' }
    );

    const now = new Date().toISOString();

    // Mark as COMMITTED in SQLite ledger
    this.pendingRepo.markCommitted(ticketId, now);

    // Sync memory buffer if present
    if (this.memoryBuffer) {
      try {
        this.memoryBuffer.commit(ticketId);
      } catch {
        // May not be in memory buffer if resumed after restart
      }
    }

    return {
      ticketId,
      filePath: pending.file_path,
      bytesWritten: writeResult.bytesWritten,
      status: 'COMMITTED',
      committedAt: now,
    };
  }

  /**
   * Approves a pending write ticket in preparation for commit.
   */
  public approve(ticketId: string): PendingWriteRecord {
    const pending = this.pendingRepo.getByTicketId(ticketId);
    if (!pending) {
      throw new Error(`Pending write not found for ticket ID: ${ticketId}`);
    }

    if (pending.status === 'REJECTED') {
      throw new Error(`Cannot approve a rejected write ticket: ${ticketId}`);
    }

    const approved = this.pendingRepo.markApproved(ticketId);

    if (this.memoryBuffer) {
      try {
        this.memoryBuffer.approve(ticketId);
      } catch {
        // Ignore if only in SQLite
      }
    }

    return approved;
  }
}
