import { describe, expect, it } from 'bun:test';
import { ConceptId } from '../../src/core/concepts/taxonomy.js';
import { ConceptMatcher } from '../../src/core/evaluation/matcher.js';
import {
  FollowUpGenerator,
  defaultFollowUpGenerator,
} from '../../src/core/evaluation/follow-up.js';

describe('FollowUpGenerator Unit Tests', () => {
  const matcher = new ConceptMatcher();
  const generator = new FollowUpGenerator();

  it('generates evasion follow-up when answer is an evasive shortcut', () => {
    const evaluation = matcher.evaluate(ConceptId.JWT_SECRET_HYGIENE, 'idk just write it');
    expect(evaluation.isEvasive).toBe(true);

    const followUp = generator.generate({
      ticketId: 'chk_123',
      filePath: 'src/middleware/auth.ts',
      evaluation,
      originalQuestion: 'Why must the JWT secret live in environment variables?',
      conceptId: ConceptId.JWT_SECRET_HYGIENE,
      attempt: 1,
    });

    expect(followUp.status).toBe('checkpoint_required');
    expect(followUp.ticketId).toBe('chk_123');
    expect(followUp.file).toBe('src/middleware/auth.ts');
    expect(followUp.isEvasive).toBe(true);
    expect(followUp.question).toContain('Evasive non-answer detected');
    expect(followUp.question).toContain('src/middleware/auth.ts');
    expect(followUp.hint).toContain('Avoid shortcuts like "idk"');
    expect(followUp.instruction).toContain('Relay this graduated follow-up question');
  });

  it('generates shallow answer rejection when no mechanisms are addressed', () => {
    const evaluation = matcher.evaluate(
      ConceptId.DB_MIGRATION_IDEMPOTENCY,
      'This migration file modifies the users table.'
    );
    expect(evaluation.passed).toBe(false);
    expect(evaluation.matchedMechanisms.length).toBe(0);

    const followUp = generator.generate({
      ticketId: 'chk_456',
      filePath: 'migrations/001_create_users.sql',
      evaluation,
      originalQuestion: 'What makes this migration idempotent?',
      conceptId: ConceptId.DB_MIGRATION_IDEMPOTENCY,
      attempt: 2,
    });

    expect(followUp.status).toBe('checkpoint_required');
    expect(followUp.attempt).toBe(2);
    expect(followUp.question).toContain('did not cover the required architectural mechanisms');
    expect(followUp.question).toContain('migrations/001_create_users.sql');
    expect(followUp.hint).toContain('Hint:');
  });

  it('generates partial follow-up acknowledging matched mechanisms and probing missing ones', () => {
    // Only mentions process.env (Environment isolation), misses Git leak / signature integrity
    const evaluation = matcher.evaluate(
      ConceptId.JWT_SECRET_HYGIENE,
      'The secret is stored in process.env.'
    );
    expect(evaluation.passed).toBe(false);
    expect(evaluation.matchedMechanisms).toContain('Environment / Storage Isolation');

    const followUp = generator.generate({
      ticketId: 'chk_789',
      filePath: 'src/config/jwt.ts',
      evaluation,
      originalQuestion: 'Why must the JWT secret live in environment variables?',
      conceptId: ConceptId.JWT_SECRET_HYGIENE,
      attempt: 1,
    });

    expect(followUp.status).toBe('checkpoint_required');
    expect(followUp.question).toContain('Good start mentioning Environment / Storage Isolation');
    expect(followUp.question).toContain('explain how "src/config/jwt.ts" addresses:');
    expect(followUp.missingMechanisms).toContain('Exposure / Git Leak Prevention');
  });

  it('exports defaultFollowUpGenerator singleton', () => {
    expect(defaultFollowUpGenerator).toBeInstanceOf(FollowUpGenerator);
  });
});
