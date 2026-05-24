import { ConceptId } from '../concepts/taxonomy.js';

/**
 * Standard evasion phrases and shortcuts that students or agents might use
 * to bypass answering Socratic checkpoints.
 */
export const EVASION_PHRASES: readonly string[] = [
  'idk',
  "i don't know",
  "i dont know",
  'no idea',
  'not sure',
  'just do it',
  'skip',
  'pass',
  'bypass',
  'whatever',
  'ignore',
  "don't care",
  "dont care",
  'just write it',
  'just code it',
  'proceed',
  'continue anyway',
  'who cares',
  'do it anyway',
  'yolo',
  'shrug',
  'dunno',
  'no clue',
  'leave me alone',
  'force write',
  'force',
  'n/a',
  'na',
  'none of your business',
  'skip question',
  'bypass check',
  'who knows',
  'just approve',
  'approve it',
];

/**
 * Comprehensive technical synonym dictionary mapping canonical concept keywords
 * to domain equivalents, abbreviations, and related operational phrases.
 */
export const TECHNICAL_SYNONYMS: Record<string, string[]> = {
  // Authentication & Secrets
  secret: [
    'jwt secret',
    'token secret',
    'signature secret',
    'app secret',
  ],
  environment: [
    'env',
    '.env',
    'environment variable',
    'environment variables',
    'env var',
    'env vars',
    'process.env',
    'config file',
    'secrets manager',
    'vault',
    'dotenv',
  ],
  git: [
    'github',
    'gitlab',
    'version control',
    'vcs',
    'repo',
    'repository',
    'public repo',
  ],
  leak: [
    'exposure',
    'expose',
    'exposed',
    'leaked',
    'compromise',
    'compromised',
    'stolen',
    'exfiltrate',
    'exfiltrated',
    'breach',
    'breached',
    'public repo',
    'github leak',
  ],
  expire: [
    'expiration',
    'expiry',
    'expires',
    'expired',
    'ttl',
    'lifetime',
    'validity',
    'timeout',
  ],
  refresh: [
    'refresh token',
    'rotation',
    'rotate',
    'rotating',
    'reissue',
    'renew',
    'renewal',
    'token rotation',
    'revoke',
    'revocation',
  ],
  sign: [
    'signature',
    'signing',
    'signed',
    'crypto',
    'cryptographic',
    'hmac',
    'rsa',
  ],
  verify: [
    'verification',
    'verifying',
    'validate',
    'validation',
    'check signature',
  ],
  forge: [
    'forgery',
    'forged',
    'tamper',
    'tampering',
    'tampered',
    'manipulated',
  ],
  asymmetric: [
    'rsa',
    'rs256',
    'public key',
    'private key',
    'keypair',
    'elliptic',
    'ecdsa',
    'distributed',
  ],

  // Database & Migrations
  idempotent: [
    'idempotency',
    'idempotence',
    'repeatable',
    're-runnable',
    'replayable',
    'safe to retry',
    're-run',
    'rerun',
    're-executable',
    'deterministic',
    'if not exists',
  ],
  retry: [
    're-try',
    'retried',
    'retrying',
    'rerun',
    're-executing',
    'redelivery',
    'backoff',
  ],
  downtime: [
    'outage',
    'unavailable',
    'disruption',
    'service break',
    'drop connection',
    'failover',
    'lockup',
  ],
  lock: [
    'locking',
    'table lock',
    'exclusive lock',
    'deadlock',
    'blocking',
    'row lock',
    'access exclusive',
    'ddl lock',
  ],
  parameter: [
    'parameterized',
    'parameterization',
    'placeholder',
    'bind variable',
    'prepared statement',
    'query param',
    'bind param',
    'prepared',
  ],
  prepared: [
    'prepared statement',
    'prepared statements',
    'pre-compiled',
  ],
  compile: [
    'compilation',
    'pre-compiled',
    'query plan',
    'ast',
    'execution plan',
  ],
  concatenate: [
    'concatenation',
    'string concat',
    'string interpolation',
    'template literal',
    'raw sql',
    'format string',
    'dynamic query',
  ],
  allowlist: [
    'whitelist',
    'safe list',
    'allowed columns',
    'sanitization',
    'escape identifier',
    'strict mapping',
  ],
  pool: [
    'pooling',
    'connection pool',
    'max connections',
    'socket pool',
    'client pool',
    'pooled client',
  ],
  exhaustion: [
    'exhaust',
    'exhausts',
    'exhausted',
    'starvation',
    'leak',
    'unclosed',
    'drain',
    'depleted',
    'pool dry',
    'socket leak',
    'hanging connection',
  ],
  serverless: [
    'lambda',
    'edge function',
    'cloud function',
    'ephemeral',
    'stateless',
    'scaling',
    'faas',
  ],
  proxy: [
    'pgbouncer',
    'connection proxy',
    'pooling proxy',
    'accelerate',
    'prisma accelerate',
    'connection multiplexer',
  ],

  // Concurrency & Async
  waterfall: [
    'sequential',
    'chain',
    'serial',
    'one by one',
    'series',
    'consecutive awaits',
    'await chain',
    'step by step',
  ],
  parallel: [
    'concurrent',
    'promise.all',
    'promise.allsettled',
    'simultaneous',
    'in parallel',
    'at the same time',
    'concurrently',
    'parallelize',
  ],
  short_circuit: [
    'short circuit',
    'short-circuit',
    'fail fast',
    'abort',
    'bail out',
    'reject early',
    'stop execution',
    'cancel all',
  ],
  settled: [
    'promise.allsettled',
    'resilient',
    'partial failure',
    'all settled',
    'graceful degradation',
  ],

  // Rate Limiting & Networking
  sliding_window: [
    'rolling window',
    'sliding counter',
    'token bucket',
    'leaky bucket',
    'windowing',
  ],
  burst: [
    'spike',
    'surge',
    'flood',
    'traffic peak',
    'traffic peaks',
    'rate burst',
    'ddos',
    'dos',
  ],
  ip: [
    'ip address',
    'client ip',
    'remote address',
    'cidr',
    'proxy ip',
    'nat',
  ],
  preflight: [
    'options request',
    'http options',
    'cors check',
    'pre-flight',
    'options call',
  ],
  origin: [
    'domain',
    'cors origin',
    'allow-origin',
    'cross-origin',
    'trusted origin',
  ],
  credentials: [
    'cookies',
    'withcredentials',
    'auth header',
    'authorization',
    'session cookie',
    'bearer',
  ],

  // Passwords & Hashing
  salt: [
    'salting',
    'cryptographic salt',
    'random bytes',
    'nonce',
    'per-user salt',
    'unique salt',
    'salted hash',
  ],
  rainbow: [
    'rainbow table',
    'precomputed hash',
    'lookup table',
    'reverse hash',
    'dictionary attack',
    'precomputed',
  ],
  work_factor: [
    'cost factor',
    'rounds',
    'iterations',
    'memory cost',
    'time cost',
    'stretching',
    'adaptive',
  ],
  argon2: [
    'argon2id',
    'bcrypt',
    'scrypt',
    'pbkdf2',
    'slow hash',
  ],

  // Transactions & ACID
  atomic: [
    'atomicity',
    'all or nothing',
    'all-or-nothing',
    'indivisible',
    'acid',
    'transactional',
  ],
  rollback: [
    'revert',
    'abort',
    'undo',
    'transaction rollback',
    'wal',
    'write-ahead log',
    'undo log',
  ],
  isolation: [
    'read committed',
    'serializable',
    'repeatable read',
    'dirty read',
    'phantom read',
    'isolation level',
  ],

  // Caching
  cache_aside: [
    'lazy loading',
    'cache lookaside',
    'read-through',
    'write-through',
    'eviction',
    'cache aside',
  ],
  stampede: [
    'thundering herd',
    'dogpile',
    'cache miss storm',
    'simultaneous misses',
    'herd',
  ],
  ttl: [
    'time to live',
    'expiration',
    'stale time',
    'max-age',
    'evict',
    'cache expiry',
  ],

  // Workers & Queues
  idempotency: [
    'idempotency key',
    'deduplication id',
    'unique transaction id',
    'idempotent token',
    'unique key',
  ],
  dlq: [
    'dead letter queue',
    'dead-letter',
    'failed queue',
    'poison message',
    'poison pill',
    'quarantine queue',
  ],

  // Input Validation
  parse: [
    'parse not validate',
    'zod',
    'pydantic',
    'schema parse',
    'type narrow',
    'strip extra',
    'runtime validation',
    'safe parse',
  ],
  mass_assignment: [
    'over-posting',
    'parameter injection',
    'prototype pollution',
    'unfiltered body',
    'blind insert',
    'privilege escalation',
  ],

  // Configuration
  client_bundle: [
    'public bundle',
    'browser js',
    'frontend code',
    'vite build',
    'nextjs public',
    'client-side',
    'bundle',
  ],

  // Performance & Indexing
  btree: [
    'b-tree',
    'binary tree',
    'index lookup',
    'tree traversal',
    'o(log n)',
    'indexed scan',
    'index seek',
  ],
  full_scan: [
    'table scan',
    'sequential scan',
    'seq scan',
    'o(n) scan',
    'full table scan',
    'sequential scans',
  ],
  write_penalty: [
    'insert overhead',
    'index overhead',
    'maintenance cost',
    'slower writes',
    'write amplification',
  ],

  // Error Handling
  stack_trace: [
    'stacktrace',
    'traceback',
    'internal error',
    'system path',
    'debug info',
    'error leak',
    'information disclosure',
  ],
  middleware: [
    'error handler',
    'centralized error',
    'global exception filter',
    'error wrapper',
    'catch block',
  ],

  // React State Management & Immutability
  're-render': [
    'rerender',
    're-renders',
    'rerenders',
    'rendering',
    'render loop',
    'render cascade',
  ],
  dependency: [
    'dependencies',
    'dependency array',
    'deps',
    'deps array',
    'exhaustive-deps',
  ],
  'functional update': [
    'functional setter',
    'prev state',
    'previous state',
    'updater function',
    'callback update',
    'setstate callback',
  ],
  mutation: [
    'mutating',
    'mutate',
    'in-place',
    'direct modification',
    'in place',
    'array push',
  ],
  'structural sharing': [
    'reference preservation',
    'persistent data structure',
    'unchanged branches',
    'immutable tree',
  ],
  'shallow copy': [
    'object spread',
    'array spread',
    'spread syntax',
    'spread operator',
    'slice',
    'clone',
    'new object',
  ],
  'reference equality': [
    'object.is',
    'referential equality',
    'pointer equality',
    'shallow comparison',
    'same reference',
    'reference comparison',
  ],
  'idempotency-key': [
    'idempotency key',
    'idempotent key',
    'unique request key',
    'idempotency token',
    'request deduplication',
  ],
  'distributed lock': [
    'atomic lock',
    'redis lock',
    'redlock',
    'mutex',
    'setnx',
    'reservation lock',
  ],
  componentdidcatch: [
    'error boundary',
    'error boundaries',
    'getderivedstatefromerror',
    'react error boundary',
  ],
  'fault isolation': [
    'blast radius',
    'isolated failure',
    'graceful degradation',
    'localized error',
    'sub-tree boundary',
  ],
};

