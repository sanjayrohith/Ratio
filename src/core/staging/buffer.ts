import { randomBytes } from 'node:crypto';

export type StagedWriteStatus = 'pending' | 'approved' | 'rejected' | 'committed';

export interface StagedWrite {
  ticketId: string;
  file: string;
  content: string;
  operation: 'write' | 'edit';
  question: string;
  concept?: string;
  rationale?: string;
  status: StagedWriteStatus;
  createdAt: Date;
  resolvedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface StageOptions {
  file: string;
  content: string;
  operation: 'write' | 'edit';
  question: string;
  concept?: string;
  rationale?: string;
  metadata?: Record<string, unknown>;
}

/**
 * In-memory staging buffer holding pending file writes awaiting Socratic checkpoint resolution.
 */
export class StagingBuffer {
  private writes: Map<string, StagedWrite> = new Map();

  /**
   * Generates a unique, collision-resistant ticket identifier.
   */
  public generateTicketId(): string {
    const timestamp = Date.now().toString(36);
    const randomSuffix = randomBytes(4).toString('hex');
    return `chk_${timestamp}_${randomSuffix}`;
  }

  /**
   * Stages a write operation and returns the generated staged record.
   */
  public stage(options: StageOptions): StagedWrite {
    const ticketId = this.generateTicketId();
    const staged: StagedWrite = {
      ticketId,
      file: options.file,
      content: options.content,
      operation: options.operation,
      question: options.question,
      concept: options.concept,
      rationale: options.rationale,
      status: 'pending',
      createdAt: new Date(),
      metadata: options.metadata,
    };

    this.writes.set(ticketId, staged);
    return staged;
  }

  /**
   * Retrieves a staged write by ticket ID.
   */
  public get(ticketId: string): StagedWrite | undefined {
    return this.writes.get(ticketId);
  }

  /**
   * Finds the latest pending write for a specific file path.
   */
  public getPendingForFile(file: string): StagedWrite | undefined {
    for (const staged of this.writes.values()) {
      if (staged.file === file && staged.status === 'pending') {
        return staged;
      }
    }
    return undefined;
  }

  /**
   * Returns all currently pending staged writes.
   */
  public listPending(): StagedWrite[] {
    return Array.from(this.writes.values()).filter((w) => w.status === 'pending');
  }

  /**
   * Marks a staged write as approved.
   */
  public approve(ticketId: string): StagedWrite {
    const staged = this.writes.get(ticketId);
    if (!staged) {
      throw new Error(`Staged write with ticket ID "${ticketId}" not found.`);
    }
    staged.status = 'approved';
    staged.resolvedAt = new Date();
    return staged;
  }

  /**
   * Marks a staged write as rejected.
   */
  public reject(ticketId: string, reason?: string): StagedWrite {
    const staged = this.writes.get(ticketId);
    if (!staged) {
      throw new Error(`Staged write with ticket ID "${ticketId}" not found.`);
    }
    staged.status = 'rejected';
    staged.resolvedAt = new Date();
    if (reason && staged.metadata) {
      staged.metadata.rejectionReason = reason;
    } else if (reason) {
      staged.metadata = { rejectionReason: reason };
    }
    return staged;
  }

  /**
   * Marks a staged write as committed after disk write.
   */
  public commit(ticketId: string): StagedWrite {
    const staged = this.writes.get(ticketId);
    if (!staged) {
      throw new Error(`Staged write with ticket ID "${ticketId}" not found.`);
    }
    staged.status = 'committed';
    return staged;
  }

  /**
   * Deletes a staged write record.
   */
  public delete(ticketId: string): boolean {
    return this.writes.delete(ticketId);
  }

  /**
   * Clears all entries from the buffer.
   */
  public clear(): void {
    this.writes.clear();
  }

  /**
   * Total number of tracked writes in memory.
   */
  public get size(): number {
    return this.writes.size;
  }
}

/**
 * Global default in-memory staging buffer instance.
 */
export const defaultStagingBuffer = new StagingBuffer();
