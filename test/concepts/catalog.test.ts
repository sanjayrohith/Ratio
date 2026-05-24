import { describe, it, expect } from 'bun:test';
import {
  ConceptId,
  CONCEPT_DEFINITIONS,
} from '../../src/core/concepts/taxonomy.js';
import {
  QUESTION_CATALOG,
} from '../../src/core/concepts/catalog.js';
import {
  QuestionSelector,
} from '../../src/core/concepts/selector.js';

describe('Socratic Question Bank & Concept Taxonomy Unit Tests', () => {
  const allConceptIds = Object.values(ConceptId);

  it('contains defined full-stack concepts with metadata', () => {
    expect(allConceptIds.length).toBeGreaterThanOrEqual(15);

    for (const id of allConceptIds) {
      const def = CONCEPT_DEFINITIONS[id];
      expect(def).toBeDefined();
      expect(def.id).toBe(id);
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.category).toBeDefined();
      expect(def.description.length).toBeGreaterThan(10);
      expect(def.architecturalRisks.length).toBeGreaterThan(0);
      expect(def.recommendedPatterns.length).toBeGreaterThan(0);
    }
  });

  it('provides at least one valid probing question with expected keywords for every concept', () => {
    for (const id of allConceptIds) {
      const questions = QUESTION_CATALOG[id];
      expect(questions).toBeDefined();
      expect(questions.length).toBeGreaterThanOrEqual(1);

      for (const q of questions) {
        expect(q.id).toBeDefined();
        expect(q.conceptId).toBe(id);
        expect(q.question.length).toBeGreaterThan(20);
        expect(q.hint.length).toBeGreaterThan(10);
        expect(q.focus).toMatch(/^(rationale|mechanism|tradeoff)$/);
        expect(q.expectedKeywords.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('selects appropriate questions based on diff content triggers', () => {
    const selector = new QuestionSelector();

    // JWT token logic
    const jwtSelection = selector.select({
      filePath: 'src/services/token.ts',
      layers: ['core'],
      contentDiff: 'const token = jsonwebtoken.sign({ userId }, process.env.SECRET);',
    });
    expect(jwtSelection.conceptId).toBe(ConceptId.JWT_SECRET_HYGIENE);
    expect(jwtSelection.question.question).toContain('JWT');

    // Password hashing
    const pwdSelection = selector.select({
      filePath: 'src/services/auth.ts',
      layers: ['auth'],
      contentDiff: 'const hash = await bcrypt.hash(password, salt);',
    });
    expect(pwdSelection.conceptId).toBe(ConceptId.PASSWORD_HASHING_SALT);

    // SQL Injection / string interpolation
    const sqlSelection = selector.select({
      filePath: 'src/db/users.ts',
      layers: ['db'],
      contentDiff: 'const res = db.query(`SELECT * FROM users WHERE id = ${userId}`);',
    });
    expect(sqlSelection.conceptId).toBe(ConceptId.SQL_INJECTION_PREVENTION);

    // Database Migration
    const migrationSelection = selector.select({
      filePath: 'migrations/001.sql',
      layers: ['db'],
      contentDiff: 'ALTER TABLE users ADD COLUMN is_admin BOOLEAN;',
    });
    expect(migrationSelection.conceptId).toBe(ConceptId.DB_MIGRATION_IDEMPOTENCY);

    // Rate Limiting
    const rateLimitSelection = selector.select({
      filePath: 'src/middleware/rate-limiter.ts',
      layers: ['api'],
      contentDiff: 'app.use(limiter({ max: 100 }));',
    });
    expect(rateLimitSelection.conceptId).toBe(ConceptId.RATE_LIMITING_DOS);

    // Worker queue
    const workerSelection = selector.select({
      filePath: 'src/jobs/email.ts',
      layers: ['worker'],
      contentDiff: 'new Worker("emailQueue", async (job) => { sendEmail(job.data); });',
    });
    expect(workerSelection.conceptId).toBe(ConceptId.BACKGROUND_JOB_RETRY_IDEMPOTENCY);
  });

  it('falls back to architectural layer heuristics when content diff has no specific tokens', () => {
    const selector = new QuestionSelector();

    const authFallback = selector.select({
      filePath: 'src/auth/guard.ts',
      layers: ['auth'],
      contentDiff: '// Clean refactoring with no explicit keywords',
    });
    expect(authFallback.conceptId).toBe(ConceptId.JWT_SECRET_HYGIENE);

    const dbFallback = selector.select({
      filePath: 'src/db/repo.ts',
      layers: ['db'],
      contentDiff: '// Minor database helper tweaks',
    });
    expect(dbFallback.conceptId).toBe(ConceptId.DB_MIGRATION_IDEMPOTENCY);

    const genericFallback = selector.select({
      filePath: 'src/utils/format.ts',
      layers: ['core'],
      contentDiff: '// Generic string manipulation',
    });
    expect(genericFallback.conceptId).toBe(ConceptId.ASYNC_WATERFALL_MITIGATION);
  });
});