/**
 * A mechanism group encapsulates a specific conceptual requirement of an answer.
 */
export interface MechanismGroup {
  name: string;
  description: string;
  keywords: string[];
}

/**
 * Rubric definition for evaluating answers to Socratic checkpoints.
 */
export interface ConceptRubric {
  conceptId: ConceptId;
  name: string;
  minDistinctMechanisms: number;
  mechanisms: MechanismGroup[];
  antiPatterns?: string[];
}

/**
 * Curated keyword rubrics for all 15 core full-stack concepts.
 */
export const CONCEPT_RUBRICS: Record<ConceptId, ConceptRubric> = {
  [ConceptId.JWT_SECRET_HYGIENE]: {
    conceptId: ConceptId.JWT_SECRET_HYGIENE,
    name: 'JWT Secret & Key Hygiene',
    minDistinctMechanisms: 2,
    mechanisms: [
      {
        name: 'Environment / Storage Isolation',
        description: 'Keeping secrets in process environment, vault, or config rather than hardcoded.',
        keywords: ['environment', 'env', '.env', 'process.env', 'vault', 'secrets manager', 'config'],
      },
      {
        name: 'Exposure / Git Leak Prevention',
        description: 'Preventing commit to version control, public repository exposure, or unauthorized access.',
        keywords: ['git', 'leak', 'exposure', 'public repo', 'commit', 'stolen', 'compromise', 'breach'],
      },
      {
        name: 'Cryptography / Signature Integrity',
        description: 'Protecting token signing, signature verification, and preventing forgery or tampering.',
        keywords: ['sign', 'signature', 'verify', 'tamper', 'forge', 'hmac', 'private key', 'asymmetric'],
      },
    ],
  },

  [ConceptId.DB_MIGRATION_IDEMPOTENCY]: {
    conceptId: ConceptId.DB_MIGRATION_IDEMPOTENCY,
    name: 'Database Migration Idempotency',
    minDistinctMechanisms: 2,
    mechanisms: [
      {
        name: 'Idempotency & Safe Retries',
        description: 'Migrations can be safely rerun or retried without duplicate tables or errors.',
        keywords: ['idempotent', 'idempotency', 'retry', 'rerun', 'repeatable', 'safe to retry', 'if not exists'],
      },
      {
        name: 'Failure & Pipeline Reliability',
        description: 'Handling pipeline aborts, rollback safety, and transactional consistency in deployments.',
        keywords: ['failure', 'rollback', 'ci/cd', 'deploy', 'pipeline', 'aborted', 'transaction'],
      },
      {
        name: 'Schema Safety & Zero Downtime',
        description: 'Preventing table locks, replication lag, and using expand-and-contract patterns.',
        keywords: ['lock', 'table lock', 'blocking', 'downtime', 'expand', 'contract', 'parallel run', 'backward compatible'],
      },
    ],
  },

  [ConceptId.SQL_INJECTION_PREVENTION]: {
    conceptId: ConceptId.SQL_INJECTION_PREVENTION,
    name: 'SQL Injection Prevention',
    minDistinctMechanisms: 2,
    mechanisms: [
      {
        name: 'Parameterization & Prepared Statements',
        description: 'Using placeholders and prepared statements to bind data values.',
        keywords: ['parameter', 'parameterized', 'prepared statement', 'placeholder', 'bind variable', 'bind param', 'prepared'],
      },
      {
        name: 'Code vs Data Separation',
        description: 'Separating SQL query syntax compilation from literal user data execution.',
        keywords: ['code', 'data', 'separate', 'compile', 'ast', 'execution plan', 'protocol'],
      },
      {
        name: 'String Concatenation Vulnerability',
        description: 'Explaining why concatenating or interpolating user strings introduces injection risks.',
        keywords: ['concatenate', 'concatenation', 'interpolation', 'raw sql', 'format string', 'bypass', 'escape'],
      },
    ],
  },

  [ConceptId.CONNECTION_POOL_MANAGEMENT]: {
    conceptId: ConceptId.CONNECTION_POOL_MANAGEMENT,
    name: 'Database Connection Pooling',
    minDistinctMechanisms: 2,
    mechanisms: [
      {
        name: 'Connection Exhaustion & Leaks',
        description: 'Unclosed connections or high concurrency depleting available database sockets.',
        keywords: ['exhaustion', 'exhaust', 'leak', 'unclosed', 'starvation', 'depleted', 'hanging', 'socket leak'],
      },
      {
        name: 'Pool Lifecycle Management',
        description: 'Reusing database clients, sizing maximum connections, and releasing resources.',
        keywords: ['pool', 'pooling', 'acquire', 'release', 'max connections', 'reuse', 'lifecycle'],
      },
      {
        name: 'Serverless Scaling & Proxies',
        description: 'Handling ephemeral cloud function scaling with proxies like PgBouncer.',
        keywords: ['serverless', 'lambda', 'scale', 'proxy', 'pgbouncer', 'accelerate', 'concurrency'],
      },
    ],
  },

  [ConceptId.ASYNC_WATERFALL_MITIGATION]: {
    conceptId: ConceptId.ASYNC_WATERFALL_MITIGATION,
    name: 'Async Waterfall & Concurrency Mitigation',
    minDistinctMechanisms: 2,
    mechanisms: [
      {
        name: 'Waterfall & Sequential Latency',
        description: 'Unnecessary serial awaits accumulating response latency.',
        keywords: ['waterfall', 'sequential', 'serial', 'consecutive', 'await chain', 'latency', 'accumulate'],
      },
      {
        name: 'Parallel & Concurrent Execution',
        description: 'Executing independent promises concurrently using Promise.all or Promise.allSettled.',
        keywords: ['parallel', 'concurrent', 'concurrently', 'promise.all', 'promise.allsettled', 'simultaneous', 'independent'],
      },
      {
        name: 'Failure Semantics',
        description: 'Short-circuiting on rejection versus resilient partial failure handling.',
        keywords: ['short-circuit', 'fail fast', 'reject', 'settled', 'resilient', 'partial failure'],
      },
    ],
  },

  [ConceptId.RATE_LIMITING_DOS]: {
    conceptId: ConceptId.RATE_LIMITING_DOS,
    name: 'Rate Limiting & DoS Protection',
    minDistinctMechanisms: 2,
    mechanisms: [
      {
        name: 'Rate Limiting Algorithms',
        description: 'Employing sliding window, token bucket, or leaky bucket counters.',
        keywords: ['sliding window', 'token bucket', 'leaky bucket', 'counter', 'rate limit', 'throttling'],
      },
      {
        name: 'Traffic Spikes & Abuse Prevention',
        description: 'Protecting backend resources from sudden bursts, DoS, and brute-force attempts.',
        keywords: ['burst', 'spike', 'dos', 'ddos', 'abuse', 'brute force', 'traffic peak'],
      },
      {
        name: 'Client Identification',
        description: 'Distinguishing between IP-based limits (NAT sharing) and authenticated user accounts.',
        keywords: ['ip', 'client ip', 'nat', 'user id', 'authenticated', 'shared ip'],
      },
    ],
  },

  [ConceptId.CORS_ORIGIN_SECURITY]: {
    conceptId: ConceptId.CORS_ORIGIN_SECURITY,
    name: 'CORS Configuration & Origin Security',
    minDistinctMechanisms: 2,
    mechanisms: [
      {
        name: 'Origin Validation & Allowlists',
        description: 'Restricting access to trusted domains rather than permissive wildcards.',
        keywords: ['origin', 'allow-origin', 'domain', 'whitelist', 'allowlist', 'cross-origin'],
      },
      {
        name: 'Browser Enforcement & Preflight',
        description: 'HTTP OPTIONS preflight negotiations and browser-enforced same-origin policy.',
        keywords: ['preflight', 'options', 'browser', 'header', 'same-origin', 'sop'],
      },
      {
        name: 'Credentials & Cookie Isolation',
        description: 'Preventing cross-origin token or cookie exfiltration when credentials are exchanged.',
        keywords: ['credential', 'credentials', 'cookie', 'cookies', 'withcredentials', 'wildcard', 'csrf'],
      },
    ],
  },

  [ConceptId.PASSWORD_HASHING_SALT]: {
    conceptId: ConceptId.PASSWORD_HASHING_SALT,
    name: 'Password Hashing & Cryptographic Salting',
    minDistinctMechanisms: 2,
    mechanisms: [
      {
        name: 'Cryptographic Salt & Uniqueness',
        description: 'Using unique random per-user salt to ensure identical passwords produce distinct hashes.',
        keywords: ['salt', 'salting', 'random bytes', 'nonce', 'per-user', 'unique salt'],
      },
      {
        name: 'Rainbow Tables & Precomputation',
        description: 'Preventing lookup table and precomputed dictionary attacks.',
        keywords: ['rainbow', 'rainbow table', 'precomputed', 'dictionary attack', 'lookup table', 'reverse hash'],
      },
      {
        name: 'Adaptive Work Factors',
        description: 'Tunable computation cost in Argon2id or bcrypt defending against hardware/GPU brute-force.',
        keywords: ['work factor', 'cost', 'iterations', 'argon2', 'argon2id', 'bcrypt', 'gpu', 'slow hash'],
      },
    ],
  },

  [ConceptId.TRANSACTION_ATOMICITY_ACID]: {
    conceptId: ConceptId.TRANSACTION_ATOMICITY_ACID,
    name: 'Transaction Atomicity & ACID Boundaries',
    minDistinctMechanisms: 2,
    mechanisms: [
      {
        name: 'Atomicity & All-or-Nothing',
        description: 'Ensuring multi-step mutations succeed together or leave no partial state.',
        keywords: ['atomic', 'atomicity', 'all or nothing', 'all-or-nothing', 'indivisible', 'acid'],
      },
      {
        name: 'Rollback & Consistency',
        description: 'Rolling back write-ahead logs to restore consistent database state upon error.',
        keywords: ['rollback', 'commit', 'wal', 'write-ahead log', 'consistent', 'partial write', 'undo'],
      },
      {
        name: 'Isolation & Concurrency',
        description: 'Controlling dirty reads, phantoms, and lock contention between concurrent transactions.',
        keywords: ['isolation', 'serializable', 'read committed', 'dirty read', 'lock', 'contention'],
      },
    ],
  },

  [ConceptId.CACHE_INVALIDATION_STRATEGY]: {
    conceptId: ConceptId.CACHE_INVALIDATION_STRATEGY,
    name: 'Cache Invalidation & Freshness',
    minDistinctMechanisms: 2,
    mechanisms: [
      {
        name: 'Invalidation & Eviction',
        description: 'Expiring keys via TTL or proactively evicting cached entries on write mutations.',
        keywords: ['invalidation', 'invalidate', 'evict', 'eviction', 'ttl', 'stale', 'time to live'],
      },
      {
        name: 'Cache Patterns',
        description: 'Implementing cache-aside, write-through, or lazy-loading structures.',
        keywords: ['cache-aside', 'cache aside', 'lookaside', 'lazy loading', 'read-through', 'write-through'],
      },
      {
        name: 'Thundering Herd & Stampede',
        description: 'Mitigating simultaneous cache miss storms and database spikes.',
        keywords: ['stampede', 'thundering herd', 'dogpile', 'mutex', 'spike', 'traffic storm'],
      },
    ],
  },

  [ConceptId.BACKGROUND_JOB_RETRY_IDEMPOTENCY]: {
    conceptId: ConceptId.BACKGROUND_JOB_RETRY_IDEMPOTENCY,
    name: 'Background Job Idempotency & Retries',
    minDistinctMechanisms: 2,
    mechanisms: [
      {
        name: 'Idempotency Keys & Deduplication',
        description: 'Tracking unique operation IDs to detect and discard duplicate processing attempts.',
        keywords: ['idempotency', 'idempotency key', 'deduplication', 'unique token', 'idempotent'],
      },
      {
        name: 'Retries & Duplicate Side Effects',
        description: 'Safeguarding external actions (charges, notifications) from repeated execution on failure.',
        keywords: ['retry', 'retries', 'side-effect', 'double charge', 'duplicate email', 'worker'],
      },
      {
        name: 'Dead Letter Queues & Poison Messages',
        description: 'Quarantining unrecoverable failing jobs to prevent infinite worker crashing.',
        keywords: ['dead letter', 'dlq', 'poison pill', 'poison message', 'quarantine', 'backoff'],
      },
    ],
  },

  [ConceptId.INPUT_VALIDATION_SANITIZATION]: {
    conceptId: ConceptId.INPUT_VALIDATION_SANITIZATION,
    name: 'Schema-Driven Input Validation & Sanitization',
    minDistinctMechanisms: 2,
    mechanisms: [
      {
        name: 'Schema Parsing & Type Narrowing',
        description: 'Parsing input payloads with Zod or Pydantic to enforce strong runtime types.',
        keywords: ['parse', 'parse not validate', 'zod', 'pydantic', 'schema', 'type narrowing'],
      },
      {
        name: 'Boundary Sanitization',
        description: 'Stripping unexpected payload fields and sanitizing external input before internal use.',
        keywords: ['strip', 'sanitize', 'whitelist', 'boundary', 'unknown fields', 'escape'],
      },
      {
        name: 'Mass Assignment Prevention',
        description: 'Guarding against unauthorized field injection (such as isAdmin or accountBalance).',
        keywords: ['mass assignment', 'over-posting', 'injection', 'xss', 'payload', 'privilege'],
      },
    ],
  },

  [ConceptId.ENV_SECRET_ISOLATION]: {
    conceptId: ConceptId.ENV_SECRET_ISOLATION,
    name: 'Environment & Secret Isolation',
    minDistinctMechanisms: 2,
    mechanisms: [
      {
        name: 'Client Bundle Exposure',
        description: 'Preventing server secrets from being statically bundled into browser JavaScript.',
        keywords: ['client', 'public', 'bundle', 'browser', 'compile', 'baked', 'next_public', 'vite_'],
      },
      {
        name: 'Version Control Exclusion',
        description: 'Ensuring .env files and active secrets are excluded from Git repository history.',
        keywords: ['gitignore', '.gitignore', 'git history', 'commit', 'leak', 'repo'],
      },
      {
        name: 'Secret Management & Isolation',
        description: 'Using dedicated secret managers or server-only environment variable isolation.',
        keywords: ['secrets manager', 'vault', 'process.env', 'server-only', 'isolation', 'dotenv'],
      },
    ],
  },

  [ConceptId.INDEXING_QUERY_PERFORMANCE]: {
    conceptId: ConceptId.INDEXING_QUERY_PERFORMANCE,
    name: 'Database Indexing & Query Planning',
    minDistinctMechanisms: 2,
    mechanisms: [
      {
        name: 'B-Tree Traversal & Fast Lookups',
        description: 'Using O(log N) tree index seeks instead of sequential row scanning.',
        keywords: ['b-tree', 'btree', 'tree', 'o(log n)', 'seek', 'index lookup', 'binary tree'],
      },
      {
        name: 'Full Table Scans',
        description: 'Identifying performance degradation caused by O(N) sequential table scans.',
        keywords: ['full table scan', 'table scan', 'sequential scan', 'seq scan', 'o(n)'],
      },
      {
        name: 'Write Penalty & Overhead',
        description: 'Balancing read optimization with index update costs on insert, update, and delete.',
        keywords: ['write penalty', 'overhead', 'insert', 'update', 'maintenance', 'amplification'],
      },
    ],
  },

  [ConceptId.ERROR_HANDLING_LEAKAGE]: {
    conceptId: ConceptId.ERROR_HANDLING_LEAKAGE,
    name: 'Error Handling & Information Leakage',
    minDistinctMechanisms: 2,
    mechanisms: [
      {
        name: 'Information Disclosure & Stack Traces',
        description: 'Preventing internal stack traces, system paths, and DB schemas from reaching clients.',
        keywords: ['stack trace', 'stacktrace', 'information disclosure', 'fingerprint', 'internal path', 'leak'],
      },
      {
        name: 'Sanitized Responses',
        description: 'Returning clean, generic HTTP error messages and standardized status codes.',
        keywords: ['sanitized', 'generic error', 'status code', 'user-friendly', 'mask'],
      },
      {
        name: 'Centralized Logging & Telemetry',
        description: 'Using centralized error middleware to safely capture diagnostics on the server.',
        keywords: ['middleware', 'centralized', 'global handler', 'telemetry', 'logger', 'logging'],
      },
    ],
  },

  [ConceptId.STATE_RENDER_LOOP]: {
    conceptId: ConceptId.STATE_RENDER_LOOP,
    name: 'React State & Re-render Loops',
    minDistinctMechanisms: 2,
    mechanisms: [
      {
        name: 'Dependency Array & Effect Lifecycles',
        description: 'Specifying exhaustive dependencies to prevent unintended effect executions and infinite loops.',
        keywords: ['dependency', 'dependencies', 'dependency array', 'useeffect', 'effect', 'stale closure', 'exhaustive-deps'],
      },
      {
        name: 'Functional State Updaters & Batching',
        description: 'Passing updater callbacks (prev => ...) to state setters to guarantee updates against fresh state.',
        keywords: ['functional update', 'functional setter', 'prev state', 'previous state', 'updater', 'setstate', 'batching'],
      },
      {
        name: 'Render Loop Lifecycle & Recursion',
        description: 'Preventing state setters from triggering recursive cascading re-render cascades.',
        keywords: ['infinite loop', 're-render', 'render loop', 'infinite render', 'rerender', 'lifecycle', 'trigger render'],
      },
    ],
  },

  [ConceptId.STATE_IMMUTABILITY]: {
    conceptId: ConceptId.STATE_IMMUTABILITY,
    name: 'State Immutability & Structural Sharing',
    minDistinctMechanisms: 2,
    mechanisms: [
      {
        name: 'Reference Equality & Change Detection',
        description: 'React and state managers rely on reference comparisons (Object.is) to detect changes.',
        keywords: ['reference equality', 'reference check', 'object.is', 'shallow compare', 'pointer', 'identity', 'change detection'],
      },
      {
        name: 'Shallow Copying & Structural Sharing',
        description: 'Creating new top-level container references while retaining references to unchanged nested trees.',
        keywords: ['shallow copy', 'spread operator', 'spread syntax', 'structural sharing', 'new object', 'clone', 'slice', 'map', 'filter'],
      },
      {
        name: 'Direct Mutation Hazards',
        description: 'Direct array or object property mutation circumvents state tracking and introduces silent UI bugs.',
        keywords: ['direct mutation', 'mutate', 'push', 'splice', 'in-place', 'stale ui', 'side-effect'],
      },
    ],
  },

  [ConceptId.API_IDEMPOTENCY]: {
    conceptId: ConceptId.API_IDEMPOTENCY,
    name: 'API Idempotency & Replay Safety',
    minDistinctMechanisms: 2,
    mechanisms: [
      {
        name: 'Idempotency Key & Header Processing',
        description: 'Using unique request keys (Idempotency-Key header) to identify and deduplicate repeated requests.',
        keywords: ['idempotency-key', 'idempotency key', 'idempotent', 'unique request key', 'header', 'deduplication', 'retry'],
      },
      {
        name: 'In-Flight Locking & Race Prevention',
        description: 'Acquiring an atomic reservation lock (e.g. Redis SETNX) to ensure only one in-flight request processes.',
        keywords: ['atomic lock', 'distributed lock', 'setnx', 'reservation', 'concurrent', 'race condition', 'in-flight', 'mutex'],
      },
      {
        name: 'Cached Response Replay & TTL',
        description: 'Caching processed response payloads with TTL to return identical results upon duplicate retry.',
        keywords: ['cached response', 'replay response', 'save response', 'ttl', 'replay', 'duplicate request', 'timeout'],
      },
    ],
  },

  [ConceptId.RATE_LIMITING]: {
    conceptId: ConceptId.RATE_LIMITING,
    name: 'API Rate Limiting Algorithms',
    minDistinctMechanisms: 2,
    mechanisms: [
      {
        name: 'Rate Limiting Algorithms & Burst Handling',
        description: 'Managing traffic bursts using token bucket, leaky bucket, or sliding window counters.',
        keywords: ['token bucket', 'leaky bucket', 'sliding window', 'fixed window', 'burst', 'refill', 'capacity'],
      },
      {
        name: 'Throttling & HTTP 429 Status',
        description: 'Rejecting excessive requests with HTTP 429 and communicating limits with Retry-After and rate limit headers.',
        keywords: ['429', 'too many requests', 'retry-after', 'headers', 'throttle', 'exhaustion', 'rate limit'],
      },
      {
        name: 'Distributed Enforcement & Gateways',
        description: 'Enforcing rate limits via distributed counters (Redis) or edge reverse proxies (Cloudflare, Nginx).',
        keywords: ['redis', 'gateway', 'reverse proxy', 'counter', 'atomic increment', 'cloudflare', 'middleware'],
      },
    ],
  },

  [ConceptId.ERROR_BOUNDARY]: {
    conceptId: ConceptId.ERROR_BOUNDARY,
    name: 'UI Error Boundaries & Fault Isolation',
    minDistinctMechanisms: 2,
    mechanisms: [
      {
        name: 'Lifecycle Catching & Fallback UI',
        description: 'Implementing getDerivedStateFromError and componentDidCatch to catch render errors and show fallback UI.',
        keywords: ['componentdidcatch', 'getderivedstatefromerror', 'fallback ui', 'fallback', 'white screen', 'catch error'],
      },
      {
        name: 'Lifecycle Scope & Async Limitations',
        description: 'Recognizing that error boundaries catch rendering errors but do not catch async or event handler errors.',
        keywords: ['asynchronous', 'event handler', 'settimeout', 'rendering', 'reconciliation', 'async', 'lifecycle'],
      },
      {
        name: 'Granularity & Fault Isolation',
        description: 'Placing localized error boundaries around components to isolate failures and maintain overall app stability.',
        keywords: ['localized', 'fault isolation', 'widget', 'sub-tree', 'sub tree', 'blast radius', 'graceful degradation'],
      },
    ],
  },
};

