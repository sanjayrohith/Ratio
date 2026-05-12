import { describe, expect, it } from 'bun:test';
import { ConceptId } from '../../src/core/concepts/taxonomy.js';
import { ConceptMatcher, defaultConceptMatcher } from '../../src/core/evaluation/matcher.js';
import { isEvasionAnswer } from '../../src/core/evaluation/rubrics.js';

describe('Deterministic Concept Matcher & Evaluation Engine Unit Tests', () => {
  const matcher = new ConceptMatcher();

  describe('Evasive shortcut detection and rejection', () => {
    const evasiveAnswers = [
      'idk',
      'IDK',
      "i don't know",
      'i dont know',
      'no idea',
      'not sure',
      'just do it',
      'just write it',
      'just code it',
      'skip',
      'pass',
      'bypass',
      'whatever',
      'who cares',
      'yolo',
      'shrug',
      'dunno',
      'no clue',
      'leave me alone',
      'force write',
      'n/a',
      'na',
      'skip question',
      'bypass check',
      'who knows',
      'just approve',
      'idk just write the file please',
      'i dont know whatever',
      'skip this question',
    ];

    it.each(evasiveAnswers)('flags evasive shortcut "%s" with isEvasive: true and score 0', (answer) => {
      expect(isEvasionAnswer(answer)).toBe(true);

      const result = matcher.evaluate(ConceptId.JWT_SECRET_HYGIENE, answer);
      expect(result.passed).toBe(false);
      expect(result.isEvasive).toBe(true);
      expect(result.score).toBe(0);
      expect(result.matchedMechanisms.length).toBe(0);
      expect(result.feedback).toContain('evasive shortcut');
    });

    it('rejects empty or whitespace-only answers', () => {
      const emptyResult = matcher.evaluate(ConceptId.JWT_SECRET_HYGIENE, '');
      expect(emptyResult.passed).toBe(false);
      expect(emptyResult.isEvasive).toBe(true);
      expect(emptyResult.score).toBe(0);

      const whitespaceResult = matcher.evaluate(ConceptId.JWT_SECRET_HYGIENE, '    \n\t  ');
      expect(whitespaceResult.passed).toBe(false);
      expect(whitespaceResult.isEvasive).toBe(true);
    });

    it('rejects extremely terse non-answers', () => {
      const result = matcher.evaluate(ConceptId.JWT_SECRET_HYGIENE, 'uh');
      expect(result.passed).toBe(false);
      expect(result.isEvasive).toBe(true);
    });
  });

  describe('Genuine explanations across core full-stack concepts', () => {
    it('approves genuine explanation for JWT_SECRET_HYGIENE', () => {
      const answer =
        'The JWT secret must be stored in process.env so it is not committed to git and leaked to attackers who could forge tokens.';
      const result = matcher.evaluate(ConceptId.JWT_SECRET_HYGIENE, answer);

      expect(result.passed).toBe(true);
      expect(result.isEvasive).toBe(false);
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.matchedMechanisms).toContain('Environment / Storage Isolation');
      expect(result.matchedMechanisms).toContain('Exposure / Git Leak Prevention');
      expect(result.feedback).toContain('Solid explanation');
    });

    it('approves genuine explanation for SQL_INJECTION_PREVENTION', () => {
      const answer =
        'Parameterized queries separate SQL query compilation from user data using prepared statements so arbitrary inputs cannot alter the AST.';
      const result = matcher.evaluate(ConceptId.SQL_INJECTION_PREVENTION, answer);

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.matchedMechanisms).toContain('Parameterization & Prepared Statements');
      expect(result.matchedMechanisms).toContain('Code vs Data Separation');
    });

    it('approves genuine explanation for DB_MIGRATION_IDEMPOTENCY', () => {
      const answer =
        'An idempotent migration can be safely retried without errors or duplicate tables if an automated deployment pipeline fails midway.';
      const result = matcher.evaluate(ConceptId.DB_MIGRATION_IDEMPOTENCY, answer);

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.matchedMechanisms).toContain('Idempotency & Safe Retries');
      expect(result.matchedMechanisms).toContain('Failure & Pipeline Reliability');
    });

    it('approves genuine explanation for ASYNC_WATERFALL_MITIGATION', () => {
      const answer =
        'Sequential awaits cause an async waterfall that accumulates response latency; running independent calls in parallel with Promise.all improves throughput.';
      const result = matcher.evaluate(ConceptId.ASYNC_WATERFALL_MITIGATION, answer);

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.matchedMechanisms).toContain('Waterfall & Sequential Latency');
      expect(result.matchedMechanisms).toContain('Parallel & Concurrent Execution');
    });

    it('approves genuine explanation for CONNECTION_POOL_MANAGEMENT', () => {
      const answer =
        'Connection pool exhaustion happens when unclosed client sockets leak, causing starvation when new requests try to acquire a connection.';
      const result = matcher.evaluate(ConceptId.CONNECTION_POOL_MANAGEMENT, answer);

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.matchedMechanisms).toContain('Connection Exhaustion & Leaks');
      expect(result.matchedMechanisms).toContain('Pool Lifecycle Management');
    });

    it('approves genuine explanation for PASSWORD_HASHING_SALT', () => {
      const answer =
        'Using a unique random per-user salt prevents rainbow table dictionary attacks and ensures identical passwords produce distinct hashes.';
      const result = matcher.evaluate(ConceptId.PASSWORD_HASHING_SALT, answer);

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.matchedMechanisms).toContain('Cryptographic Salt & Uniqueness');
      expect(result.matchedMechanisms).toContain('Rainbow Tables & Precomputation');
    });

    it('approves genuine explanation for TRANSACTION_ATOMICITY_ACID', () => {
      const answer =
        'Database transactions guarantee all-or-nothing atomicity by rolling back write-ahead logs to restore consistent state if an error occurs.';
      const result = matcher.evaluate(ConceptId.TRANSACTION_ATOMICITY_ACID, answer);

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.matchedMechanisms).toContain('Atomicity & All-or-Nothing');
      expect(result.matchedMechanisms).toContain('Rollback & Consistency');
    });

    it('approves genuine explanation for CACHE_INVALIDATION_STRATEGY', () => {
      const answer =
        'In the cache-aside pattern, we evict stale keys on mutation or set a TTL, and use mutex locks to prevent a thundering herd stampede.';
      const result = matcher.evaluate(ConceptId.CACHE_INVALIDATION_STRATEGY, answer);

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.matchedMechanisms).toContain('Invalidation & Eviction');
      expect(result.matchedMechanisms).toContain('Thundering Herd & Stampede');
    });

    it('approves genuine explanation for BACKGROUND_JOB_RETRY_IDEMPOTENCY', () => {
      const answer =
        'An idempotency key prevents duplicate side-effects like charging a credit card twice on worker retries, while a dead letter queue catches poison pills.';
      const result = matcher.evaluate(ConceptId.BACKGROUND_JOB_RETRY_IDEMPOTENCY, answer);

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.matchedMechanisms).toContain('Idempotency Keys & Deduplication');
      expect(result.matchedMechanisms).toContain('Dead Letter Queues & Poison Messages');
    });

    it('approves genuine explanation for INPUT_VALIDATION_SANITIZATION', () => {
      const answer =
        'Parsing incoming requests with Zod enforces type narrowing and strips unknown payload fields to prevent mass assignment vulnerabilities.';
      const result = matcher.evaluate(ConceptId.INPUT_VALIDATION_SANITIZATION, answer);

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.matchedMechanisms).toContain('Schema Parsing & Type Narrowing');
      expect(result.matchedMechanisms).toContain('Mass Assignment Prevention');
    });

    it('awards 100/100 score when all 3 mechanism groups are thoroughly addressed', () => {
      const answer =
        'JWT secrets must be stored in process.env or a vault rather than committed to a public repo in git where they leak. Keeping the secret safe protects token signature verification from forgery.';
      const result = matcher.evaluate(ConceptId.JWT_SECRET_HYGIENE, answer);

      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.matchedMechanisms.length).toBe(3);
    });
  });

  describe('Technical synonym and abbreviation tolerance', () => {
    it('recognizes domain abbreviations and synonyms (.env, leak, github leak)', () => {
      const answer =
        'If you put secrets in code instead of a .env config file, you risk an exposure in a public repo where credentials are compromised.';
      const result = matcher.evaluate(ConceptId.JWT_SECRET_HYGIENE, answer);

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(80);
    });

    it('recognizes repeatable and re-runnable with if not exists for migration idempotency', () => {
      const answer =
        'We add IF NOT EXISTS so the SQL statements are repeatable and re-runnable without crashing deployment pipelines.';
      const result = matcher.evaluate(ConceptId.DB_MIGRATION_IDEMPOTENCY, answer);

      expect(result.passed).toBe(true);
      expect(result.matchedMechanisms).toContain('Idempotency & Safe Retries');
    });

    it('recognizes serverless scaling proxies (PgBouncer, Lambda) for connection pools', () => {
      const answer =
        'When serverless lambda functions scale up rapidly, they exhaust database sockets unless a pgbouncer proxy multiplexes the client connections.';
      const result = matcher.evaluate(ConceptId.CONNECTION_POOL_MANAGEMENT, answer);

      expect(result.passed).toBe(true);
      expect(result.matchedMechanisms).toContain('Connection Exhaustion & Leaks');
      expect(result.matchedMechanisms).toContain('Serverless Scaling & Proxies');
    });

    it('recognizes token bucket and ddos traffic spikes for rate limiting', () => {
      const answer =
        'A token bucket or sliding window algorithm limits request rates to protect services from sudden ddos traffic peaks and brute force attacks.';
      const result = matcher.evaluate(ConceptId.RATE_LIMITING_DOS, answer);

      expect(result.passed).toBe(true);
      expect(result.matchedMechanisms).toContain('Rate Limiting Algorithms');
      expect(result.matchedMechanisms).toContain('Traffic Spikes & Abuse Prevention');
    });

    it('recognizes b-tree O(log N) seeks versus full table sequential scans for indexing', () => {
      const answer =
        'A b-tree index allows logarithmic tree traversal for fast lookups rather than performing a slow sequential scan across millions of rows.';
      const result = matcher.evaluate(ConceptId.INDEXING_QUERY_PERFORMANCE, answer);

      expect(result.passed).toBe(true);
      expect(result.matchedMechanisms).toContain('B-Tree Traversal & Fast Lookups');
      expect(result.matchedMechanisms).toContain('Full Table Scans');
    });
  });

  describe('Partial answers and shallow explanation handling', () => {
    it('fails shallow answer that mentions only general terminology without required mechanisms', () => {
      const answer = 'JWTs are authentication tokens passed in the authorization header.';
      const result = matcher.evaluate(ConceptId.JWT_SECRET_HYGIENE, answer);

      expect(result.passed).toBe(false);
      expect(result.isEvasive).toBe(false);
      expect(result.score).toBeLessThan(60);
      expect(result.feedback).toContain('required mechanisms');
      expect(result.missingMechanisms).toContain('Environment / Storage Isolation');
      expect(result.missingMechanisms).toContain('Exposure / Git Leak Prevention');
    });

    it('fails answer covering only 1 mechanism when 2 are required', () => {
      const answer = 'The secret should be loaded from the process.env file.';
      const result = matcher.evaluate(ConceptId.JWT_SECRET_HYGIENE, answer);

      expect(result.passed).toBe(false);
      expect(result.score).toBeLessThan(60);
      expect(result.matchedMechanisms.length).toBe(1);
      expect(result.matchedMechanisms).toContain('Environment / Storage Isolation');
      expect(result.missingMechanisms.length).toBe(2);
    });

    it('fails answer with irrelevant text', () => {
      const answer = 'This function calculates the user billing total and returns a JSON response to the client.';
      const result = matcher.evaluate(ConceptId.SQL_INJECTION_PREVENTION, answer);

      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.matchedMechanisms.length).toBe(0);
    });
  });

  describe('Custom matcher options and uncatalogued concepts', () => {
    it('respects custom minimumPassingScore option', () => {
      const answer =
        'The JWT secret must be stored in process.env so it is not committed to git and leaked to attackers.';
      // Passes default 60, but fails strict 95 requirement
      const strictResult = matcher.evaluate(ConceptId.JWT_SECRET_HYGIENE, answer, [], {
        minimumPassingScore: 95,
      });
      expect(strictResult.passed).toBe(false);

      const standardResult = matcher.evaluate(ConceptId.JWT_SECRET_HYGIENE, answer, [], {
        minimumPassingScore: 60,
      });
      expect(standardResult.passed).toBe(true);
    });

    it('evaluates uncatalogued concepts using expected question keywords', () => {
      const customConcept = 'CUSTOM_API_ARCHITECTURE';
      const questionKeywords = ['circuit breaker', 'fallback', 'timeout'];
      const answer =
        'We implemented a circuit breaker with a fallback mechanism when downstream calls exceed the timeout.';

      const result = matcher.evaluate(customConcept, answer, questionKeywords);
      expect(result.passed).toBe(true);
      expect(result.matchedKeywords).toContain('circuit breaker');
      expect(result.matchedKeywords).toContain('fallback');
      expect(result.score).toBeGreaterThanOrEqual(70);
    });

    it('exports a ready-to-use defaultConceptMatcher singleton', () => {
      expect(defaultConceptMatcher).toBeInstanceOf(ConceptMatcher);
      const res = defaultConceptMatcher.evaluate(
        ConceptId.ASYNC_WATERFALL_MITIGATION,
        'Sequential awaits accumulate latency; use Promise.all in parallel.'
      );
      expect(res.passed).toBe(true);
    });
  });
});
