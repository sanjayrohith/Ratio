import { Database } from 'bun:sqlite';

export interface SessionMetadata {
  filesTouched?: string[];
  toolCallCount?: number;
  checkpointsCount?: number;
  passedCount?: number;
  failedCount?: number;
  agentName?: string;
  [key: string]: any;
}

export interface SessionRecord {
  id: string;
  started_at: string;
  ended_at: string | null;
  metadata: SessionMetadata | null;
}

export interface InterceptionRecord {
  id: string;
  session_id: string | null;
  tool_name: string;
  file_path: string;
  staged_id: string;
  decision: 'checkpoint_required' | 'write_permitted';
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  reasons: string[] | null;
  layers: string[] | null;
  new_dependencies: string[] | null;
  line_delta: number;
  created_at: string;
}

export interface InsertInterceptionInput {
  id: string;
  sessionId?: string | null;
  toolName: string;
  filePath: string;
  stagedId: string;
  decision: 'checkpoint_required' | 'write_permitted';
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  reasons?: string[] | null;
  layers?: string[] | null;
  newDependencies?: string[] | null;
  lineDelta?: number;
  createdAt?: string;
}

export interface SessionStats {
  sessionId: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  filesTouched: string[];
  totalInterceptions: number;
  totalCheckpoints: number;
  passedCheckpoints: number;
  failedCheckpoints: number;
  pendingCheckpoints: number;
}

export class SessionRepository {
  constructor(private readonly db: Database) {}

