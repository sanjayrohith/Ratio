import { ConceptId } from './taxonomy.js';

export interface SocraticQuestion {
  id: string;
  conceptId: ConceptId;
  question: string;
  focus: 'rationale' | 'mechanism' | 'tradeoff';
  hint: string;
  expectedKeywords: string[];
}

/**
 * Curated Question Bank Catalog containing targeted Socratic questions
 * for each of the 15 full-stack concepts.
 */
export const QUESTION_CATALOG: Record<ConceptId, SocraticQuestion[]> = {
  [ConceptId.JWT_SECRET_HYGIENE]: [
    {
      id: 'jwt_secret_env',
      conceptId: ConceptId.JWT_SECRET_HYGIENE,
      question: 'Why must the JWT secret or private key be loaded from environment variables rather than hardcoded in the source code?',
      focus: 'rationale',
      hint: 'Consider what happens if the repository is published or accessed by unauthorized collaborators.',
      expectedKeywords: ['environment', 'git', 'leak', 'secret', 'compromise'],
    },
    {
      id: 'jwt_expiration_mechanism',
      conceptId: ConceptId.JWT_SECRET_HYGIENE,
      question: 'How do short token expiration windows and refresh token rotation protect against token theft?',
      focus: 'mechanism',
      hint: 'Reflect on the window of vulnerability if a stolen access token never expires.',
      expectedKeywords: ['expiration', 'refresh', 'window', 'rotation', 'revoke', 'stolen'],
    },
    {
      id: 'jwt_asymmetric_tradeoff',
      conceptId: ConceptId.JWT_SECRET_HYGIENE,
      question: 'What is the security and architectural trade-off between symmetric HMAC (HS256) and asymmetric RSA (RS256) for signing JWTs?',
      focus: 'tradeoff',
      hint: 'Think about services verifying the token without needing the power to sign new tokens.',
      expectedKeywords: ['public', 'private', 'asymmetric', 'verify', 'sign', 'distributed'],
    },
  ],

  [ConceptId.DB_MIGRATION_IDEMPOTENCY]: [
    {
      id: 'migration_idempotency_def',
      conceptId: ConceptId.DB_MIGRATION_IDEMPOTENCY,
      question: 'What makes a database migration idempotent, and why is this property critical in automated CI/CD deployment pipelines?',
      focus: 'mechanism',
      hint: 'Consider what happens if a deployment script fails halfway and retries the migration step.',
      expectedKeywords: ['idempotent', 'retry', 'duplicate', 'rerun', 'safe', 'failure'],
    },
    {
      id: 'migration_expand_contract',
      conceptId: ConceptId.DB_MIGRATION_IDEMPOTENCY,
      question: 'How does the expand-and-contract (parallel run) migration pattern prevent downtime during schema changes?',
      focus: 'rationale',
      hint: 'Think about active application instances running the old code while the database migration executes.',
      expectedKeywords: ['expand', 'contract', 'backward', 'compatible', 'downtime', 'version'],
    },
    {
      id: 'migration_table_lock_tradeoff',
      conceptId: ConceptId.DB_MIGRATION_IDEMPOTENCY,
      question: 'What trade-offs exist when adding a column with a default value on a table with millions of rows in PostgreSQL or MySQL?',
      focus: 'tradeoff',
      hint: 'Consider table locking, replication lag, and rewrite overhead.',
      expectedKeywords: ['lock', 'blocking', 'rewrite', 'lag', 'concurrently', 'performance'],
    },
  ],

  [ConceptId.SQL_INJECTION_PREVENTION]: [
    {
      id: 'sql_parameterization_mechanism',
      conceptId: ConceptId.SQL_INJECTION_PREVENTION,
      question: 'How do parameterized queries and prepared statements prevent SQL injection attacks at the protocol level?',
      focus: 'mechanism',
      hint: 'Consider the separation between SQL code compilation and data parameter transmission.',
      expectedKeywords: ['parameter', 'prepared', 'compile', 'data', 'separate', 'ast'],
    },
    {
      id: 'sql_orm_limitations',
      conceptId: ConceptId.SQL_INJECTION_PREVENTION,
      question: 'Why can raw SQL string concatenation inside ORM helper methods (like raw() or query()) still introduce SQL injection vulnerabilities?',
      focus: 'rationale',
      hint: 'An ORM only protects you when using its structured query builder methods.',
      expectedKeywords: ['concatenate', 'raw', 'bypass', 'string', 'interpolation'],
    },
    {
      id: 'sql_dynamic_identifiers_tradeoff',
      conceptId: ConceptId.SQL_INJECTION_PREVENTION,
      question: 'How should dynamic table or column names be safely handled in SQL queries when prepared statement placeholders cannot bind identifiers?',
      focus: 'tradeoff',
      hint: 'Parameters bind literal values, not identifiers. Consider allowlists or quoting.',
      expectedKeywords: ['allowlist', 'whitelist', 'identifier', 'quote', 'sanitized'],
    },
  ],

  [ConceptId.CONNECTION_POOL_MANAGEMENT]: [
    {
      id: 'pool_exhaustion_rationale',
      conceptId: ConceptId.CONNECTION_POOL_MANAGEMENT,
      question: 'What causes database connection pool exhaustion, and how does it manifest under high concurrency?',
      focus: 'mechanism',
      hint: 'Think about unclosed connections in error paths and requests waiting for available sockets.',
      expectedKeywords: ['exhaustion', 'leak', 'acquire', 'timeout', 'concurrency', 'release'],
    },
    {
      id: 'pool_serverless_tradeoff',
      conceptId: ConceptId.CONNECTION_POOL_MANAGEMENT,
      question: 'Why do serverless ephemeral functions (like AWS Lambda or Vercel Edge) require external connection pooling proxies (like PgBouncer or Prisma Accelerate)?',
      focus: 'tradeoff',
      hint: 'Consider how many separate database connections are opened when 1,000 serverless instances scale up.',
      expectedKeywords: ['serverless', 'scale', 'pgbouncer', 'proxy', 'exhaust', 'ephemeral'],
    },
  ],

  [ConceptId.ASYNC_WATERFALL_MITIGATION]: [
    {
      id: 'async_waterfall_mechanism',
      conceptId: ConceptId.ASYNC_WATERFALL_MITIGATION,
      question: 'How does an async waterfall degrade request throughput, and when should Promise.all be used instead of sequential awaits?',
      focus: 'mechanism',
      hint: 'Analyze whether asynchronous tasks have data dependencies on each other.',
      expectedKeywords: ['waterfall', 'sequential', 'parallel', 'independent', 'latency', 'concurrent'],
    },
    {
      id: 'async_all_settled_tradeoff',
      conceptId: ConceptId.ASYNC_WATERFALL_MITIGATION,
      question: 'What is the behavioral and reliability difference between Promise.all and Promise.allSettled when one task fails?',
      focus: 'tradeoff',
      hint: 'One short-circuits immediately on first rejection, while the other waits for all results.',
      expectedKeywords: ['fail', 'short-circuit', 'reject', 'settled', 'partial', 'resilient'],
    },
  ],

  [ConceptId.RATE_LIMITING_DOS]: [
    {
      id: 'rate_limit_sliding_window',
      conceptId: ConceptId.RATE_LIMITING_DOS,
      question: 'How does the sliding window counter algorithm prevent sudden boundary traffic bursts compared to a fixed window counter?',
      focus: 'mechanism',
      hint: 'Consider requests arriving right at the end of window 1 and the start of window 2.',
      expectedKeywords: ['sliding', 'window', 'burst', 'boundary', 'traffic', 'spike'],
    },
    {
      id: 'rate_limit_identifier_tradeoff',
      conceptId: ConceptId.RATE_LIMITING_DOS,
      question: 'What are the trade-offs between rate limiting by client IP address versus authenticated user ID?',
      focus: 'tradeoff',
      hint: 'Consider shared NAT IPs (like universities or offices) and unauthenticated brute force endpoints.',
      expectedKeywords: ['ip', 'user', 'nat', 'shared', 'unauthenticated', 'login'],
    },
  ],

  [ConceptId.CORS_ORIGIN_SECURITY]: [
    {
      id: 'cors_preflight_mechanism',
      conceptId: ConceptId.CORS_ORIGIN_SECURITY,
      question: 'What triggers an HTTP OPTIONS preflight request, and what role do CORS response headers play in browser security?',
      focus: 'mechanism',
      hint: 'Think about non-simple headers, HTTP methods like PUT/DELETE, and browser-enforced isolation.',
      expectedKeywords: ['preflight', 'options', 'origin', 'header', 'browser', 'security'],
    },
    {
      id: 'cors_wildcard_credentials_risk',
      conceptId: ConceptId.CORS_ORIGIN_SECURITY,
      question: 'Why do modern browsers strictly reject Access-Control-Allow-Origin: * when Access-Control-Allow-Credentials is true?',
      focus: 'rationale',
      hint: 'Consider malicious third-party websites making credentialed requests on behalf of a logged-in victim.',
      expectedKeywords: ['wildcard', 'credentials', 'cookie', 'csrf', 'authenticated', 'steal'],
    },
  ],

  [ConceptId.PASSWORD_HASHING_SALT]: [
    {
      id: 'password_salt_mechanism',
      conceptId: ConceptId.PASSWORD_HASHING_SALT,
      question: 'Why is cryptographic salt necessary when hashing passwords, and why does a fixed global pepper not replace per-user random salts?',
      focus: 'mechanism',
      hint: 'Think about two users with identical passwords and precalculated rainbow tables.',
      expectedKeywords: ['salt', 'rainbow', 'identical', 'unique', 'precomputed', 'hash'],
    },
    {
      id: 'password_work_factor_tradeoff',
      conceptId: ConceptId.PASSWORD_HASHING_SALT,
      question: 'How do adaptive work factors (in bcrypt or Argon2id) combat Moore’s Law and GPU cracking, and what is the server CPU cost?',
      focus: 'tradeoff',
      hint: 'Increasing computation time makes dictionary attacks slower, but increases authentication latency.',
      expectedKeywords: ['cost', 'work factor', 'gpu', 'brute force', 'cpu', 'argon2', 'bcrypt'],
    },
  ],

  [ConceptId.TRANSACTION_ATOMICITY_ACID]: [
    {
      id: 'transaction_atomicity_mechanism',
      conceptId: ConceptId.TRANSACTION_ATOMICITY_ACID,
      question: 'How do database transactions ensure all-or-nothing atomicity when an unexpected error occurs during a multi-table mutation?',
      focus: 'mechanism',
      hint: 'Consider what the database engine does with write-ahead logs when ROLLBACK is triggered.',
      expectedKeywords: ['atomic', 'rollback', 'wal', 'commit', 'consistent', 'partial'],
    },
    {
      id: 'isolation_level_tradeoff',
      conceptId: ConceptId.TRANSACTION_ATOMICITY_ACID,
      question: 'What are the performance and concurrency trade-offs between READ COMMITTED and SERIALIZABLE isolation levels?',
      focus: 'tradeoff',
      hint: 'Serializable prevents phantoms and serialization anomalies, but can cause transaction serialization failures.',
      expectedKeywords: ['isolation', 'serializable', 'dirty read', 'lock', 'contention', 'retry'],
    },
  ],

  [ConceptId.CACHE_INVALIDATION_STRATEGY]: [
    {
      id: 'cache_aside_mechanism',
      conceptId: ConceptId.CACHE_INVALIDATION_STRATEGY,
      question: 'How does the cache-aside pattern handle read and write operations, and when should the cache key be evicted versus updated?',
      focus: 'mechanism',
      hint: 'Updating the cache directly can cause race conditions between concurrent database writes.',
      expectedKeywords: ['cache-aside', 'evict', 'ttl', 'stale', 'race', 'invalidation'],
    },
    {
      id: 'thundering_herd_mitigation',
      conceptId: ConceptId.CACHE_INVALIDATION_STRATEGY,
      question: 'What is a cache stampede (thundering herd), and how do mutex locking or probabilistic early expiration prevent it?',
      focus: 'tradeoff',
      hint: 'When a popular key expires, hundreds of simultaneous queries hit the database at the exact same moment.',
      expectedKeywords: ['stampede', 'thundering', 'lock', 'mutex', 'expire', 'spike'],
    },
  ],

  [ConceptId.BACKGROUND_JOB_RETRY_IDEMPOTENCY]: [
    {
      id: 'job_idempotency_key_mechanism',
      conceptId: ConceptId.BACKGROUND_JOB_RETRY_IDEMPOTENCY,
      question: 'How does an idempotency key prevent duplicate side-effects (such as duplicate credit card charges) when background workers retry failed jobs?',
      focus: 'mechanism',
      hint: 'The consumer checks whether the operation ID has already been recorded as processed.',
      expectedKeywords: ['idempotency', 'key', 'duplicate', 'retry', 'side-effect', 'worker'],
    },
    {
      id: 'dead_letter_queue_rationale',
      conceptId: ConceptId.BACKGROUND_JOB_RETRY_IDEMPOTENCY,
      question: 'Why is a Dead Letter Queue (DLQ) necessary in message queue architectures, and what happens when unhandled errors poison worker loops?',
      focus: 'rationale',
      hint: 'A message that repeatedly crashes the worker must be quarantined to allow other jobs to process.',
      expectedKeywords: ['dead letter', 'dlq', 'poison', 'retry', 'quarantine', 'backoff'],
    },
  ],

  [ConceptId.INPUT_VALIDATION_SANITIZATION]: [
    {
      id: 'parse_dont_validate_mechanism',
      conceptId: ConceptId.INPUT_VALIDATION_SANITIZATION,
      question: 'What is the architectural advantage of "parse, don’t validate" using schema parsers (like Zod) compared to manual boolean checks?',
      focus: 'mechanism',
      hint: 'Parsing produces strongly-typed domain values and strips unexpected payload fields.',
      expectedKeywords: ['parse', 'type', 'narrowing', 'strip', 'schema', 'trusted'],
    },
    {
      id: 'mass_assignment_vulnerability',
      conceptId: ConceptId.INPUT_VALIDATION_SANITIZATION,
      question: 'How do mass assignment vulnerabilities arise when API request bodies are passed directly into database creation or update methods?',
      focus: 'rationale',
      hint: 'Consider an attacker injecting isAdmin: true or accountBalance: 99999 into the JSON payload.',
      expectedKeywords: ['mass assignment', 'injection', 'admin', 'whitelist', 'privilege', 'payload'],
    },
  ],

  [ConceptId.ENV_SECRET_ISOLATION]: [
    {
      id: 'client_bundle_secret_leak',
      conceptId: ConceptId.ENV_SECRET_ISOLATION,
      question: 'Why must backend secret keys never be prefixed with client environment markers (like NEXT_PUBLIC_ or VITE_) in full-stack frameworks?',
      focus: 'rationale',
      hint: 'Client environment variables are statically baked into public JavaScript bundles delivered to the browser.',
      expectedKeywords: ['client', 'public', 'bundle', 'browser', 'leak', 'compile'],
    },
    {
      id: 'dotenv_git_exclusion',
      conceptId: ConceptId.ENV_SECRET_ISOLATION,
      question: 'Why is committing .env files to Git a severe security liability even in private repositories, and how should configuration templates be structured?',
      focus: 'mechanism',
      hint: 'Git history preserves committed secrets forever, and collaborators get direct access to production infrastructure.',
      expectedKeywords: ['gitignore', 'history', 'template', 'env.example', 'leak', 'credentials'],
    },
  ],

  [ConceptId.INDEXING_QUERY_PERFORMANCE]: [
    {
      id: 'btree_index_mechanism',
      conceptId: ConceptId.INDEXING_QUERY_PERFORMANCE,
      question: 'How does a B-Tree index accelerate WHERE clause lookups, and why does a full table scan occur if no index matches the filter predicate?',
      focus: 'mechanism',
      hint: 'Compare O(log N) tree traversal against O(N) sequential page scans.',
      expectedKeywords: ['b-tree', 'log', 'scan', 'predicate', 'seek', 'pointer'],
    },
    {
      id: 'index_write_penalty_tradeoff',
      conceptId: ConceptId.INDEXING_QUERY_PERFORMANCE,
      question: 'What is the write penalty of adding multiple indexes to a high-throughput write-heavy table?',
      focus: 'tradeoff',
      hint: 'Every INSERT, UPDATE, or DELETE must update not only the table heap, but also every corresponding index tree.',
      expectedKeywords: ['write penalty', 'insert', 'tree', 'overhead', 'maintenance', 'update'],
    },
  ],

  [ConceptId.ERROR_HANDLING_LEAKAGE]: [
    {
      id: 'stack_trace_leakage_risk',
      conceptId: ConceptId.ERROR_HANDLING_LEAKAGE,
      question: 'Why must raw database errors and language stack traces never be returned to client HTTP responses in production?',
      focus: 'rationale',
      hint: 'Attackers use internal library versions, file paths, and database structures to craft targeted exploits.',
      expectedKeywords: ['stack trace', 'information disclosure', 'fingerprint', 'sanitized', 'internal'],
    },
    {
      id: 'centralized_error_middleware',
      conceptId: ConceptId.ERROR_HANDLING_LEAKAGE,
      question: 'How does a centralized error handling middleware ensure consistent HTTP status codes while safely capturing diagnostic logs on the server?',
      focus: 'mechanism',
      hint: 'Catch unexpected exceptions, log full diagnostic context to server logs, and return clean user-friendly JSON.',
      expectedKeywords: ['middleware', 'centralized', 'status code', 'telemetry', 'log', 'catch'],
    },
  ],
};
