import { pc } from './ui.js';

/**
 * Standardized Ratio CLI exit code conventions:
 * 0 = Success
 * 1 = User / Configuration / Validation error
 * 2 = Internal / Fatal system error
 */
export enum ExitCode {
  SUCCESS = 0,
  USER_ERROR = 1,
  FATAL_ERROR = 2,
}

export class CliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: ExitCode = ExitCode.USER_ERROR,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'CliError';
  }
}

/**
 * Centralized error handler applying proper exit code and colorized diagnostic logging.
 */
export function handleCliError(err: unknown): void {
  if (err instanceof CliError) {
    console.error(pc.red(`Error: ${err.message}`));
    if (err.details) {
      console.error(pc.dim(`Details: ${JSON.stringify(err.details)}`));
    }
    process.exitCode = err.exitCode;
  } else if (err instanceof Error) {
    console.error(pc.red(`Fatal Error: ${err.message}`));
    if (err.stack && process.env.DEBUG) {
      console.error(pc.dim(err.stack));
    }
    process.exitCode = ExitCode.FATAL_ERROR;
  } else {
    console.error(pc.red(`Fatal Error: ${String(err)}`));
    process.exitCode = ExitCode.FATAL_ERROR;
  }
}
