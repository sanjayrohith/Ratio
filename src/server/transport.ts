import type { Readable, Writable } from 'node:stream';
import process from 'node:process';
import type { Database, Statement } from 'bun:sqlite';
import type { JSONRPCMessage, MessageExtraInfo, RequestId } from '@modelcontextprotocol/sdk/types.js';
import type { Transport, TransportSendOptions } from '@modelcontextprotocol/sdk/shared/transport.js';
import { ReadBuffer, serializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js';
import { safeStdioBuffer } from '../core/utils/platform.js';

/**
 * Registry and manager for finalizing SQLite prepared statements
 * to prevent memory leaks and dangling locks in long-running processes.
 */
export class PreparedStatementFinalizer {
  private statements: Set<Statement> = new Set();

  /**
   * Registers a prepared statement for managed finalization.
   */
  register<T extends Statement = Statement>(stmt: T): T {
    this.statements.add(stmt);
    return stmt;
  }

  /**
   * Finalizes an individual prepared statement and unregisters it.
   */
  finalize(stmt: Statement): boolean {
    if (!this.statements.has(stmt)) {
      return false;
    }
    this.statements.delete(stmt);
    try {
      if (typeof stmt.finalize === 'function') {
        stmt.finalize();
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Finalizes all registered prepared statements and clears the registry.
   * Returns the count of finalized statements.
   */
  finalizeAll(): number {
    let finalized = 0;
    for (const stmt of this.statements) {
      try {
        if (typeof stmt.finalize === 'function') {
          stmt.finalize();
          finalized++;
        }
      } catch {
        // Suppress finalization error on already closed/finalized statements
      }
    }
    this.statements.clear();
    return finalized;
  }

  /**
   * Prepares and automatically registers a statement on a Database.
   */
  prepare(db: Database, sql: string): Statement {
    const stmt = db.prepare(sql);
    this.register(stmt);
    return stmt;
  }

  get size(): number {
    return this.statements.size;
  }

  has(stmt: Statement): boolean {
    return this.statements.has(stmt);
  }
}

export const defaultStatementFinalizer = new PreparedStatementFinalizer();

export interface ManagedStdioTransportOptions {
  maxBufferSize?: number;
  statementFinalizer?: PreparedStatementFinalizer;
  autoFinalizeOnClose?: boolean;
}

/**
 * Robust Stdio Server Transport for MCP with explicit buffer cleanup,
 * listener detachment, and SQLite prepared statement finalization.
 */
export class ManagedStdioTransport implements Transport {
  private _stdin: Readable;
  private _stdout: Writable;
  private _started = false;
  private _closed = false;
  private _readBuffer: ReadBuffer;
  private _statementFinalizer: PreparedStatementFinalizer;
  private _autoFinalizeOnClose: boolean;
  private _maxBufferSize: number;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: <T extends JSONRPCMessage>(message: T, extra?: MessageExtraInfo) => void;
  sessionId?: string;

  private _ondata: (chunk: Buffer) => void;
  private _onerror: (error: Error) => void;

  constructor(
    stdin: Readable = process.stdin,
    stdout: Writable = process.stdout,
    options?: ManagedStdioTransportOptions
  ) {
    this._stdin = stdin;
    this._stdout = stdout;
    this._maxBufferSize = options?.maxBufferSize ?? 10 * 1024 * 1024; // 10MB default
    this._readBuffer = new ReadBuffer({ maxBufferSize: this._maxBufferSize });
    this._statementFinalizer = options?.statementFinalizer ?? defaultStatementFinalizer;
    this._autoFinalizeOnClose = options?.autoFinalizeOnClose ?? true;

    this._ondata = (chunk: Buffer) => {
      if (this._closed) return;
      try {
        const safeChunk = safeStdioBuffer(chunk);
        this._readBuffer.append(safeChunk);
        this.processReadBuffer();
      } catch (error) {
        this.onerror?.(error as Error);
        this.close().catch(() => {});
      }
    };

    this._onerror = (error: Error) => {
      this.onerror?.(error);
    };
  }

  get isClosed(): boolean {
    return this._closed;
  }

  get statementFinalizer(): PreparedStatementFinalizer {
    return this._statementFinalizer;
  }

  async start(): Promise<void> {
    if (this._started) {
      throw new Error(
        'ManagedStdioTransport already started! If using Server class, note that connect() calls start() automatically.'
      );
    }
    this._started = true;
    this._stdin.on('data', this._ondata);
    this._stdin.on('error', this._onerror);
  }

  private processReadBuffer(): void {
    while (!this._closed) {
      try {
        const message = this._readBuffer.readMessage();
        if (message === null) {
          break;
        }
        this.onmessage?.(message);
      } catch (error) {
        this.onerror?.(error as Error);
      }
    }
  }

  send(message: JSONRPCMessage, _options?: TransportSendOptions): Promise<void> {
    if (this._closed) {
      return Promise.reject(new Error('Cannot send message on closed ManagedStdioTransport'));
    }

    return new Promise((resolve, reject) => {
      try {
        const json = serializeMessage(message);
        if (this._stdout.write(json)) {
          resolve();
        } else {
          this._stdout.once('drain', resolve);
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  async close(): Promise<void> {
    if (this._closed) return;
    this._closed = true;

    // 1. Detach event listeners from input stream
    this._stdin.off('data', this._ondata);
    this._stdin.off('error', this._onerror);

    // 2. Pause stdin if no remaining data listeners
    if (typeof this._stdin.listenerCount === 'function') {
      const remaining = this._stdin.listenerCount('data');
      if (remaining === 0 && typeof (this._stdin as any).pause === 'function') {
        (this._stdin as any).pause();
      }
    }

    // 3. Explicitly purge read buffer memory
    this._readBuffer.clear();

    // 4. Finalize active prepared statements to free C-level allocations and locks
    if (this._autoFinalizeOnClose) {
      this._statementFinalizer.finalizeAll();
    }

    // 5. Invoke close callback
    this.onclose?.();
  }

  /**
   * Explicitly disposes all resources, listeners, statement pools, and callbacks.
   */
  async dispose(): Promise<void> {
    await this.close();
    this.onclose = undefined;
    this.onerror = undefined;
    this.onmessage = undefined;
  }
}
