import { basename } from 'node:path';
import type { DependencyDiff, ManifestKind } from './types.js';

/**
 * Detects the manifest format from a file path.
 */
export function detectManifestKind(filePath: string): ManifestKind {
  const name = basename(filePath).toLowerCase();
  if (name === 'package.json') return 'npm';
  if (name === 'cargo.toml') return 'cargo';
  if (name === 'requirements.txt' || name.endsWith('.requirements.txt')) return 'pip';
  if (name === 'pyproject.toml') return 'poetry';
  if (name === 'go.mod') return 'go';
  return 'unknown';
}

/**
 * Parses dependencies from package.json content.
 */
export function parseNpmDependencies(content: string): Set<string> {
  const deps = new Set<string>();
  if (!content.trim()) return deps;

  try {
    const pkg = JSON.parse(content);
    const sections = [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ];
    for (const section of sections) {
      if (pkg[section] && typeof pkg[section] === 'object') {
        for (const depName of Object.keys(pkg[section])) {
          deps.add(depName.toLowerCase());
        }
      }
    }
  } catch {
    // If JSON is malformed, attempt naive regex extraction
    const match = content.matchAll(/"([^"\r\n]+)"\s*:\s*"[^"\r\n]+"/g);
    for (const m of match) {
      if (m[1] && !m[1].startsWith('@types/')) {
        deps.add(m[1].toLowerCase());
      }
    }
  }
  return deps;
}

/**
 * Parses dependencies from requirements.txt content.
 */
export function parsePipDependencies(content: string): Set<string> {
  const deps = new Set<string>();
  const lines = content.split('\n');

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#') || line.startsWith('-') || line.startsWith('--')) {
      continue;
    }

    // Strip comments at end of line
    const commentIdx = line.indexOf('#');
    if (commentIdx !== -1) {
      line = line.substring(0, commentIdx).trim();
    }

    // Match package name before version operators: ==, >=, <=, ~=, !=, <, >, ;, [, @
    const match = line.match(/^([a-zA-Z0-9_\-\.]+)/);
    if (match && match[1]) {
      deps.add(match[1].toLowerCase().replace(/_/g, '-'));
    }
  }
  return deps;
}

/**
 * Parses dependencies from Cargo.toml content.
 */
export function parseCargoDependencies(content: string): Set<string> {
  const deps = new Set<string>();
  const lines = content.split('\n');

  let inDepSection = false;
  const sectionHeaderRegex = /^\s*\[([a-zA-Z0-9_\-\.]+)\]/;

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;

    const sectionMatch = line.match(sectionHeaderRegex);
    if (sectionMatch && sectionMatch[1]) {
      const section = sectionMatch[1].toLowerCase();
      inDepSection =
        section.endsWith('dependencies') ||
        section.startsWith('dependencies.') ||
        section.includes('.dependencies.');

      // Check for inline table style [dependencies.package_name]
      if (section.startsWith('dependencies.') || section.includes('.dependencies.')) {
        const parts = section.split('.');
        const pkg = parts[parts.length - 1];
        if (pkg && pkg !== 'dependencies') {
          deps.add(pkg.toLowerCase().replace(/_/g, '-'));
        }
      }
      continue;
    }

    if (inDepSection) {
      const kvMatch = line.match(/^([a-zA-Z0-9_\-]+)\s*=/);
      if (kvMatch && kvMatch[1]) {
        deps.add(kvMatch[1].toLowerCase().replace(/_/g, '-'));
      }
    }
  }
  return deps;
}

/**
 * Parses dependencies from pyproject.toml content (Poetry / PEP 621).
 */
export function parsePyprojectDependencies(content: string): Set<string> {
  const deps = new Set<string>();
  const lines = content.split('\n');

  let inDepSection = false;
  let inArray = false;

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;

    // Header matching
    const headerMatch = line.match(/^\s*\[([a-zA-Z0-9_\-\.]+)\]/);
    if (headerMatch && headerMatch[1]) {
      const header = headerMatch[1].toLowerCase();
      inDepSection =
        header.includes('dependencies') ||
        header.includes('tool.poetry.dependencies') ||
        header.includes('project.optional-dependencies');
      inArray = false;
      continue;
    }

    // PEP 621 dependencies = [ "flask>=2.0", "requests" ]
    if (line.startsWith('dependencies = [') || line.startsWith('dependencies=[')) {
      inArray = true;
      continue;
    }

    if (inArray) {
      if (line.includes(']')) {
        inArray = false;
      }
      const strMatch = line.match(/["']([a-zA-Z0-9_\-\.]+)/);
      if (strMatch && strMatch[1]) {
        deps.add(strMatch[1].toLowerCase().replace(/_/g, '-'));
      }
      continue;
    }

    if (inDepSection) {
      const kvMatch = line.match(/^([a-zA-Z0-9_\-]+)\s*=/);
      if (kvMatch && kvMatch[1]) {
        const name = kvMatch[1].toLowerCase().replace(/_/g, '-');
        if (name !== 'python') {
          deps.add(name);
        }
      }
    }
  }
  return deps;
}

/**
 * Parses dependencies from go.mod content.
 */
export function parseGoModDependencies(content: string): Set<string> {
  const deps = new Set<string>();
  const lines = content.split('\n');

  let inRequireBlock = false;

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('//')) continue;

    if (line === 'require (') {
      inRequireBlock = true;
      continue;
    }

    if (inRequireBlock && line === ')') {
      inRequireBlock = false;
      continue;
    }

    if (inRequireBlock) {
      const parts = line.split(/\s+/);
      if (parts[0]) {
        deps.add(parts[0]);
      }
      continue;
    }

    // Single line require: require github.com/gin-gonic/gin v1.9.1
    if (line.startsWith('require ')) {
      const parts = line.substring('require '.length).trim().split(/\s+/);
      if (parts[0]) {
        deps.add(parts[0]);
      }
    }
  }
  return deps;
}

/**
 * Extracts dependency set for a recognized manifest file.
 */
export function parseDependencies(manifestKind: ManifestKind, content: string): Set<string> {
  switch (manifestKind) {
    case 'npm':
      return parseNpmDependencies(content);
    case 'pip':
      return parsePipDependencies(content);
    case 'cargo':
      return parseCargoDependencies(content);
    case 'poetry':
      return parsePyprojectDependencies(content);
    case 'go':
      return parseGoModDependencies(content);
    default:
      return new Set();
  }
}

/**
 * Diffs dependencies between original and proposed manifest contents.
 */
export function diffDependencies(
  filePath: string,
  originalContent: string,
  proposedContent: string
): DependencyDiff {
  const manifestKind = detectManifestKind(filePath);
  if (manifestKind === 'unknown') {
    return {
      manifestKind,
      manifestPath: filePath,
      addedPackages: [],
      removedPackages: [],
      updatedPackages: [],
      hasNewDependencies: false,
    };
  }

  const originalDeps = parseDependencies(manifestKind, originalContent);
  const proposedDeps = parseDependencies(manifestKind, proposedContent);

  const addedPackages: string[] = [];
  const removedPackages: string[] = [];

  for (const dep of proposedDeps) {
    if (!originalDeps.has(dep)) {
      addedPackages.push(dep);
    }
  }

  for (const dep of originalDeps) {
    if (!proposedDeps.has(dep)) {
      removedPackages.push(dep);
    }
  }

  return {
    manifestKind,
    manifestPath: filePath,
    addedPackages: addedPackages.sort(),
    removedPackages: removedPackages.sort(),
    updatedPackages: [],
    hasNewDependencies: addedPackages.length > 0,
  };
}
