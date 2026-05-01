import { Database } from 'bun:sqlite';
import { CheckpointRecord, CheckpointStatus } from './checkpoint-repo.js';

export interface CheckpointQueryFilter {
  filePath?: string;
  sessionId?: string;
  status?: CheckpointStatus;
  concept?: string;
  dateFrom?: string;
  dateTo?: string;
  keyword?: string; // FTS5 full text search term
}

export interface PaginationOptions {
  page?: number; // 1-indexed, default 1
  pageSize?: number; // default 20
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export class CheckpointQueryService {
  constructor(private readonly db: Database) {}

  /**
   * Queries checkpoints supporting filtering by file path, date ranges, concept,
   * status, full-text keyword matching (via FTS5), and pagination.
   */
  query(
    filter: CheckpointQueryFilter = {},
    pagination: PaginationOptions = {}
  ): PaginatedResult<CheckpointRecord> {
    const page = Math.max(1, pagination.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, pagination.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: any[] = [];

    // FTS5 join if keyword search is requested
    let fromClause = 'checkpoints c';
    if (filter.keyword && filter.keyword.trim().length > 0) {
      // Escape special characters for FTS5 prefix / token search
      const sanitized = filter.keyword.trim().replace(/"/g, '""');
      fromClause = `checkpoints c JOIN checkpoints_fts fts ON fts.rowid = c.rowid`;
      conditions.push(`checkpoints_fts MATCH ?`);
      params.push(`"${sanitized}"*`);
    }

    if (filter.filePath) {
      conditions.push('c.file_path = ?');
      params.push(filter.filePath);
    }

    if (filter.sessionId) {
      conditions.push('c.session_id = ?');
      params.push(filter.sessionId);
    }

    if (filter.status) {
      conditions.push('c.status = ?');
      params.push(filter.status);
    }

    if (filter.concept) {
      conditions.push('c.concept = ?');
      params.push(filter.concept);
    }

    if (filter.dateFrom) {
      conditions.push('c.created_at >= ?');
      params.push(filter.dateFrom);
    }

    if (filter.dateTo) {
      conditions.push('c.created_at <= ?');
      params.push(filter.dateTo);
    }

    const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

    // Count query
    const countSql = `SELECT COUNT(*) as total FROM ${fromClause}${whereClause}`;
    const countRow = this.db.prepare(countSql).get(...params) as { total: number };
    const total = countRow?.total ?? 0;

    // Data query
    const dataSql = `
      SELECT c.* FROM ${fromClause}${whereClause}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const dataRows = this.db.prepare(dataSql).all(...params, pageSize, offset) as any[];

    const data: CheckpointRecord[] = dataRows.map((row) => this.mapRowToRecord(row));
    const totalPages = Math.ceil(total / pageSize) || 1;

    return {
      data,
      total,
      page,
      pageSize,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
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
      evaluation_score: row.evaluation_score,
      evaluation_reason: row.evaluation_reason,
      created_at: row.created_at,
      resolved_at: row.resolved_at,
    };
  }
}
