import { describe, it, expect, beforeEach } from 'bun:test';
import {
  RatioLogger,
  RatioEventEmitter,
  defaultLogger,
  defaultEventEmitter,
  type LogEntry,
} from '../../src/core/logger.js';
import type { CheckpointTriggeredEvent, WriteInterceptedEvent } from '../../src/types/events.js';

describe('Ratio Logger & Event Emitter Unit Tests', () => {
  let capturedEntries: LogEntry[];
  let capturedFormatted: string[];
  let logger: RatioLogger;

  beforeEach(() => {
    capturedEntries = [];
    capturedFormatted = [];
    logger = new RatioLogger({
      level: 'debug',
      writer: (entry, formatted) => {
        capturedEntries.push(entry);
        capturedFormatted.push(formatted);
      },
    });
  });

  describe('RatioLogger Level & Output Filtering', () => {
    it('logs debug, info, warn, error messages when level is debug', () => {
      logger.debug('Testing debug', { key: 'val' });
      logger.info('Testing info');
      logger.warn('Testing warn');
      logger.error('Testing error', new Error('Test failure'));

      expect(capturedEntries).toHaveLength(4);
      expect(capturedEntries[0].level).toBe('debug');
      expect(capturedEntries[0].message).toBe('Testing debug');
      expect(capturedEntries[0].meta).toEqual({ key: 'val' });

      expect(capturedEntries[1].level).toBe('info');
      expect(capturedEntries[2].level).toBe('warn');
      expect(capturedEntries[3].level).toBe('error');
      expect(capturedEntries[3].meta).toHaveProperty('errorMessage', 'Test failure');
    });

    it('silences debug logs when level is info or higher', () => {
      logger.setLevel('info');
      logger.debug('This should be suppressed');
      logger.info('This should be logged');

      expect(capturedEntries).toHaveLength(1);
      expect(capturedEntries[0].level).toBe('info');
      expect(capturedEntries[0].message).toBe('This should be logged');
    });

    it('silences debug and info when level is warn', () => {
      logger.setLevel('warn');
      logger.debug('Suppressed');
      logger.info('Suppressed');
      logger.warn('Warning emitted');
      logger.error('Error emitted');

      expect(capturedEntries).toHaveLength(2);
      expect(capturedEntries[0].level).toBe('warn');
      expect(capturedEntries[1].level).toBe('error');
    });

    it('silences everything when level is silent', () => {
      logger.setLevel('silent');
      logger.debug('none');
      logger.info('none');
      logger.warn('none');
      logger.error('none');

      expect(capturedEntries).toHaveLength(0);
    });

    it('formats log entries with timestamp, prefix, level, and metadata', () => {
      logger.info('Server connected', { port: 3000 });
      expect(capturedFormatted).toHaveLength(1);

      const formatted = capturedFormatted[0];
      expect(formatted).toMatch(/\[RATIO:INFO\] Server connected \{"port":3000\}/);
    });

    it('detects RATIO_DEBUG=1 from environment when level is not explicitly set', () => {
      const original = process.env.RATIO_DEBUG;
      try {
        process.env.RATIO_DEBUG = '1';
        const envLogger = new RatioLogger();
        expect(envLogger.isDebugEnabled()).toBe(true);
        expect(envLogger.getLevel()).toBe('debug');
      } finally {
        if (original !== undefined) {
          process.env.RATIO_DEBUG = original;
        } else {
          delete process.env.RATIO_DEBUG;
        }
      }
    });
  });

  describe('RatioLogger Trace Operation Timing', () => {
    it('times synchronous and asynchronous blocks and logs duration', async () => {
      const result = await logger.trace('database_query', async () => {
        await new Promise((r) => setTimeout(r, 10));
        return { rows: 42 };
      });

      expect(result).toEqual({ rows: 42 });
      expect(capturedEntries).toHaveLength(2);
      expect(capturedEntries[0].message).toBe('Starting database_query');
      expect(capturedEntries[1].message).toBe('Finished database_query');
      expect(capturedEntries[1].meta?.elapsedMs).toBeGreaterThanOrEqual(5);
    });

    it('catches and rethrows errors while logging failure in trace', async () => {
      expect(async () => {
        await logger.trace('failing_op', () => {
          throw new Error('Database connection reset');
        });
      }).toThrow('Database connection reset');

      expect(capturedEntries).toHaveLength(2);
      expect(capturedEntries[0].message).toBe('Starting failing_op');
      expect(capturedEntries[1].level).toBe('error');
      expect(capturedEntries[1].message).toBe('Failed failing_op');
      expect(capturedEntries[1].meta?.errorMessage).toBe('Database connection reset');
    });
  });

  describe('RatioEventEmitter Typed Events', () => {
    let emitter: RatioEventEmitter;

    beforeEach(() => {
      emitter = new RatioEventEmitter(logger);
    });

    it('dispatches typed interceptor lifecycle events to specific handlers', () => {
      const received: CheckpointTriggeredEvent[] = [];

      emitter.onType('checkpoint_triggered', (event) => {
        received.push(event);
      });

      const event: CheckpointTriggeredEvent = {
        id: 'evt_001',
        type: 'checkpoint_triggered',
        timestamp: new Date().toISOString(),
        file: 'src/models/user.ts',
        ticketId: 'chk_123',
        question: 'Explain schema migration',
        concept: 'DATABASE_MIGRATION',
      };

      emitter.emitEvent(event);

      expect(received).toHaveLength(1);
      expect(received[0].ticketId).toBe('chk_123');
      expect(received[0].file).toBe('src/models/user.ts');

      // Verify debug trace was logged
      expect(capturedEntries.some((e) => e.message.includes('Event emitted: checkpoint_triggered'))).toBe(true);
    });

    it('dispatches all events to general onEvent listener', () => {
      const allEvents: any[] = [];
      emitter.onEvent((ev) => allEvents.push(ev));

      const ev1: WriteInterceptedEvent = {
        id: 'evt_w1',
        type: 'write_intercepted',
        timestamp: new Date().toISOString(),
        file: 'src/index.ts',
        lineDelta: 15,
        layers: ['api'],
        newDependencies: [],
      };

      const ev2: CheckpointTriggeredEvent = {
        id: 'evt_c1',
        type: 'checkpoint_triggered',
        timestamp: new Date().toISOString(),
        file: 'src/index.ts',
        ticketId: 'chk_999',
        question: 'Explain routing',
        concept: 'API_ROUTING',
      };

      emitter.emitEvent(ev1);
      emitter.emitEvent(ev2);

      expect(allEvents).toHaveLength(2);
      expect(allEvents[0].type).toBe('write_intercepted');
      expect(allEvents[1].type).toBe('checkpoint_triggered');
    });

    it('exposes singleton instances defaultLogger and defaultEventEmitter', () => {
      expect(defaultLogger).toBeDefined();
      expect(defaultEventEmitter).toBeDefined();
      expect(typeof defaultLogger.info).toBe('function');
      expect(typeof defaultEventEmitter.emitEvent).toBe('function');
    });
  });
});
