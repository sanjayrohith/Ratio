import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { PassThrough } from 'node:stream';
import { Database } from 'bun:sqlite';
import {
  ManagedStdioTransport,
  PreparedStatementFinalizer,
} from '../../src/server/transport.js';

describe('Managed Stdio Transport & Resource Disposal Tests', () => {
  let db: Database;
  let finalizer: PreparedStatementFinalizer;

  beforeEach(() => {
    db = new Database(':memory:');
    db.run('CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT);');
    db.run("INSERT INTO items (name) VALUES ('item-1'), ('item-2');");
    finalizer = new PreparedStatementFinalizer();
  });

  afterEach(() => {
    finalizer.finalizeAll();
    try {
      db.close();
    } catch {
      // Ignore if closed
    }
  });

  describe('PreparedStatementFinalizer', () => {
    it('registers prepared statements and tracks size', () => {
      const stmt1 = finalizer.prepare(db, 'SELECT * FROM items WHERE id = ?');
      const stmt2 = finalizer.prepare(db, 'SELECT name FROM items');

      expect(finalizer.size).toBe(2);
      expect(finalizer.has(stmt1)).toBe(true);
      expect(finalizer.has(stmt2)).toBe(true);

      const rows = stmt2.all();
      expect(rows.length).toBe(2);
    });

    it('finalizes individual statement cleanly', () => {
      const stmt = finalizer.prepare(db, 'SELECT * FROM items WHERE id = ?');
      expect(finalizer.has(stmt)).toBe(true);

      const result = finalizer.finalize(stmt);
      expect(result).toBe(true);
      expect(finalizer.has(stmt)).toBe(false);
      expect(finalizer.size).toBe(0);

      // Finalizing an unmanaged or already finalized statement returns false
      expect(finalizer.finalize(stmt)).toBe(false);
    });

    it('finalizes all registered statements at once', () => {
      finalizer.prepare(db, 'SELECT * FROM items WHERE id = 1');
      finalizer.prepare(db, 'SELECT * FROM items WHERE id = 2');
      finalizer.prepare(db, 'SELECT count(*) FROM items');

      expect(finalizer.size).toBe(3);
      const count = finalizer.finalizeAll();
      expect(count).toBe(3);
      expect(finalizer.size).toBe(0);
    });

    it('handles statements on closed databases without throwing', () => {
      const stmt = finalizer.prepare(db, 'SELECT 1');
      db.close();
      expect(() => {
        finalizer.finalizeAll();
      }).not.toThrow();
      expect(finalizer.size).toBe(0);
    });
  });

  describe('ManagedStdioTransport', () => {
    it('initializes, receives messages, and writes serialised responses', async () => {
      const stdin = new PassThrough();
      const stdout = new PassThrough();
      const transport = new ManagedStdioTransport(stdin, stdout);

      const receivedMessages: any[] = [];
      transport.onmessage = (msg) => {
        receivedMessages.push(msg);
      };

      await transport.start();

      // Send JSON-RPC message into stdin
      const rpcReq = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };
      stdin.write(JSON.stringify(rpcReq) + '\n');

      // Wait a tick for event emission
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(receivedMessages.length).toBe(1);
      expect(receivedMessages[0].id).toBe(1);
      expect(receivedMessages[0].method).toBe('tools/list');

      // Send response back
      const writtenChunks: string[] = [];
      stdout.on('data', (chunk) => {
        writtenChunks.push(chunk.toString('utf-8'));
      });

      const rpcRes: any = { jsonrpc: '2.0', id: 1, result: { tools: [] } };
      await transport.send(rpcRes);

      expect(writtenChunks.join('')).toContain('"jsonrpc":"2.0"');
      expect(writtenChunks.join('')).toContain('"id":1');

      await transport.close();
    });

    it('detaches listeners and finalizes prepared statements on close', async () => {
      const stdin = new PassThrough();
      const stdout = new PassThrough();

      const stmt1 = finalizer.prepare(db, 'SELECT 1');
      const stmt2 = finalizer.prepare(db, 'SELECT 2');
      expect(finalizer.size).toBe(2);

      const transport = new ManagedStdioTransport(stdin, stdout, {
        statementFinalizer: finalizer,
        autoFinalizeOnClose: true,
      });

      let closedCalled = false;
      transport.onclose = () => {
        closedCalled = true;
      };

      await transport.start();
      expect(stdin.listenerCount('data')).toBeGreaterThan(0);

      await transport.close();

      expect(closedCalled).toBe(true);
      expect(transport.isClosed).toBe(true);
      // Listeners detached
      expect(stdin.listenerCount('data')).toBe(0);
      // Statements finalized
      expect(finalizer.size).toBe(0);
    });

    it('rejects sending messages when closed', async () => {
      const stdin = new PassThrough();
      const stdout = new PassThrough();
      const transport = new ManagedStdioTransport(stdin, stdout);

      await transport.start();
      await transport.close();

      expect(
        transport.send({ jsonrpc: '2.0', id: 1, method: 'ping' } as any)
      ).rejects.toThrow('Cannot send message on closed ManagedStdioTransport');
    });

    it('disposes transport and clears callback references', async () => {
      const stdin = new PassThrough();
      const stdout = new PassThrough();
      const transport = new ManagedStdioTransport(stdin, stdout);

      let closed = false;
      transport.onclose = () => {
        closed = true;
      };
      transport.onerror = () => {};
      transport.onmessage = () => {};

      await transport.start();
      await transport.dispose();

      expect(closed).toBe(true);
      expect(transport.onclose).toBeUndefined();
      expect(transport.onerror).toBeUndefined();
      expect(transport.onmessage).toBeUndefined();
    });
  });
});
