import { EventEmitter } from 'node:events';
import type {
  InterceptorEvent,
  InterceptorEventType,
  WriteInterceptedEvent,
  CheckpointTriggeredEvent,
  AnswerSubmittedEvent,
  CheckpointResolvedEvent,
  WriteCommittedEvent,
  WriteRolledBackEvent,
} from '../types/events.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  meta?: Record<string, unknown>;
}

export type LogWriter = (entry: LogEntry, formatted: string) => void;

export interface LoggerOptions {
  level?: LogLevel;
  debug?: boolean;
  writer?: LogWriter;
  prefix?: string;
}

/**
 * High-performance structured logger designed for Ratio MCP and CLI operations.
 * When RATIO_DEBUG=1 is set, produces rich formatted debug tracing.
 * Directs logs to stderr to keep MCP stdio transport clean.
 */
export class RatioLogger {
  private level: LogLevel;
  private writer: LogWriter;
  private prefix: string;

  constructor(options: LoggerOptions = {}) {
    const isDebugEnv =
      typeof process !== 'undefined' &&
      Boolean(
        process.env.RATIO_DEBUG === '1' ||
          process.env.RATIO_DEBUG === 'true' ||
          process.env.DEBUG === 'ratio'
      );

    this.level =
      options.level ??
      (options.debug !== undefined
        ? options.debug
          ? 'debug'
          : 'info'
        : isDebugEnv
        ? 'debug'
        : 'info');

    this.prefix = options.prefix ?? 'RATIO';

    this.writer =
      options.writer ??
      ((_entry, formatted) => {
        // Critical: Write exclusively to stderr to avoid corrupting MCP JSON-RPC messages on stdout
        if (typeof process !== 'undefined' && process.stderr) {
          process.stderr.write(formatted + '\n');
        }
      });
  }

  public isDebugEnabled(): boolean {
    return this.level === 'debug';
  }

  public setLevel(level: LogLevel): void {
    this.level = level;
  }

  public getLevel(): LogLevel {
    return this.level;
  }

  public setWriter(writer: LogWriter): void {
    this.writer = writer;
  }

  private shouldLog(level: LogLevel): boolean {
    const priorities: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
      silent: 4,
    };
    return priorities[level] >= priorities[this.level];
  }

  public format(entry: LogEntry): string {
    const time = entry.timestamp;
    const tag = `[${this.prefix}:${entry.level.toUpperCase()}]`;
    const metaStr =
      entry.meta && Object.keys(entry.meta).length > 0
        ? ' ' + JSON.stringify(entry.meta)
        : '';
    return `${time} ${tag} ${entry.message}${metaStr}`;
  }

  public log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      meta,
    };
    this.writer(entry, this.format(entry));
  }

  public debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta);
  }

  public info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }

  public warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }

  public error(message: string, errorOrMeta?: Error | Record<string, unknown>): void {
    let meta: Record<string, unknown> | undefined;
    if (errorOrMeta instanceof Error) {
      meta = {
        name: errorOrMeta.name,
        errorMessage: errorOrMeta.message,
        stack: errorOrMeta.stack,
      };
    } else {
      meta = errorOrMeta;
    }
    this.log('error', message, meta);
  }

  /**
   * Times an async or synchronous operation and logs start, finish, or error with latency.
   */
  public async trace<T>(
    operationName: string,
    action: () => Promise<T> | T,
    meta?: Record<string, unknown>
  ): Promise<T> {
    const start = performance.now();
    this.debug(`Starting ${operationName}`, meta);
    try {
      const result = await action();
      const elapsedMs = Number((performance.now() - start).toFixed(2));
      this.debug(`Finished ${operationName}`, { ...meta, elapsedMs });
      return result;
    } catch (err: any) {
      const elapsedMs = Number((performance.now() - start).toFixed(2));
      this.error(`Failed ${operationName}`, {
        ...meta,
        elapsedMs,
        errorMessage: err?.message,
      });
      throw err;
    }
  }
}

export type InterceptorEventMap = {
  write_intercepted: WriteInterceptedEvent;
  checkpoint_triggered: CheckpointTriggeredEvent;
  answer_submitted: AnswerSubmittedEvent;
  checkpoint_passed: CheckpointResolvedEvent;
  checkpoint_failed: CheckpointResolvedEvent;
  write_committed: WriteCommittedEvent;
  write_rolled_back: WriteRolledBackEvent;
  event: InterceptorEvent;
};

/**
 * Typed event emitter coordinating interceptor lifecycle events across Ratio subsystems.
 */
export class RatioEventEmitter extends EventEmitter {
  constructor(private readonly logger: RatioLogger = defaultLogger) {
    super();
  }

  /**
   * Emits an interceptor lifecycle event and logs trace info when debug is enabled.
   */
  public emitEvent(event: InterceptorEvent): boolean {
    if (this.logger.isDebugEnabled()) {
      this.logger.debug(`Event emitted: ${event.type}`, {
        file: event.file,
        eventId: event.id,
        sessionId: event.sessionId,
      });
    }

    this.emit(event.type, event);
    return this.emit('event', event);
  }

  public onEvent(handler: (event: InterceptorEvent) => void): this {
    return this.on('event', handler);
  }

  public onType<K extends InterceptorEventType>(
    type: K,
    handler: (event: InterceptorEventMap[K]) => void
  ): this {
    return this.on(type, handler as (...args: any[]) => void);
  }
}

export const defaultLogger = new RatioLogger();
export const defaultEventEmitter = new RatioEventEmitter(defaultLogger);
