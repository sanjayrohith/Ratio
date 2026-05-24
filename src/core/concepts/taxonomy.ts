import { LayerCategory } from '../scorer/layers.js';

/**
 * 15 Core Full-Stack Concept Taxonomy Identifiers
 */
export enum ConceptId {
  JWT_SECRET_HYGIENE = 'jwt_secret_hygiene',
  DB_MIGRATION_IDEMPOTENCY = 'db_migration_idempotency',
  SQL_INJECTION_PREVENTION = 'sql_injection_prevention',
  CONNECTION_POOL_MANAGEMENT = 'connection_pool_management',
  ASYNC_WATERFALL_MITIGATION = 'async_waterfall_mitigation',
  RATE_LIMITING_DOS = 'rate_limiting_dos',
  CORS_ORIGIN_SECURITY = 'cors_origin_security',
  PASSWORD_HASHING_SALT = 'password_hashing_salt',
  TRANSACTION_ATOMICITY_ACID = 'transaction_atomicity_acid',
  CACHE_INVALIDATION_STRATEGY = 'cache_invalidation_strategy',
  BACKGROUND_JOB_RETRY_IDEMPOTENCY = 'background_job_retry_idempotency',
  INPUT_VALIDATION_SANITIZATION = 'input_validation_sanitization',
  ENV_SECRET_ISOLATION = 'env_secret_isolation',
  INDEXING_QUERY_PERFORMANCE = 'indexing_query_performance',
  ERROR_HANDLING_LEAKAGE = 'error_handling_leakage',
  STATE_RENDER_LOOP = 'state_render_loop',
  STATE_IMMUTABILITY = 'state_immutability',
}

export interface ConceptDefinition {
  id: ConceptId;
  name: string;
  category: LayerCategory;
  description: string;
  architecturalRisks: string[];
  recommendedPatterns: string[];
}

