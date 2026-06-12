import { describe, it, expect, beforeEach } from 'bun:test';
import { ScorerMemoryCache } from '../../src/core/scorer/cache.js';

describe('ScorerMemoryCache Unit Tests', () => {
  let cache: ScorerMemoryCache;

  beforeEach(() => {
    cache = new ScorerMemoryCache({
      maxRegexCacheSize: 5,
      maxManifestCacheSize: 5,
      maxDiskFileCacheSize: 5,
    });
  });

  describe('Regex Compilation Caching', () => {
    it('caches compiled regular expressions on first access and reuses them on subsequent calls', () => {
      const pattern = '**/api/**';

      const rx1 = cache.getCompiledRegex(pattern);
      expect(rx1).toBeInstanceOf(RegExp);
      expect(cache.getRegexStats().misses).toBe(1);
      expect(cache.getRegexStats().hits).toBe(0);
      expect(cache.getRegexStats().size).toBe(1);

      const rx2 = cache.getCompiledRegex(pattern);
      expect(rx2).toBe(rx1); // Same reference
      expect(cache.getRegexStats().hits).toBe(1);

      // Verify regex behavior
      expect(rx1.test('src/api/routes.ts')).toBe(true);
      expect(rx1.test('src/ui/Button.tsx')).toBe(false);
    });

    it('evicts oldest regex entry when maxRegexCacheSize is exceeded', () => {
      for (let i = 0; i < 6; i++) {
        cache.getCompiledRegex(`**/pattern_${i}/**`);
      }

      const stats = cache.getRegexStats();
      expect(stats.size).toBe(5);
    });
  });

  describe('Manifest Dependency Caching', () => {
    it('caches parsed dependencies by manifest content and returns fresh sets on subsequent lookups', () => {
      const npmContent = JSON.stringify({
        name: 'test-pkg',
        dependencies: {
          express: '^4.18.2',
          cors: '^2.8.5',
        },
      });

      const deps1 = cache.getParsedDependencies('npm', npmContent);
      expect(deps1.has('express')).toBe(true);
      expect(deps1.has('cors')).toBe(true);
      expect(cache.getManifestStats().misses).toBe(1);
      expect(cache.getManifestStats().hits).toBe(0);

      const deps2 = cache.getParsedDependencies('npm', npmContent);
      expect(deps2.has('express')).toBe(true);
      expect(cache.getManifestStats().hits).toBe(1);

      // Mutating returned set does not corrupt cache
      deps2.add('malicious_dep');
      const deps3 = cache.getParsedDependencies('npm', npmContent);
      expect(deps3.has('malicious_dep')).toBe(false);
    });

    it('parses pip, cargo, and python dependencies correctly and caches them', () => {
      const pipContent = 'requests==2.28.1\npydantic>=2.0.0\n# comment\n';
      const pipDeps = cache.getParsedDependencies('pip', pipContent);
      expect(pipDeps.has('requests')).toBe(true);
      expect(pipDeps.has('pydantic')).toBe(true);

      const cargoContent = '[dependencies]\ntokio = "1.0"\nserde = "1.0"\n';
      const cargoDeps = cache.getParsedDependencies('cargo', cargoContent);
      expect(cargoDeps.has('tokio')).toBe(true);
      expect(cargoDeps.has('serde')).toBe(true);
    });
  });

  describe('Manifest File Content Caching', () => {
    it('stores, retrieves, and invalidates file content in memory', () => {
      const filePath = '/app/package.json';
      const content = '{"name":"demo"}';

      expect(cache.getCachedManifestFile(filePath)).toBeNull();
      expect(cache.getDiskFileStats().misses).toBe(1);

      cache.cacheManifestFile(filePath, content);
      expect(cache.getCachedManifestFile(filePath)).toBe(content);
      expect(cache.getDiskFileStats().hits).toBe(1);

      cache.invalidateFile(filePath);
      expect(cache.getCachedManifestFile(filePath)).toBeNull();
    });
  });

  describe('Cache Resetting', () => {
    it('resets all caches and zero-initializes statistics', () => {
      cache.getCompiledRegex('**/test/**');
      cache.getParsedDependencies('npm', '{"dependencies":{"zod":"^3.0.0"}}');
      cache.cacheManifestFile('/test.json', '{}');

      expect(cache.getRegexStats().size).toBe(1);
      expect(cache.getManifestStats().size).toBe(1);
      expect(cache.getDiskFileStats().size).toBe(1);

      cache.clearAll();

      expect(cache.getRegexStats().size).toBe(0);
      expect(cache.getManifestStats().size).toBe(0);
      expect(cache.getDiskFileStats().size).toBe(0);
    });
  });
});
