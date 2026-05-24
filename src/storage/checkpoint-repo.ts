import { Database } from 'bun:sqlite';

export type CheckpointStatus = 'pending' | 'passed' | 'failed' | 'bypassed';

export interface CheckpointRecord {
  ticket_id: string;
  interception_id?: string | null;
  session_id?: string | null;
  file_path: string;
  question: string;
  concept: string;
  expected_keywords?: string[] | null;
  student_answer?: string | null;
  status: CheckpointStatus;
  evaluation_score?: number | null;
  evaluation_reason?: string | null;
  concept_score?: number | null;
  detected_keywords?: string[] | null;
  is_evasive?: boolean;
  created_at: string;
  resolved_at?: string | null;
}

export interface InsertCheckpointInput {
  ticketId: string;
  interceptionId?: string | null;
  sessionId?: string | null;
  filePath: string;
  question: string;
  concept: string;
  expectedKeywords?: string[] | null;
  status?: CheckpointStatus;
  conceptScore?: number | null;
  detectedKeywords?: string[] | null;
  isEvasive?: boolean;
  createdAt?: string;
}

export interface UpdateAnswerInput {
  ticketId: string;
  studentAnswer: string;
  conceptScore?: number | null;
  detectedKeywords?: string[] | null;
  isEvasive?: boolean;
}

export interface ResolveCheckpointInput {
  ticketId: string;
  status: 'passed' | 'failed' | 'bypassed';
  evaluationScore?: number | null;
  evaluationReason?: string | null;
  conceptScore?: number | null;
  detectedKeywords?: string[] | null;
  isEvasive?: boolean;
  resolvedAt?: string;
}

export class CheckpointRepository {
  constructor(private readonly db: Database) {}

