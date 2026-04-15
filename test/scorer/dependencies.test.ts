import { describe, expect, it } from 'bun:test';
import {
  detectManifestKind,
  diffDependencies,
  parseCargoDependencies,
  parseGoModDependencies,
  parseNpmDependencies,
  parsePipDependencies,
  parsePyprojectDependencies,
} from '../../src/core/scorer/dependencies.js';

describe('Dependency Diff Parser Unit Tests', () => {
  it('correctly identifies manifest kinds by file path', () => {
    expect(detectManifestKind('/home/user/project/package.json')).toBe('npm');
    expect(detectManifestKind('Cargo.toml')).toBe('cargo');
    expect(detectManifestKind('backend/requirements.txt')).toBe('pip');
    expect(detectManifestKind('dev.requirements.txt')).toBe('pip');
    expect(detectManifestKind('pyproject.toml')).toBe('poetry');
    expect(detectManifestKind('go.mod')).toBe('go');
    expect(detectManifestKind('src/index.ts')).toBe('unknown');
    expect(detectManifestKind('Makefile')).toBe('unknown');
  });

  describe('NPM (package.json) parser and diffing', () => {
    it('detects newly added dependencies in dependencies and devDependencies', () => {
      const original = JSON.stringify({
        name: 'my-app',
        dependencies: {
          express: '^4.18.2',
        },
      });

      const proposed = JSON.stringify({
        name: 'my-app',
        dependencies: {
          express: '^4.18.2',
          jsonwebtoken: '^9.0.2',
        },
        devDependencies: {
          vitest: '^1.0.0',
        },
      });

      const diff = diffDependencies('package.json', original, proposed);

      expect(diff.manifestKind).toBe('npm');
      expect(diff.hasNewDependencies).toBe(true);
      expect(diff.addedPackages).toEqual(['jsonwebtoken', 'vitest']);
      expect(diff.removedPackages).toEqual([]);
    });

    it('does not flag version updates or removals as new dependencies', () => {
      const original = JSON.stringify({
        dependencies: {
          express: '^4.18.0',
          lodash: '^4.17.21',
        },
      });

      const proposed = JSON.stringify({
        dependencies: {
          express: '^4.19.2', // version bump
        },
      });

      const diff = diffDependencies('package.json', original, proposed);

      expect(diff.hasNewDependencies).toBe(false);
      expect(diff.addedPackages).toEqual([]);
      expect(diff.removedPackages).toEqual(['lodash']);
    });
  });

  describe('Python (requirements.txt) parser and diffing', () => {
    it('detects added packages while ignoring comments, options, and version constraints', () => {
      const original = [
        '# Core requirements',
        'Flask==2.0.1',
        'requests>=2.26.0',
      ].join('\n');

      const proposed = [
        '# Core requirements',
        'Flask==2.0.1',
        'requests>=2.28.0', // version change
        'celery[redis]>=5.2.0 # for async worker jobs',
        'pydantic_core~=2.0.0',
        '-r dev-requirements.txt',
      ].join('\n');

      const diff = diffDependencies('requirements.txt', original, proposed);

      expect(diff.manifestKind).toBe('pip');
      expect(diff.hasNewDependencies).toBe(true);
      expect(diff.addedPackages).toContain('celery');
      expect(diff.addedPackages).toContain('pydantic-core');
      expect(diff.removedPackages).toEqual([]);
    });
  });

  describe('Rust (Cargo.toml) parser and diffing', () => {
    it('detects added crates across standard and sub-table syntax', () => {
      const original = [
        '[package]',
        'name = "api"',
        'version = "0.1.0"',
        '',
        '[dependencies]',
        'serde = { version = "1.0", features = ["derive"] }',
        'tokio = "1.28"',
      ].join('\n');

      const proposed = [
        '[package]',
        'name = "api"',
        'version = "0.1.0"',
        '',
        '[dependencies]',
        'serde = { version = "1.0", features = ["derive"] }',
        'tokio = "1.28"',
        'jsonwebtoken = "8.3"',
        '',
        '[dependencies.sqlx]',
        'version = "0.7"',
        'features = ["runtime-tokio", "postgres"]',
      ].join('\n');

      const diff = diffDependencies('Cargo.toml', original, proposed);

      expect(diff.manifestKind).toBe('cargo');
      expect(diff.hasNewDependencies).toBe(true);
      expect(diff.addedPackages).toContain('jsonwebtoken');
      expect(diff.addedPackages).toContain('sqlx');
    });
  });

  describe('Python (pyproject.toml) parser', () => {
    it('detects dependencies in Poetry tables and ignores python version itself', () => {
      const content = [
        '[tool.poetry]',
        'name = "sample"',
        '',
        '[tool.poetry.dependencies]',
        'python = "^3.10"',
        'fastapi = "^0.100.0"',
        'uvicorn = { extras = ["standard"], version = "^0.23.0" }',
      ].join('\n');

      const deps = parsePyprojectDependencies(content);

      expect(deps.has('python')).toBe(false);
      expect(deps.has('fastapi')).toBe(true);
      expect(deps.has('uvicorn')).toBe(true);
    });
  });

  describe('Go (go.mod) parser', () => {
    it('detects module dependencies inside require blocks and single-line require directives', () => {
      const content = [
        'module example.com/app',
        '',
        'go 1.21',
        '',
        'require (',
        '\tgithub.com/gin-gonic/gin v1.9.1',
        '\tgithub.com/golang-jwt/jwt/v5 v5.0.0 // indirect',
        ')',
        '',
        'require github.com/google/uuid v1.3.0',
      ].join('\n');

      const deps = parseGoModDependencies(content);

      expect(deps.has('github.com/gin-gonic/gin')).toBe(true);
      expect(deps.has('github.com/golang-jwt/jwt/v5')).toBe(true);
      expect(deps.has('github.com/google/uuid')).toBe(true);
    });
  });
});
