import { createHash } from 'node:crypto';
import type { ManifestKind } from './types.js';
import { parseDependencies } from './dependencies.js';
import { globToRegex } from './layers.js';

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

export interface ScorerCacheOptions {
  maxRegexCacheSize?: number;
  maxManifestCacheSize?: number;
  maxDiskFileCacheSize?: number;
}

/**
 * Memory cache for compiled layer regular expressions, parsed package manifests,
 * and manifest file contents to eliminate redundant disk I/O and regex recompilation.
 */
export class ScorerMemoryCache {
  private readonly maxRegexCacheSize: number;
  private readonly maxManifestCacheSize: number;
  private readonly maxDiskFileCacheSize: number;

  private regexCache: Map<string, RegExp> = new Map();
  private manifestCache: Map<string, Set<string>> = new Map();
  private diskFileCache: Map<string, { content: string; mtime?: number }> = new Map();

  private regexStats: CacheStats = { hits: 0, misses: 0, size: 0 };
  private manifestStats: CacheStats = { hits: 0, misses: 0, size: 0 };
  private diskFileStats: CacheStats = { hits: 0, misses: 0, size: 0 };

  constructor(options: ScorerCacheOptions = {}) {
    this.maxRegexCacheSize = options.maxRegexCacheSize ?? 1000;
    this.maxManifestCacheSize = options.maxManifestCacheSize ?? 500;
    this.maxDiskFileCacheSize = options.maxDiskFileCacheSize ?? 200;
  }

  /**
   * Fast hashing for manifest content caching.
   */
  private hashContent(kind: ManifestKind, content: string): string {
    return `${kind}:${createHash('sha256').update(content).digest('hex')}`;
  }

  /**
   * Retrieves or compiles and caches a regular expression for a glob pattern.
   */
  public getCompiledRegex(globPattern: string): RegExp {
    const cached = this.regexCache.get(globPattern);
    if (cached) {
      this.regexStats.hits++;
      return cached;
    }

    this.regexStats.misses++;
    const compiled = globToRegex(globPattern);

    if (this.regexCache.size >= this.maxRegexCacheSize) {
      // Evict oldest entry
      const firstKey = this.regexCache.keys().next().value;
      if (firstKey) this.regexCache.delete(firstKey);
    }

    this.regexCache.set(globPattern, compiled);
    this.regexStats.size = this.regexCache.size;
    return compiled;
  }

  /**
   * Retrieves parsed dependencies from cache, or parses and caches them.
   */
  public getParsedDependencies(kind: ManifestKind, content: string): Set<string> {
    if (!content.trim()) {
      return new Set();
    }

    const cacheKey = this.hashContent(kind, content);
    const cached = this.manifestCache.get(cacheKey);
    if (cached) {
      this.manifestStats.hits++;
      // Return a shallow copy of the Set to prevent callers mutating cache
      return new Set(cached);
    }

    this.manifestStats.misses++;
    const parsed = parseDependencies(kind, content);

    if (this.manifestCache.size >= this.maxManifestCacheSize) {
      const firstKey = this.manifestCache.keys().next().value;
      if (firstKey) this.manifestCache.delete(firstKey);
    }

    this.manifestCache.set(cacheKey, parsed);
    this.manifestStats.size = this.manifestCache.size;
    return new Set(parsed);
  }

  /**
   * Retrieves cached manifest file content from memory.
   */
  public getCachedManifestFile(filePath: string): string | null {
    const entry = this.diskFileCache.get(filePath);
    if (entry) {
      this.diskFileStats.hits++;
      return entry.content;
    }
    this.diskFileStats.misses++;
    return null;
  }

  /**
   * Caches manifest file content in memory.
   */
  public cacheManifestFile(filePath: string, content: string, mtime?: number): void {
    if (this.diskFileCache.size >= this.maxDiskFileCacheSize) {
      const firstKey = this.diskFileCache.keys().next().value;
      if (firstKey) this.diskFileCache.delete(firstKey);
    }

    this.diskFileCache.set(filePath, { content, mtime });
    this.diskFileStats.size = this.diskFileCache.size;
  }

  /**
   * Invalidates cached file content.
   */
  public invalidateFile(filePath: string): void {
    this.diskFileCache.delete(filePath);
    this.diskFileStats.size = this.diskFileCache.size;
  }

  /**
   * Clears all caches and resets statistics.
   */
  public clearAll(): void {
    this.regexCache.clear();
    this.manifestCache.clear();
    this.diskFileCache.clear();

    this.regexStats = { hits: 0, misses: 0, size: 0 };
    this.manifestStats = { hits: 0, misses: 0, size: 0 };
    this.diskFileStats = { hits: 0, misses: 0, size: 0 };
  }

  public getRegexStats(): CacheStats {
    return { ...this.regexStats };
  }

  public getManifestStats(): CacheStats {
    return { ...this.manifestStats };
  }

  public getDiskFileStats(): CacheStats {
    return { ...this.diskFileStats };
  }
}

export const defaultScorerCache = new ScorerMemoryCache();