export const CONCEPT_DEFINITIONS: Record<ConceptId, ConceptDefinition> = {
  [ConceptId.JWT_SECRET_HYGIENE]: {
    id: ConceptId.JWT_SECRET_HYGIENE,
    name: 'JWT Secret & Key Hygiene',
    category: 'auth',
    description: 'Proper secret generation, environment storage, signature validation, and token expiration.',
    architecturalRisks: ['Hardcoded credentials', 'Token forgery', 'Signature replay'],
    recommendedPatterns: ['Environment variable loading', 'RS256 asymmetric keys', 'Short expiration + refresh tokens'],
  },
  [ConceptId.DB_MIGRATION_IDEMPOTENCY]: {
    id: ConceptId.DB_MIGRATION_IDEMPOTENCY,
    name: 'Database Migration Idempotency',
    category: 'db',
    description: 'Safe schema migrations that can be re-run or reverted without data loss or downtime.',
    architecturalRisks: ['Table locking in production', 'Data corruption on failed runs', 'Destructive column drops'],
    recommendedPatterns: ['IF NOT EXISTS guards', 'Expand-contract phase transitions', 'Non-blocking concurrent indexes'],
  },
  [ConceptId.SQL_INJECTION_PREVENTION]: {
    id: ConceptId.SQL_INJECTION_PREVENTION,
    name: 'SQL Injection Prevention',
    category: 'db',
    description: 'Parameterization and prepared statements preventing unauthorized query execution.',
    architecturalRisks: ['Data exfiltration', 'Database compromise', 'Authentication bypass'],
    recommendedPatterns: ['Parameterized queries', 'Prepared statements', 'Type-safe query builders and ORMs'],
  },
  [ConceptId.CONNECTION_POOL_MANAGEMENT]: {
    id: ConceptId.CONNECTION_POOL_MANAGEMENT,
    name: 'Database Connection Pooling',
    category: 'db',
    description: 'Managing database client lifecycle, connection pool sizing, and leak prevention.',
    architecturalRisks: ['Connection exhaustion', 'Serverless socket crashes', 'Latency spikes under load'],
    recommendedPatterns: ['Singleton client lifecycle', 'Explicit connection release in try-finally', 'Connection pooling proxies'],
  },
  [ConceptId.ASYNC_WATERFALL_MITIGATION]: {
    id: ConceptId.ASYNC_WATERFALL_MITIGATION,
    name: 'Async Waterfall & Concurrency Mitigation',
    category: 'core',
    description: 'Avoiding unnecessary sequential awaits in favor of parallel Promise.all / concurrency pools.',
    architecturalRisks: ['Accumulated request latency', 'Throughput degradation', 'Slow UI rendering'],
    recommendedPatterns: ['Promise.all / Promise.allSettled', 'Concurrent batching', 'Pipelined data fetching'],
  },
  [ConceptId.RATE_LIMITING_DOS]: {
    id: ConceptId.RATE_LIMITING_DOS,
    name: 'Rate Limiting & DoS Protection',
    category: 'api',
    description: 'Controlling request frequency per IP/user to prevent resource abuse and brute-force attacks.',
    architecturalRisks: ['Service degradation', 'Credential stuffing', 'Cost explosion on LLM/cloud APIs'],
    recommendedPatterns: ['Token bucket algorithm', 'Sliding window counters with Redis', 'Middleware rate limiters'],
  },
  [ConceptId.CORS_ORIGIN_SECURITY]: {
    id: ConceptId.CORS_ORIGIN_SECURITY,
    name: 'CORS Configuration & Origin Security',
    category: 'api',
    description: 'Restricting cross-origin access to authorized origins and handling preflight requests.',
    architecturalRisks: ['Cross-origin data theft', 'Wildcard * with credentials leak', 'CSRF exploitation'],
    recommendedPatterns: ['Explicit origin allowlists', 'Access-Control-Allow-Credentials hygiene', 'Strict method restrictions'],
  },
  [ConceptId.PASSWORD_HASHING_SALT]: {
    id: ConceptId.PASSWORD_HASHING_SALT,
    name: 'Password Hashing & Cryptographic Salting',
    category: 'auth',
    description: 'Secure one-way password hashing with salt and adaptive work factors.',
    architecturalRisks: ['Plaintext or MD5/SHA1 exposure', 'Rainbow table attacks', 'GPU brute-forcing'],
    recommendedPatterns: ['Argon2id', 'bcrypt with adequate work factor (>= 12)', 'Per-user random cryptographic salt'],
  },
  [ConceptId.TRANSACTION_ATOMICITY_ACID]: {
    id: ConceptId.TRANSACTION_ATOMICITY_ACID,
    name: 'Transaction Atomicity & ACID Boundaries',
    category: 'db',
    description: 'Ensuring multi-statement operations either succeed together or rollback completely.',
    architecturalRisks: ['Partial writes', 'Inconsistent state between tables', 'Ghost records'],
    recommendedPatterns: ['BEGIN/COMMIT/ROLLBACK blocks', 'Unit of Work pattern', 'Idempotent compensation logic'],
  },
  [ConceptId.CACHE_INVALIDATION_STRATEGY]: {
    id: ConceptId.CACHE_INVALIDATION_STRATEGY,
    name: 'Cache Invalidation & Freshness',
    category: 'core',
    description: 'Maintaining cache consistency with database updates and avoiding thundering herd stampedes.',
    architecturalRisks: ['Stale data presentation', 'Cache stampede under traffic', 'Memory exhaustion'],
    recommendedPatterns: ['Cache-aside with TTL', 'Probabilistic early expiration', 'Write-through invalidation on mutation'],
  },
  [ConceptId.BACKGROUND_JOB_RETRY_IDEMPOTENCY]: {
    id: ConceptId.BACKGROUND_JOB_RETRY_IDEMPOTENCY,
    name: 'Background Job Idempotency & Retries',
    category: 'worker',
    description: 'Ensuring asynchronous tasks can be safely retried without unintended side-effects.',
    architecturalRisks: ['Duplicate payments or emails', 'Poison pills in message queue', 'Race conditions in workers'],
    recommendedPatterns: ['Idempotency keys', 'Dead-letter queues', 'Exponential backoff with jitter'],
  },
  [ConceptId.INPUT_VALIDATION_SANITIZATION]: {
    id: ConceptId.INPUT_VALIDATION_SANITIZATION,
    name: 'Schema-Driven Input Validation & Sanitization',
    category: 'api',
    description: 'Strict boundary validation for all external inputs using schema parsers like Zod or Pydantic.',
    architecturalRisks: ['Remote code execution', 'Cross-Site Scripting (XSS)', 'Unhandled runtime exceptions'],
    recommendedPatterns: ['Parse, don’t validate with Zod/Pydantic', 'Strip unknown fields', 'Type narrowing at boundaries'],
  },
  [ConceptId.ENV_SECRET_ISOLATION]: {
    id: ConceptId.ENV_SECRET_ISOLATION,
    name: 'Environment & Secret Isolation',
    category: 'config',
    description: 'Safeguarding API keys, connection strings, and certificates from version control and client bundles.',
    architecturalRisks: ['Leaked API keys on GitHub', 'Accidental client-side bundling of secrets', 'Production key compromise'],
    recommendedPatterns: ['.env in .gitignore', 'Secret managers (Vault, AWS Secrets Manager)', 'Build-time prefix isolation (e.g. NEXT_PUBLIC_)'],
  },
  [ConceptId.INDEXING_QUERY_PERFORMANCE]: {
    id: ConceptId.INDEXING_QUERY_PERFORMANCE,
    name: 'Database Indexing & Query Planning',
    category: 'db',
    description: 'Designing composite and targeted indexes to avoid full table scans on large tables.',
    architecturalRisks: ['Full table scans', 'CPU saturation under query volume', 'Connection pool saturation'],
    recommendedPatterns: ['B-tree indexes on foreign keys & filter columns', 'EXPLAIN ANALYZE verification', 'Covering indexes'],
  },
  [ConceptId.ERROR_HANDLING_LEAKAGE]: {
    id: ConceptId.ERROR_HANDLING_LEAKAGE,
    name: 'Error Handling & Information Leakage',
    category: 'core',
    description: 'Preventing internal stack traces, DB query details, or system paths from leaking in API responses.',
    architecturalRisks: ['Information disclosure for attackers', 'Uncaught exceptions crashing processes', 'Silent failures without logging'],
    recommendedPatterns: ['Global error handler middleware', 'Sanitized public error messages', 'Structured telemetry logging with error tracing'],
  },
  [ConceptId.STATE_RENDER_LOOP]: {
    id: ConceptId.STATE_RENDER_LOOP,
    name: 'React State & Re-render Loops',
    category: 'ui',
    description: 'Managing component state updates, effect dependency arrays, and preventing recursive re-render loops.',
    architecturalRisks: ['Infinite component re-render loops', 'UI thread locking', 'Stale closure bugs', 'Excessive DOM reconciliations'],
    recommendedPatterns: ['Exhaustive useEffect dependencies', 'Functional state updates prev => ...', 'Memoized callbacks and selectors'],
  },
  [ConceptId.STATE_IMMUTABILITY]: {
    id: ConceptId.STATE_IMMUTABILITY,
    name: 'State Immutability & Structural Sharing',
    category: 'ui',
    description: 'Preserving immutable state trees with shallow copies and structural sharing for predictable UI change detection.',
    architecturalRisks: ['Direct state mutations in-place', 'Dropped UI updates from reference equality checks', 'Unintended state corruption across components'],
    recommendedPatterns: ['Object and array spread syntax', 'Immutability helpers (Immer, shallow copy)', 'Pure reducer functions'],
  },
};
