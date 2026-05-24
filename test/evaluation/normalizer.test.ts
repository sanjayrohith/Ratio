import { describe, expect, it } from 'bun:test';
import { TextNormalizer, defaultTextNormalizer } from '../../src/core/evaluation/normalizer.js';

describe('Text Normalizer, Stemmer, and Fuzzy Matching Unit Tests', () => {
  const normalizer = new TextNormalizer();

  describe('Text Normalization and Tokenization', () => {
    it('lowercases and collapses multiple whitespace characters', () => {
      const input = '   SELECT   *   FROM   Users\n\tWHERE id = 1   ';
      const output = normalizer.normalize(input);
      expect(output).toBe('select from users where id 1');
    });

    it('removes punctuation symbols and strips apostrophes in contractions', () => {
      const input = "don't leak API_KEY in process.env; (use Redis/TLS!)";
      const output = normalizer.normalize(input);
      expect(output).toBe('dont leak api key in process env use redis tls');
    });

    it('tokenizes text into discrete lowercase words without punctuation', () => {
      const tokens = normalizer.tokenize('Idempotency-Key, Cache-Control: max-age=3600');
      expect(tokens).toEqual(['idempotency', 'key', 'cache', 'control', 'max', 'age', '3600']);
    });

    it('returns empty array when tokenizing empty or whitespace string', () => {
      expect(normalizer.tokenize('')).toEqual([]);
      expect(normalizer.tokenize('   \n\t  ')).toEqual([]);
    });
  });

  describe('Pluralization Tolerance & Singularization', () => {
    it('preserves technical terms and words in PLURAL_EXCEPTIONS', () => {
      const exceptions = [
        'redis',
        'tls',
        'https',
        'http',
        'cors',
        'express',
        'status',
        'bypass',
        'class',
        'process',
        'postgres',
        'dns',
        'access',
      ];
      for (const word of exceptions) {
        expect(normalizer.singularize(word)).toBe(word);
      }
    });

    it('converts -ies endings to -y', () => {
      expect(normalizer.singularize('dependencies')).toBe('dependency');
      expect(normalizer.singularize('queries')).toBe('query');
      expect(normalizer.singularize('retries')).toBe('retry');
      expect(normalizer.singularize('strategies')).toBe('strategy');
      expect(normalizer.singularize('proxies')).toBe('proxy');
    });

    it('converts -sses, -shes, -ches, -xes endings by stripping -es', () => {
      expect(normalizer.singularize('bypasses')).toBe('bypass');
      expect(normalizer.singularize('batches')).toBe('batch');
      expect(normalizer.singularize('indexes')).toBe('index');
      expect(normalizer.singularize('hashes')).toBe('hash');
    });

    it('strips standard trailing -s for regular plurals', () => {
      expect(normalizer.singularize('tokens')).toBe('token');
      expect(normalizer.singularize('headers')).toBe('header');
      expect(normalizer.singularize('keys')).toBe('key');
      expect(normalizer.singularize('mutations')).toBe('mutation');
      expect(normalizer.singularize('transactions')).toBe('transaction');
      expect(normalizer.singularize('records')).toBe('record');
    });

    it('singularizes token lists with singularizeTokens', () => {
      const tokens = normalizer.singularizeTokens('storing API tokens and session keys in cookies');
      expect(tokens).toEqual(['storing', 'api', 'token', 'and', 'session', 'key', 'in', 'cooky']);
    });
  });

  describe('Technical Suffix Stemming', () => {
    it('stems -ation and -tion suffixes to root forms', () => {
      expect(normalizer.stem('invalidation')).toBe('invalidat');
      expect(normalizer.stem('mutation')).toBe('mutat');

      expect(normalizer.stem('isolation')).toBe('isolat');
      expect(normalizer.stem('transaction')).toBe('transact');
    });

    it('stems -ing verbs and reduces double consonants', () => {
      expect(normalizer.stem('locking')).toBe('lock');
      expect(normalizer.stem('caching')).toBe('cach');
      expect(normalizer.stem('signing')).toBe('sign');
      expect(normalizer.stem('pooling')).toBe('pool');
      expect(normalizer.stem('dropping')).toBe('drop');
    });

    it('stems -ed past tense forms and reduces double consonants', () => {
      expect(normalizer.stem('locked')).toBe('lock');
      expect(normalizer.stem('cached')).toBe('cach');
      expect(normalizer.stem('rendered')).toBe('render');
      expect(normalizer.stem('stopped')).toBe('stop');
    });

    it('stems -able and -ized adjectives/verbs', () => {
      expect(normalizer.stem('repeatable')).toBe('repeat');
      expect(normalizer.stem('parameterized')).toBe('parameter');
      expect(normalizer.stem('serialize')).toBe('serial');
    });

    it('stems array of tokens with stemTokens', () => {
      const stemmed = normalizer.stemTokens('locking rows and caching rendered components');
      expect(stemmed).toEqual(['lock', 'row', 'and', 'cach', 'render', 'component']);
    });
  });

  describe('Fuzzy Token and Subsequence Matching', () => {
    it('matches exact raw string occurrences', () => {
      expect(normalizer.fuzzyTokenMatch('redis', 'Connecting to redis cluster with pool.')).toBe(true);
      expect(normalizer.fuzzyTokenMatch('JWT_SECRET', 'Read JWT_SECRET from environment.')).toBe(true);
    });

    it('matches terms despite punctuation and case differences', () => {
      expect(normalizer.fuzzyTokenMatch('process.env', 'We read secrets from process env at startup.')).toBe(true);
      expect(normalizer.fuzzyTokenMatch('b-tree', 'The index uses a b tree structure.')).toBe(true);
    });

    it('matches singular pattern against plural in student response', () => {
      expect(
        normalizer.fuzzyTokenMatch(
          'idempotency key',
          'Clients include idempotency keys in request headers.'
        )
      ).toBe(true);

      expect(
        normalizer.fuzzyTokenMatch(
          'connection pool',
          'Configured connection pools for distributed lambdas.'
        )
      ).toBe(true);
    });

    it('matches stemmed pattern against conjugated verbs in student response', () => {
      expect(
        normalizer.fuzzyTokenMatch(
          'cache invalidation',
          'We handle caching invalidations via redis events.'
        )
      ).toBe(true);

      expect(
        normalizer.fuzzyTokenMatch(
          'distributed lock',
          'Acquired distributed locking using Redlock algorithm.'
        )
      ).toBe(true);
    });

    it('returns false for unrelated text or empty parameters', () => {
      expect(normalizer.fuzzyTokenMatch('circuit breaker', 'Just update the CSS styling.')).toBe(false);
      expect(normalizer.fuzzyTokenMatch('', 'Some explanation text')).toBe(false);
      expect(normalizer.fuzzyTokenMatch('token bucket', '')).toBe(false);
    });

    it('exports defaultTextNormalizer singleton with identical behavior', () => {
      expect(defaultTextNormalizer).toBeInstanceOf(TextNormalizer);
      expect(defaultTextNormalizer.fuzzyTokenMatch('mutex', 'Acquiring mutex on write.')).toBe(true);
    });
  });
});