  /**
   * Starts a new coding session with optional metadata.
   */
  startSession(sessionId: string, metadata?: SessionMetadata, startedAt?: string): SessionRecord {
    const start = startedAt ?? new Date().toISOString();
    const metaStr = metadata ? JSON.stringify(metadata) : null;

    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, started_at, metadata)
      VALUES (?, ?, ?)
    `);

    stmt.run(sessionId, start, metaStr);

    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Failed to create session: ${sessionId}`);
    }
    return session;
  }

  /**
   * Retrieves a session by ID.
   */
  getSession(sessionId: string): SessionRecord | null {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    const row = stmt.get(sessionId) as any;
    if (!row) return null;
    return this.mapRowToSession(row);
  }

  /**
   * Updates session metadata or marks session as ended.
   */
  endSession(sessionId: string, endedAt?: string, extraMetadata?: SessionMetadata): SessionRecord {
    const end = endedAt ?? new Date().toISOString();
    const existing = this.getSession(sessionId);
    if (!existing) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const mergedMetadata = {
      ...(existing.metadata ?? {}),
      ...(extraMetadata ?? {}),
    };

    const stmt = this.db.prepare(`
      UPDATE sessions
      SET ended_at = ?, metadata = ?
      WHERE id = ?
    `);

    stmt.run(end, JSON.stringify(mergedMetadata), sessionId);

    const updated = this.getSession(sessionId);
    if (!updated) {
      throw new Error(`Failed to retrieve ended session: ${sessionId}`);
    }
    return updated;
  }

  /**
   * Records an intercepted tool call under a session.
   */
  recordInterception(input: InsertInterceptionInput): InterceptionRecord {
    const createdAt = input.createdAt ?? new Date().toISOString();
    const reasonsJson = input.reasons ? JSON.stringify(input.reasons) : null;
    const layersJson = input.layers ? JSON.stringify(input.layers) : null;
    const depsJson = input.newDependencies ? JSON.stringify(input.newDependencies) : null;
    const lineDelta = input.lineDelta ?? 0;

    const stmt = this.db.prepare(`
      INSERT INTO interceptions (
        id,
        session_id,
        tool_name,
        file_path,
        staged_id,
        decision,
        risk_score,
        risk_level,
        reasons,
        layers,
        new_dependencies,
        line_delta,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      input.id,
      input.sessionId ?? null,
      input.toolName,
      input.filePath,
      input.stagedId,
      input.decision,
      input.riskScore,
      input.riskLevel,
      reasonsJson,
      layersJson,
      depsJson,
      lineDelta,
      createdAt
    );

    // If attached to a session, update session metadata with files touched
    if (input.sessionId) {
      const session = this.getSession(input.sessionId);
      if (session) {
        const touched = new Set<string>(session.metadata?.filesTouched ?? []);
        touched.add(input.filePath);
        const count = (session.metadata?.toolCallCount ?? 0) + 1;
        this.updateSessionMetadata(input.sessionId, {
          filesTouched: Array.from(touched),
          toolCallCount: count,
        });
      }
    }

    const created = this.getInterception(input.id);
    if (!created) {
      throw new Error(`Failed to retrieve recorded interception: ${input.id}`);
    }
    return created;
  }

  /**
   * Retrieves an interception record by ID.
   */
  getInterception(id: string): InterceptionRecord | null {
    const stmt = this.db.prepare('SELECT * FROM interceptions WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    return this.mapRowToInterception(row);
  }

  /**
   * Lists all interceptions for a given session.
   */
  listInterceptionsBySession(sessionId: string): InterceptionRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM interceptions
      WHERE session_id = ?
      ORDER BY created_at ASC
    `);
    const rows = stmt.all(sessionId) as any[];
    return rows.map((r) => this.mapRowToInterception(r));
  }

  /**
   * Computes aggregated session statistics (files touched, duration, checkpoints breakdown).
   */
  getSessionStats(sessionId: string): SessionStats | null {
    const session = this.getSession(sessionId);
    if (!session) return null;

    const filesTouchedQuery = this.db.prepare(`
      SELECT DISTINCT file_path FROM interceptions WHERE session_id = ?
    `).all(sessionId) as Array<{ file_path: string }>;

    const totalInterceptionsQuery = this.db.prepare(`
      SELECT COUNT(*) as count FROM interceptions WHERE session_id = ?
    `).get(sessionId) as { count: number };

    const checkpointStats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM checkpoints
      WHERE session_id = ?
    `).get(sessionId) as {
      total: number;
      passed: number | null;
      failed: number | null;
      pending: number | null;
    };

    let durationMs: number | null = null;
    if (session.started_at && session.ended_at) {
      durationMs = Math.max(
        0,
        new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()
      );
    }

    return {
      sessionId,
      startedAt: session.started_at,
      endedAt: session.ended_at,
      durationMs,
      filesTouched: filesTouchedQuery.map((r) => r.file_path),
      totalInterceptions: totalInterceptionsQuery?.count ?? 0,
      totalCheckpoints: checkpointStats?.total ?? 0,
      passedCheckpoints: checkpointStats?.passed ?? 0,
      failedCheckpoints: checkpointStats?.failed ?? 0,
      pendingCheckpoints: checkpointStats?.pending ?? 0,
    };
  }

  private updateSessionMetadata(sessionId: string, partialMetadata: SessionMetadata): void {
    const session = this.getSession(sessionId);
    if (!session) return;
    const merged = { ...(session.metadata ?? {}), ...partialMetadata };
    this.db.run('UPDATE sessions SET metadata = ? WHERE id = ?', [
      JSON.stringify(merged),
      sessionId,
    ]);
  }

  private mapRowToSession(row: any): SessionRecord {
    let metadata: SessionMetadata | null = null;
    if (row.metadata) {
      try {
        metadata = JSON.parse(row.metadata);
      } catch {
        metadata = null;
      }
    }
    return {
      id: row.id,
      started_at: row.started_at,
      ended_at: row.ended_at,
      metadata,
    };
  }

  private mapRowToInterception(row: any): InterceptionRecord {
    const parseJson = (val: any) => {
      if (!val) return null;
      try {
        return JSON.parse(val);
      } catch {
        return null;
      }
    };

    return {
      id: row.id,
      session_id: row.session_id,
      tool_name: row.tool_name,
      file_path: row.file_path,
      staged_id: row.staged_id,
      decision: row.decision,
      risk_score: row.risk_score,
      risk_level: row.risk_level,
      reasons: parseJson(row.reasons),
      layers: parseJson(row.layers),
      new_dependencies: parseJson(row.new_dependencies),
      line_delta: row.line_delta,
      created_at: row.created_at,
    };
  }
}
