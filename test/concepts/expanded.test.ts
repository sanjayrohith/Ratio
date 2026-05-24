import { describe, expect, it } from 'bun:test';
import { ConceptId, CONCEPT_DEFINITIONS } from '../../src/core/concepts/taxonomy.js';
import { QUESTION_CATALOG } from '../../src/core/concepts/catalog.js';
import { QuestionSelector } from '../../src/core/concepts/selector.js';
import { CONCEPT_RUBRICS } from '../../src/core/evaluation/rubrics.js';
import { ConceptMatcher } from '../../src/core/evaluation/matcher.js';

describe('Expanded Concept Catalog & Normalized Evaluation Unit Tests', () => {
  const matcher = new ConceptMatcher();
  const selector = new QuestionSelector();

  const expandedConcepts: ConceptId[] = [
    ConceptId.STATE_RENDER_LOOP,
    ConceptId.STATE_IMMUTABILITY,
    ConceptId.API_IDEMPOTENCY,
    ConceptId.RATE_LIMITING,
    ConceptId.ERROR_BOUNDARY,
  ];

  describe('Taxonomy and Question Catalog Verification', () => {
    it('defines complete architectural metadata for all newly added concepts', () => {
      for (const conceptId of expandedConcepts) {
        const def = CONCEPT_DEFINITIONS[conceptId];
        expect(def).toBeDefined();
        expect(def.id).toBe(conceptId);
        expect(def.name.length).toBeGreaterThan(0);
        expect(def.category).toMatch(/^(state|api|reliability|concurrency|database|caching|security|architecture|ui)$/);


        expect(def.description.length).toBeGreaterThan(15);
        expect(def.architecturalRisks.length).toBeGreaterThanOrEqual(2);
        expect(def.recommendedPatterns.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('contains at least 3 Socratic questions (rationale, mechanism, tradeoff) for each expanded concept', () => {
      for (const conceptId of expandedConcepts) {
        const questions = QUESTION_CATALOG[conceptId];
        expect(questions).toBeDefined();
        expect(questions.length).toBeGreaterThanOrEqual(3);

        const focuses = questions.map((q) => q.focus);
        expect(focuses).toContain('rationale');
        expect(focuses).toContain('mechanism');
        expect(focuses).toContain('tradeoff');

        for (const q of questions) {
          expect(q.id).toBeDefined();
          expect(q.conceptId).toBe(conceptId);
          expect(q.question.length).toBeGreaterThan(25);
          expect(q.hint.length).toBeGreaterThan(15);
          expect(q.expectedKeywords.length).toBeGreaterThanOrEqual(3);
        }
      }
    });

    it('catalogues cache TTL vs event-driven invalidation trade-off question', () => {
      const cacheQuestions = QUESTION_CATALOG[ConceptId.CACHE_INVALIDATION_STRATEGY];
      const tradeoffQ = cacheQuestions.find((q) => q.id === 'cache_ttl_vs_event_tradeoff');
      expect(tradeoffQ).toBeDefined();
      expect(tradeoffQ?.focus).toBe('tradeoff');
      expect(tradeoffQ?.expectedKeywords).toContain('ttl');
      expect(tradeoffQ?.expectedKeywords).toContain('staleness');
    });
  });

  describe('Rubrics & Mechanism Group Verification', () => {
    it('defines comprehensive rubrics for all expanded concepts', () => {
      for (const conceptId of expandedConcepts) {
        const rubric = CONCEPT_RUBRICS[conceptId];
        expect(rubric).toBeDefined();
        expect(rubric.conceptId).toBe(conceptId);
        expect(rubric.minDistinctMechanisms).toBeGreaterThanOrEqual(2);
        expect(rubric.mechanisms.length).toBeGreaterThanOrEqual(3);

        for (const m of rubric.mechanisms) {
          expect(m.name.length).toBeGreaterThan(0);
          expect(m.description.length).toBeGreaterThan(10);
          expect(m.keywords.length).toBeGreaterThanOrEqual(3);
        }
      }
    });
  });

  describe('Genuine Student Answers Evaluation across Expanded Concepts', () => {
    it('evaluates and passes genuine explanation for STATE_RENDER_LOOP', () => {
      const answer = `
        Calling setState unconditionally inside useEffect without a dependency array triggers an infinite re-render loop.
        React invokes the effect after render, the state update schedules a new render, and the cycle repeats infinitely.
        We fix this by specifying a dependency array or memoizing objects with useCallback and useMemo so references remain stable.
      `;
      const result = matcher.evaluate(ConceptId.STATE_RENDER_LOOP, answer);

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.isEvasive).toBe(false);
      expect(result.matchedMechanisms).toContain('Dependency Array & Effect Lifecycles');
      expect(result.matchedMechanisms).toContain('Render Loop Lifecycle & Recursion');
    });

    it('evaluates and passes genuine explanation for STATE_IMMUTABILITY', () => {
      const answer = `
        Directly mutating state objects in place prevents React from detecting changes because React performs a shallow reference equality check (Object.is).
        If the reference does not change, React bails out of re-rendering child components, leading to stale UI bugs.
        We must treat state as immutable by returning a new object using object spread {...prev} or using Immer produce.
      `;
      const result = matcher.evaluate(ConceptId.STATE_IMMUTABILITY, answer);

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.isEvasive).toBe(false);
      expect(result.matchedMechanisms).toContain('Reference Equality & Change Detection');
      expect(result.matchedMechanisms).toContain('Direct Mutation Hazards');
    });

    it('evaluates and passes genuine explanation for API_IDEMPOTENCY', () => {
      const answer = `
        Clients provide a unique Idempotency-Key header for mutation requests like payment processing.
        The server stores the key with a distributed Redis lock to prevent concurrent duplicate execution,
        and caches the final response in a deduplication window so retries return the exact cached result without duplicate side-effects.
      `;
      const result = matcher.evaluate(ConceptId.API_IDEMPOTENCY, answer);

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.isEvasive).toBe(false);
      expect(result.matchedMechanisms).toContain('Idempotency Key & Header Processing');
      expect(result.matchedMechanisms).toContain('In-Flight Locking & Race Prevention');
    });

    it('evaluates and passes genuine explanation for RATE_LIMITING', () => {
      const answer = `
        We implement token bucket and leaky bucket algorithms in Redis to meter incoming traffic per client IP or user token.
        When the rate limit threshold is exceeded, the API returns HTTP 429 Too Many Requests along with a Retry-After header,
        protecting backend services and databases from cascading overload and DDoS attacks.
      `;
      const result = matcher.evaluate(ConceptId.RATE_LIMITING, answer);

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.isEvasive).toBe(false);
      expect(result.matchedMechanisms).toContain('Rate Limiting Algorithms & Burst Handling');
      expect(result.matchedMechanisms).toContain('Throttling & HTTP 429 Status');
    });

    it('evaluates and passes genuine explanation for ERROR_BOUNDARY', () => {
      const answer = `
        Error boundaries use componentDidCatch and static getDerivedStateFromError in React class components.
        They catch uncaught JavaScript exceptions during component rendering and lifecycle methods,
        isolating the failure to a sub-tree and rendering a fallback UI so the entire application does not crash to a blank screen.
      `;
      const result = matcher.evaluate(ConceptId.ERROR_BOUNDARY, answer);

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.isEvasive).toBe(false);
      expect(result.matchedMechanisms).toContain('Lifecycle Catching & Fallback UI');
      expect(result.matchedMechanisms).toContain('Granularity & Fault Isolation');
    });

  });

  describe('Fuzzy Matching & Pluralization Tolerance in ConceptMatcher', () => {
    it('matches plural nouns and stemmed variations transparently during evaluation', () => {
      // Uses "idempotency keys" (plural) and "retrying" (stemmed)
      const answer = `
        Using unique idempotency keys in request headers ensures deduplication.
        When retrying failed payment requests, redis locks prevent duplicate charging.
      `;
      const result = matcher.evaluate(ConceptId.API_IDEMPOTENCY, answer);

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.matchedKeywords).toContain('idempotency key');
    });

    it('matches stemmed verbs in STATE_RENDER_LOOP', () => {
      // Uses "rendering", "looping", "updating", "depend"
      const answer = `
        Calling state updating functions continuously inside effect hooks without dependencies
        causes non-stop rendering loops and browser performance freezes.
      `;
      const result = matcher.evaluate(ConceptId.STATE_RENDER_LOOP, answer);

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(60);
    });
  });

  describe('Shallow and Evasive Rejection for Expanded Concepts', () => {
    it('rejects evasive answers for newly added concepts with score 0', () => {
      for (const conceptId of expandedConcepts) {
        const result = matcher.evaluate(conceptId, 'idk just write the code');
        expect(result.passed).toBe(false);
        expect(result.isEvasive).toBe(true);
        expect(result.score).toBe(0);
        expect(result.feedback).toContain('evasive shortcut');
      }
    });

    it('fails shallow answers lacking mechanistic depth for newly added concepts', () => {
      const result = matcher.evaluate(ConceptId.RATE_LIMITING, 'Rate limiting is good for performance and servers.');
      expect(result.passed).toBe(false);
      expect(result.score).toBeLessThan(60);
      expect(result.missingMechanisms.length).toBeGreaterThan(0);
    });
  });

  describe('Heuristic Question Triggers for Expanded Concepts', () => {
    it('triggers STATE_RENDER_LOOP question on useEffect state updates', () => {
      const selection = selector.select({
        filePath: 'src/components/UserProfile.tsx',
        layers: ['ui'],
        contentDiff: 'useEffect(() => { setCount(count + 1); });',
      });
      expect(selection.conceptId).toBe(ConceptId.STATE_RENDER_LOOP);
    });

    it('triggers STATE_IMMUTABILITY question on array mutations', () => {
      const selection = selector.select({
        filePath: 'src/hooks/useTodos.ts',
        layers: ['ui'],
        contentDiff: 'mutate items array directly with items.push(newItem);',
      });
      expect(selection.conceptId).toBe(ConceptId.STATE_IMMUTABILITY);

    });

    it('triggers API_IDEMPOTENCY question on payment and idempotency headers', () => {
      const selection = selector.select({
        filePath: 'src/api/checkout.ts',
        layers: ['api'],
        contentDiff: 'const idempotencyKey = req.headers["idempotency-key"];',
      });
      expect(selection.conceptId).toBe(ConceptId.API_IDEMPOTENCY);
    });

    it('triggers RATE_LIMITING question on rate limit and token bucket code', () => {
      const selection = selector.select({
        filePath: 'src/middleware/rateLimit.ts',
        layers: ['api'],
        contentDiff: 'const rateLimit = new RateLimiter({ tokensPerInterval: 100 });',
      });
      expect(selection.conceptId).toBe(ConceptId.RATE_LIMITING);
    });

    it('triggers ERROR_BOUNDARY question on componentDidCatch or ErrorBoundary', () => {
      const selection = selector.select({
        filePath: 'src/components/ErrorBoundary.tsx',
        layers: ['ui'],
        contentDiff: 'componentDidCatch(error, info) { logError(error); }',
      });
      expect(selection.conceptId).toBe(ConceptId.ERROR_BOUNDARY);
    });
  });
});
