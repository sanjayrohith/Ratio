import { describe, expect, it } from 'bun:test';
import { LineDeltaCalculator } from '../../src/core/scorer/line-delta.js';

describe('LineDeltaCalculator Unit Tests', () => {
  it('returns zeroes when original and proposed contents are strictly identical', () => {
    const code = `function hello() {\n  return "world";\n}\n`;
    const result = LineDeltaCalculator.calculate(code, code);

    expect(result.linesAdded).toBe(0);
    expect(result.linesRemoved).toBe(0);
    expect(result.totalLinesChanged).toBe(0);
    expect(result.netLineDelta).toBe(0);
  });

  it('correctly calculates delta for brand new file creation', () => {
    const original = '';
    const proposed = [
      'import { Router } from "express";',
      'const router = Router();',
      'router.get("/health", (req, res) => res.send("ok"));',
      'export default router;',
    ].join('\n');

    const result = LineDeltaCalculator.calculate(original, proposed);

    expect(result.linesAdded).toBe(4);
    expect(result.linesRemoved).toBe(0);
    expect(result.totalLinesChanged).toBe(4);
    expect(result.netLineDelta).toBe(4);
  });

  it('correctly calculates delta for total file clearing / deletion', () => {
    const original = [
      'line 1',
      'line 2',
      'line 3',
      'line 4',
      'line 5',
    ].join('\n');
    const proposed = '';

    const result = LineDeltaCalculator.calculate(original, proposed);

    expect(result.linesAdded).toBe(0);
    expect(result.linesRemoved).toBe(5);
    expect(result.totalLinesChanged).toBe(5);
    expect(result.netLineDelta).toBe(-5);
  });

  it('accurately measures a single-line replacement within unchanged surrounding lines', () => {
    const original = [
      'export const config = {',
      '  port: 3000,',
      '  host: "localhost",',
      '  debug: false,',
      '};',
    ].join('\n');

    const proposed = [
      'export const config = {',
      '  port: 8080,',
      '  host: "localhost",',
      '  debug: false,',
      '};',
    ].join('\n');

    const result = LineDeltaCalculator.calculate(original, proposed);

    expect(result.linesAdded).toBe(1);
    expect(result.linesRemoved).toBe(1);
    expect(result.totalLinesChanged).toBe(2);
    expect(result.netLineDelta).toBe(0);
  });

  it('calculates multiline replacements correctly', () => {
    const original = [
      'function processItems(items: string[]) {',
      '  // legacy logic',
      '  for (let i = 0; i < items.length; i++) {',
      '    console.log(items[i]);',
      '  }',
      '  return true;',
      '}',
    ].join('\n');

    const proposed = [
      'function processItems(items: string[]) {',
      '  // modern stream processing',
      '  items',
      '    .filter(Boolean)',
      '    .map((item) => item.trim())',
      '    .forEach((item) => console.log(item));',
      '  return true;',
      '}',
    ].join('\n');

    const result = LineDeltaCalculator.calculate(original, proposed);

    // Old loop lines (4 lines replaced with 5 modern lines)
    expect(result.linesRemoved).toBe(4);
    expect(result.linesAdded).toBe(5);
    expect(result.totalLinesChanged).toBe(9);
    expect(result.netLineDelta).toBe(1);
  });

  it('handles pure additions in the middle of a file without removing any lines', () => {
    const original = [
      'import express from "express";',
      'const app = express();',
      'app.listen(3000);',
    ].join('\n');

    const proposed = [
      'import express from "express";',
      'import cors from "cors";',
      'const app = express();',
      'app.use(cors());',
      'app.listen(3000);',
    ].join('\n');

    const result = LineDeltaCalculator.calculate(original, proposed);

    expect(result.linesAdded).toBe(2);
    expect(result.linesRemoved).toBe(0);
    expect(result.totalLinesChanged).toBe(2);
    expect(result.netLineDelta).toBe(2);
  });

  it('handles pure line deletions without additions', () => {
    const original = [
      'header',
      'unwanted line 1',
      'unwanted line 2',
      'footer',
    ].join('\n');

    const proposed = [
      'header',
      'footer',
    ].join('\n');

    const result = LineDeltaCalculator.calculate(original, proposed);

    expect(result.linesAdded).toBe(0);
    expect(result.linesRemoved).toBe(2);
    expect(result.totalLinesChanged).toBe(2);
    expect(result.netLineDelta).toBe(-2);
  });

  it('measures whitespace and indentation changes as line modifications', () => {
    const original = [
      'function test() {',
      'console.log("no indent");',
      '}',
    ].join('\n');

    const proposed = [
      'function test() {',
      '  console.log("no indent");',
      '}',
    ].join('\n');

    const result = LineDeltaCalculator.calculate(original, proposed);

    expect(result.linesAdded).toBe(1);
    expect(result.linesRemoved).toBe(1);
    expect(result.totalLinesChanged).toBe(2);
    expect(result.netLineDelta).toBe(0);
  });

  it('handles varied file formats like Markdown, SQL, and JSON', () => {
    // Markdown
    const origMd = '# Documentation\n\nIntro section.\n';
    const propMd = '# Documentation\n\nIntro section.\n\n## Architecture\nDetails here.\n';
    const mdResult = LineDeltaCalculator.calculate(origMd, propMd);
    expect(mdResult.linesAdded).toBe(3);
    expect(mdResult.linesRemoved).toBe(0);

    // SQL Migration
    const origSql = 'CREATE TABLE users (id INTEGER PRIMARY KEY);\n';
    const propSql = 'CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL);\nCREATE INDEX idx_users_email ON users(email);\n';
    const sqlResult = LineDeltaCalculator.calculate(origSql, propSql);
    expect(sqlResult.linesAdded).toBe(2);
    expect(sqlResult.linesRemoved).toBe(1);

    // JSON file
    const origJson = '{\n  "name": "app",\n  "version": "1.0.0"\n}\n';
    const propJson = '{\n  "name": "app",\n  "version": "1.1.0",\n  "private": true\n}\n';
    const jsonResult = LineDeltaCalculator.calculate(origJson, propJson);
    expect(jsonResult.linesAdded).toBe(2);
    expect(jsonResult.linesRemoved).toBe(1);
  });
});
