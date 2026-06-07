import { createColors } from 'picocolors';
import ora, { Ora } from 'ora';

/**
 * Shared color formatting utility with guaranteed ANSI support unless NO_COLOR is set.
 */
export const pc = createColors(process.env.NO_COLOR ? false : true);

/**
 * Factory for creating terminal spinners that automatically silence during tests or non-TTY runs.
 */
export function createSpinner(text: string, silent?: boolean): Ora {
  const isSilent =
    silent ??
    (Boolean(process.env.CI) || process.env.NODE_ENV === 'test' || !process.stderr.isTTY);
  return ora({ text, isSilent });
}
