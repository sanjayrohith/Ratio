import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ExitCode, CliError, handleCliError, createProgram } from '../../src/cli/index.js';

describe('Ratio CLI Standardized Error Handling and Exit Codes', () => {
  let originalExitCode: number | undefined;
  let originalError: typeof console.error;
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    originalError = console.error;
    console.error = () => {};
    tempDir = mkdtempSync(join(tmpdir(), 'ratio-errors-test-'));
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.exitCode = 0;
    console.error = originalError;
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('verifies ExitCode constant mappings', () => {
    expect(ExitCode.SUCCESS).toBe(0);
    expect(ExitCode.USER_ERROR).toBe(1);
    expect(ExitCode.FATAL_ERROR).toBe(2);
  });

  it('instantiates CliError with defaults and custom exit codes', () => {
    const defaultErr = new CliError('User input missing');
    expect(defaultErr.message).toBe('User input missing');
    expect(defaultErr.exitCode).toBe(ExitCode.USER_ERROR);
    expect(defaultErr.name).toBe('CliError');

    const fatalErr = new CliError('Database disk corrupted', ExitCode.FATAL_ERROR, { code: 'EIO' });
    expect(fatalErr.exitCode).toBe(ExitCode.FATAL_ERROR);
    expect(fatalErr.details).toEqual({ code: 'EIO' });
  });

  it('handleCliError sets process.exitCode for CliError', () => {
    const logged: string[] = [];
    console.error = (...args: any[]) => logged.push(args.join(' '));

    const err = new CliError('Config file not found', ExitCode.USER_ERROR, { path: '/invalid' });
    handleCliError(err);

    expect(process.exitCode).toBe(ExitCode.USER_ERROR);
    expect(logged.some((line) => line.includes('Config file not found'))).toBe(true);
    expect(logged.some((line) => line.includes('/invalid'))).toBe(true);
  });

  it('handleCliError sets FATAL_ERROR (exit code 2) for generic errors', () => {
    const logged: string[] = [];
    console.error = (...args: any[]) => logged.push(args.join(' '));

    const err = new Error('Unexpected SQLite crash');
    handleCliError(err);

    expect(process.exitCode).toBe(ExitCode.FATAL_ERROR);
    expect(logged.some((line) => line.includes('Unexpected SQLite crash'))).toBe(true);
  });

  it('handleCliError sets FATAL_ERROR for non-Error thrown objects', () => {
    const logged: string[] = [];
    console.error = (...args: any[]) => logged.push(args.join(' '));

    handleCliError('String error primitive');
    expect(process.exitCode).toBe(ExitCode.FATAL_ERROR);
    expect(logged.some((line) => line.includes('String error primitive'))).toBe(true);
  });

  it('sets USER_ERROR (exit code 1) when command fails validation or workspace initialization', async () => {
    process.chdir(tempDir);
    const program = createProgram();

    // status in empty uninitialized folder should set exit code 1
    await program.parseAsync(['bun', 'ratio', 'status']);
    expect(process.exitCode).toBe(ExitCode.USER_ERROR);

    // config get in empty folder should set exit code 1
    process.exitCode = undefined;
    const configProgram = createProgram();
    await configProgram.parseAsync(['bun', 'ratio', 'config', 'get', 'nonexistent.key']);
    expect(process.exitCode).toBe(ExitCode.USER_ERROR);
  });
});