/**
 * Checks whether a given student answer is an evasive shortcut or non-answer.
 */
export function isEvasionAnswer(answer: string): boolean {
  if (!answer || answer.trim().length === 0) {
    return true;
  }

  const normalized = answer
    .toLowerCase()
    .trim()
    .replace(/['’]/g, '')
    .replace(/[.,!?;:"()[\]{}`\\/]/g, ' ')
    .replace(/\s+/g, ' ');

  // Direct exact match
  for (const phrase of EVASION_PHRASES) {
    const cleanPhrase = phrase.replace(/['’]/g, '');
    if (normalized === cleanPhrase) return true;
    if (normalized.startsWith(`${cleanPhrase} `) && normalized.length < cleanPhrase.length + 30) {
      return true;
    }
  }

  // Very short response with low informational content (< 10 chars and not containing key words)
  if (normalized.length < 10) {
    return true;
  }

  return false;
}

/**
 * Expands a keyword with all its known technical synonyms.
 */
export function expandSynonyms(keyword: string): string[] {
  const kwLower = keyword.toLowerCase().trim();
  const results = new Set<string>([kwLower]);

  // Check direct key in TECHNICAL_SYNONYMS
  if (TECHNICAL_SYNONYMS[kwLower]) {
    for (const syn of TECHNICAL_SYNONYMS[kwLower]) {
      results.add(syn.toLowerCase());
    }
  }

  // Check if kwLower is inside any synonym array
  for (const [canonical, syns] of Object.entries(TECHNICAL_SYNONYMS)) {
    const synsLower = syns.map((s) => s.toLowerCase());
    if (synsLower.includes(kwLower)) {
      results.add(canonical.toLowerCase());
      for (const s of synsLower) {
        results.add(s);
      }
    }
  }

  return Array.from(results);
}