  /**
   * Inserts a new checkpoint record into the database.
   */
  insertCheckpoint(input: InsertCheckpointInput): CheckpointRecord {
    const status: CheckpointStatus = input.status ?? 'pending';
    const createdAt = input.createdAt ?? new Date().toISOString();
    const expectedKeywordsJson = input.expectedKeywords
      ? JSON.stringify(input.expectedKeywords)
      : null;
    const detectedKeywordsJson = input.detectedKeywords
      ? JSON.stringify(input.detectedKeywords)
      : null;
    const isEvasive = input.isEvasive ? 1 : 0;
    const conceptScore = input.conceptScore !== undefined ? input.conceptScore : null;

    const stmt = this.db.prepare(`
      INSERT INTO checkpoints (
        ticket_id,
        interception_id,
        session_id,
        file_path,
        question,
        concept,
        expected_keywords,
        status,
        concept_score,
        detected_keywords,
        is_evasive,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      input.ticketId,
      input.interceptionId ?? null,
      input.sessionId ?? null,
      input.filePath,
      input.question,
      input.concept,
      expectedKeywordsJson,
      status,
      conceptScore,
      detectedKeywordsJson,
      isEvasive,
      createdAt
    );

    const created = this.getByTicketId(input.ticketId);
    if (!created) {
      throw new Error(`Failed to retrieve newly created checkpoint: ${input.ticketId}`);
    }
    return created;
  }

  /**
   * Retrieves a checkpoint record by its unique ticket ID.
   */
  getByTicketId(ticketId: string): CheckpointRecord | null {
    const stmt = this.db.prepare('SELECT * FROM checkpoints WHERE ticket_id = ?');
    const row = stmt.get(ticketId) as any;
    if (!row) return null;
    return this.mapRowToRecord(row);
  }

  /**
   * Records a student's answer for a pending checkpoint ticket.
   */
  recordAnswer(input: UpdateAnswerInput): CheckpointRecord {
    const detectedKeywordsJson =
      input.detectedKeywords !== undefined ? JSON.stringify(input.detectedKeywords) : null;
    const isEvasive = input.isEvasive !== undefined ? (input.isEvasive ? 1 : 0) : null;

    const stmt = this.db.prepare(`
      UPDATE checkpoints
      SET student_answer = ?,
          concept_score = COALESCE(?, concept_score),
          detected_keywords = COALESCE(?, detected_keywords),
          is_evasive = COALESCE(?, is_evasive)
      WHERE ticket_id = ?
    `);

    const result = stmt.run(
      input.studentAnswer,
      input.conceptScore !== undefined ? input.conceptScore : null,
      detectedKeywordsJson,
      isEvasive,
      input.ticketId
    );
    if (result.changes === 0) {
      throw new Error(`Checkpoint not found for ticket ID: ${input.ticketId}`);
    }

    const updated = this.getByTicketId(input.ticketId);
    if (!updated) {
      throw new Error(`Failed to retrieve updated checkpoint: ${input.ticketId}`);
    }
    return updated;
  }

  /**
   * Directly updates explanation quality scoring metrics on a checkpoint.
   */
  recordMetrics(input: {
    ticketId: string;
    conceptScore?: number | null;
    detectedKeywords?: string[] | null;
    isEvasive?: boolean;
  }): CheckpointRecord {
    const detectedKeywordsJson =
      input.detectedKeywords !== undefined ? JSON.stringify(input.detectedKeywords) : null;
    const isEvasive = input.isEvasive !== undefined ? (input.isEvasive ? 1 : 0) : null;

    const stmt = this.db.prepare(`
      UPDATE checkpoints
      SET concept_score = COALESCE(?, concept_score),
          detected_keywords = COALESCE(?, detected_keywords),
          is_evasive = COALESCE(?, is_evasive)
      WHERE ticket_id = ?
    `);

    const result = stmt.run(
      input.conceptScore !== undefined ? input.conceptScore : null,
      detectedKeywordsJson,
      isEvasive,
      input.ticketId
    );

    if (result.changes === 0) {
      throw new Error(`Checkpoint not found for ticket ID: ${input.ticketId}`);
    }

    const updated = this.getByTicketId(input.ticketId);
    if (!updated) {
      throw new Error(`Failed to retrieve updated checkpoint: ${input.ticketId}`);
    }
    return updated;
  }

  /**
   * Resolves a checkpoint with pass, fail, or bypassed status, recording evaluation score and reason.
   */
  resolveCheckpoint(input: ResolveCheckpointInput): CheckpointRecord {
    const resolvedAt = input.resolvedAt ?? new Date().toISOString();
    const conceptScore =
      input.conceptScore !== undefined
        ? input.conceptScore
        : input.evaluationScore !== undefined
        ? input.evaluationScore
        : null;
    const detectedKeywordsJson =
      input.detectedKeywords !== undefined ? JSON.stringify(input.detectedKeywords) : null;
    const isEvasive = input.isEvasive !== undefined ? (input.isEvasive ? 1 : 0) : null;

    const stmt = this.db.prepare(`
      UPDATE checkpoints
      SET status = ?,
          evaluation_score = ?,
          evaluation_reason = ?,
          concept_score = COALESCE(?, concept_score),
          detected_keywords = COALESCE(?, detected_keywords),
          is_evasive = COALESCE(?, is_evasive),
          resolved_at = ?
      WHERE ticket_id = ?
    `);

    const result = stmt.run(
      input.status,
      input.evaluationScore !== undefined ? input.evaluationScore : null,
      input.evaluationReason ?? null,
      conceptScore,
      detectedKeywordsJson,
      isEvasive,
      resolvedAt,
      input.ticketId
    );

    if (result.changes === 0) {
      throw new Error(`Checkpoint not found for ticket ID: ${input.ticketId}`);
    }

    const updated = this.getByTicketId(input.ticketId);
    if (!updated) {
      throw new Error(`Failed to retrieve resolved checkpoint: ${input.ticketId}`);
    }
    return updated;
  }


  /**
   * Lists checkpoints with optional filters.
   */
  listCheckpoints(options: {
    filePath?: string;
    sessionId?: string;
    status?: CheckpointStatus;
    concept?: string;
    limit?: number;
    offset?: number;
  } = {}): CheckpointRecord[] {
    const conditions: string[] = [];
    const params: any[] = [];

    if (options.filePath) {
      conditions.push('file_path = ?');
      params.push(options.filePath);
    }
    if (options.sessionId) {
      conditions.push('session_id = ?');
      params.push(options.sessionId);
    }
    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }
    if (options.concept) {
      conditions.push('concept = ?');
      params.push(options.concept);
    }

    let query = 'SELECT * FROM checkpoints';
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY created_at DESC';

    if (options.limit !== undefined) {
      query += ' LIMIT ?';
      params.push(options.limit);
      if (options.offset !== undefined) {
        query += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map((r) => this.mapRowToRecord(r));
  }

  private mapRowToRecord(row: any): CheckpointRecord {
    let expectedKeywords: string[] | null = null;
    if (row.expected_keywords) {
      try {
        expectedKeywords = JSON.parse(row.expected_keywords);
      } catch {
        expectedKeywords = null;
      }
    }

    let detectedKeywords: string[] | null = null;
    if (row.detected_keywords) {
      try {
        detectedKeywords = JSON.parse(row.detected_keywords);
      } catch {
        detectedKeywords = null;
      }
    }

    return {
      ticket_id: row.ticket_id,
      interception_id: row.interception_id,
      session_id: row.session_id,
      file_path: row.file_path,
      question: row.question,
      concept: row.concept,
      expected_keywords: expectedKeywords,
      student_answer: row.student_answer,
      status: row.status,
      evaluation_score:
        row.evaluation_score !== undefined && row.evaluation_score !== null
          ? Number(row.evaluation_score)
          : null,
      evaluation_reason: row.evaluation_reason,
      concept_score:
        row.concept_score !== undefined && row.concept_score !== null
          ? Number(row.concept_score)
          : null,
      detected_keywords: detectedKeywords,
      is_evasive: Boolean(row.is_evasive),
      created_at: row.created_at,
      resolved_at: row.resolved_at,
    };
  }
}

