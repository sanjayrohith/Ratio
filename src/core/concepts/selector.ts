import { LayerCategory } from '../scorer/layers.js';
import { ConceptId } from './taxonomy.js';
import { QUESTION_CATALOG, SocraticQuestion } from './catalog.js';

export interface SelectorContext {
  filePath: string;
  layers: LayerCategory[];
  contentDiff?: string;
  newDependencies?: string[];
  lineDelta?: number;
}

export interface SelectedQuestionResult {
  conceptId: ConceptId;
  question: SocraticQuestion;
  rationale: string;
}

/**
 * QuestionSelector matches touched files, architectural layers, and content keywords
 * to the most appropriate Socratic question in the catalog.
 */
export class QuestionSelector {
  /**
   * Selects an appropriate Socratic question for an intercepted file write.
   */
  public select(context: SelectorContext): SelectedQuestionResult {
    const filePathLower = context.filePath.toLowerCase();
    const diffLower = (context.contentDiff ?? '').toLowerCase();

    // 1. Check content patterns first (high specificity)
    if (this.hasKeywords(diffLower, ['jwt', 'jsonwebtoken', 'sign(', 'verify(', 'bearer'])) {
      return this.pickQuestion(
        ConceptId.JWT_SECRET_HYGIENE,
        'Detected JWT token creation, signature verification, or authentication payload.'
      );
    }

    if (this.hasKeywords(diffLower, ['bcrypt', 'argon2', 'pbkdf2', 'password_hash', 'salt'])) {
      return this.pickQuestion(
        ConceptId.PASSWORD_HASHING_SALT,
        'Detected password hashing or cryptographic salt logic.'
      );
    }

    if (this.hasKeywords(diffLower, ['create table', 'alter table', 'add column', 'migration', 'drop table'])) {
      return this.pickQuestion(
        ConceptId.DB_MIGRATION_IDEMPOTENCY,
        'Detected database schema modifications or migration statements.'
      );
    }

    if (
      this.hasKeywords(diffLower, ['select *', 'execute(', 'raw(', 'query(']) &&
      this.hasKeywords(diffLower, ['+', '${', '%s', 'format('])
    ) {
      return this.pickQuestion(
        ConceptId.SQL_INJECTION_PREVENTION,
        'Detected dynamic string interpolation or raw database query construction.'
      );
    }

    if (this.hasKeywords(diffLower, ['pool', 'max_connections', 'createpool', 'pgbouncer', 'pooledclient'])) {
      return this.pickQuestion(
        ConceptId.CONNECTION_POOL_MANAGEMENT,
        'Detected database client connection pool configuration or lifecycle.'
      );
    }

    if (this.hasKeywords(diffLower, ['cors', 'access-control-allow', 'origin:', 'credentials: true'])) {
      return this.pickQuestion(
        ConceptId.CORS_ORIGIN_SECURITY,
        'Detected cross-origin resource sharing (CORS) header or middleware modifications.'
      );
    }

    if (this.hasKeywords(diffLower, ['ratelimit', 'limiter', 'tokenbucket', '429', 'throttling'])) {
      return this.pickQuestion(
        ConceptId.RATE_LIMITING_DOS,
        'Detected request rate limiting or denial of service protection rules.'
      );
    }

    if (this.hasKeywords(diffLower, ['begin', 'commit', 'rollback', 'transaction(', '$transaction'])) {
      return this.pickQuestion(
        ConceptId.TRANSACTION_ATOMICITY_ACID,
        'Detected multi-step database transaction boundary logic.'
      );
    }

    if (this.hasKeywords(diffLower, ['redis', 'cache', 'memcached', 'stale', 'cache-aside', 'ttl'])) {
      return this.pickQuestion(
        ConceptId.CACHE_INVALIDATION_STRATEGY,
        'Detected caching logic, cache eviction, or expiration configuration.'
      );
    }

    if (this.hasKeywords(diffLower, ['bullmq', 'celery', 'sqs', 'rabbitmq', 'queue', 'job', 'worker'])) {
      return this.pickQuestion(
        ConceptId.BACKGROUND_JOB_RETRY_IDEMPOTENCY,
        'Detected background worker task processing or message queue consumer logic.'
      );
    }

    if (this.hasKeywords(diffLower, ['zod', 'pydantic', 'joi', 'validator', 'schema.parse'])) {
      return this.pickQuestion(
        ConceptId.INPUT_VALIDATION_SANITIZATION,
        'Detected external input schema parsing and request validation.'
      );
    }

    if (this.hasKeywords(diffLower, ['createindex', 'add_index', 'btree', 'index on', 'covering'])) {
      return this.pickQuestion(
        ConceptId.INDEXING_QUERY_PERFORMANCE,
        'Detected database index creation or query optimization.'
      );
    }

    if (this.hasKeywords(diffLower, ['process.env', 'dotenv', 'env(', 'getenv(', 'os.environ'])) {
      return this.pickQuestion(
        ConceptId.ENV_SECRET_ISOLATION,
        'Detected environment variable access or configuration secret loading.'
      );
    }

    if (this.hasKeywords(diffLower, ['try {', 'catch', 'throw new', 'next(err)', 'errorhandler'])) {
      return this.pickQuestion(
        ConceptId.ERROR_HANDLING_LEAKAGE,
        'Detected exception handling, error bubbling, or error response formatting.'
      );
    }

    // 2. Check file path heuristics
    if (filePathLower.includes('migration') || filePathLower.endsWith('.sql')) {
      return this.pickQuestion(
        ConceptId.DB_MIGRATION_IDEMPOTENCY,
        'File is a database migration or SQL schema definition.'
      );
    }

    if (filePathLower.includes('.env') || filePathLower.includes('config')) {
      return this.pickQuestion(
        ConceptId.ENV_SECRET_ISOLATION,
        'File manages environment variables or secret configuration.'
      );
    }

    if (filePathLower.includes('auth') || filePathLower.includes('jwt')) {
      return this.pickQuestion(
        ConceptId.JWT_SECRET_HYGIENE,
        'File is part of the authentication and authorization layer.'
      );
    }

    if (filePathLower.includes('worker') || filePathLower.includes('queue') || filePathLower.includes('job')) {
      return this.pickQuestion(
        ConceptId.BACKGROUND_JOB_RETRY_IDEMPOTENCY,
        'File defines background workers or queue tasks.'
      );
    }

    // 3. Fallback based on architectural layer category
    if (context.layers.includes('auth')) {
      return this.pickQuestion(
        ConceptId.JWT_SECRET_HYGIENE,
        'Architectural layer is auth.'
      );
    }
    if (context.layers.includes('db')) {
      return this.pickQuestion(
        ConceptId.DB_MIGRATION_IDEMPOTENCY,
        'Architectural layer is database.'
      );
    }
    if (context.layers.includes('worker')) {
      return this.pickQuestion(
        ConceptId.BACKGROUND_JOB_RETRY_IDEMPOTENCY,
        'Architectural layer is worker.'
      );
    }
    if (context.layers.includes('api')) {
      return this.pickQuestion(
        ConceptId.RATE_LIMITING_DOS,
        'Architectural layer is API.'
      );
    }
    if (context.layers.includes('config')) {
      return this.pickQuestion(
        ConceptId.ENV_SECRET_ISOLATION,
        'Architectural layer is configuration.'
      );
    }

    // 4. Ultimate fallback: async waterfall / concurrency trade-off
    return this.pickQuestion(
      ConceptId.ASYNC_WATERFALL_MITIGATION,
      'General architectural modification affecting core application concurrency.'
    );
  }

  private hasKeywords(text: string, keywords: string[]): boolean {
    return keywords.some((kw) => text.includes(kw.toLowerCase()));
  }

  private pickQuestion(conceptId: ConceptId, rationale: string): SelectedQuestionResult {
    const questions = QUESTION_CATALOG[conceptId];
    if (!questions || questions.length === 0) {
      throw new Error(`No Socratic questions registered for concept: ${conceptId}`);
    }

    // Return the first question by default (or can cycle based on ticket)
    const question = questions[0];
    return {
      conceptId,
      question,
      rationale,
    };
  }
}
