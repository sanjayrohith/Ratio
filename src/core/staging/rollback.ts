import { PendingWriteRepository, PendingWriteRecord } from '../../storage/pending-writes.js';
import { StagingBuffer } from './buffer.js';

export interface RollbackResult {
  ticketId: string;
  filePath: string;
  status: 'REJECTED';
  rejectionReason: string;
  resolvedAt: string;
}

/**
 * Rejection and Rollback Cleanup Handler:
 * 1. Marks the staged pending write as REJECTED in SQLite pending_writes table with the rejection reason.
 * 2. Synchronizes memory buffer (if present) to rejected status.
 * 3. Does NOT touch or alter the destination file on disk.
 * 4. Optionally purges/deletes from SQLite when purgeImmediately is set to true.
 */
export class StagedWriteRollbackHandler {
  constructor(
    private readonly pendingRepo: PendingWriteRepository,
    private readonly memoryBuffer?: StagingBuffer
  ) {}

  /**
   * Rejects and rolls back a pending staged write without modifying the filesystem.
   */
  public rollback(
    ticketId: string,
    reason: string = 'Checkpoint validation failed or write cancelled.',
    purgeImmediately: boolean = false
  ): RollbackResult {
    const pending = this.pendingRepo.getByTicketId(ticketId);
    if (!pending) {
      throw new Error(`Pending write not found for ticket ID: ${ticketId}`);
    }

    if (pending.status === 'COMMITTED') {
      throw new Error(`Cannot roll back already committed write ticket: ${ticketId}`);
    }

    const now = new Date().toISOString();

    // Mark as REJECTED in SQLite
    this.pendingRepo.markRejected(ticketId, reason, now);

    // Sync memory buffer
    if (this.memoryBuffer) {
      try {
        this.memoryBuffer.reject(ticketId, reason);
        if (purgeImmediately) {
          this.memoryBuffer.delete(ticketId);
        }
      } catch {
        // Staged write may only exist in DB
      }
    }

    if (purgeImmediately) {
      this.pendingRepo.delete(ticketId);
    }

    return {
      ticketId,
      filePath: pending.file_path,
      status: 'REJECTED',
      rejectionReason: reason,
      resolvedAt: now,
    };
  }

  /**
   * Purges all rejected writes older than a given date or all rejected writes.
   */
  public purgeRejected(): number {
    const rejected = this.pendingRepo.listByStatus('REJECTED');
    let purged = 0;
    for (const item of rejected) {
      if (this.pendingRepo.delete(item.ticket_id)) {
        purged++;
      }
    }
    return purged;
  }
}
