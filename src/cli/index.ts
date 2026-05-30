#!/usr/bin/env bun
import { Command } from 'commander';

export interface GlobalCliOptions {
  verbose?: boolean;
}

/**
 * Creates and configures the Ratio commander program.
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('ratio')
    .description('A Socratic Interceptor for AI Coding Agents')
    .version('0.1.0', '-V, --version', 'output the version number')
    .option('-v, --verbose', 'enable verbose logging and debug output');

  program
    .command('init')
    .description('Bootstrap Ratio in current workspace (.ratio/, config, SQLite ledger)')
    .option('-y, --yes', 'accept default configuration without prompting')
    .option('-c, --client <client>', 'target coding agent client (claude, cursor, opencode, all)', 'all')
    .action(async (options) => {
      if (program.opts().verbose) {
        console.log('[ratio:debug] Executing init with options:', options);
      }
    });

  program
    .command('doctor')
    .description('Diagnose environment health, Bun runtime, database, and agent integrations')
    .action(async () => {
      if (program.opts().verbose) {
        console.log('[ratio:debug] Executing doctor diagnostics');
      }
    });

  program
    .command('status')
    .description('Display repository trust metrics, pass rates, and active files')
    .action(async () => {
      if (program.opts().verbose) {
        console.log('[ratio:debug] Executing status inspection');
      }
    });

  program
    .command('log')
    .description('Display recent checkpoint ledger history and evaluation outcomes')
    .option('-n, --limit <number>', 'maximum number of checkpoints to display', '10')
    .action(async (options) => {
      if (program.opts().verbose) {
        console.log('[ratio:debug] Executing log inspection with limit:', options.limit);
      }
    });

  return program;
}

/**
 * Entry point when executing Ratio from command line.
 */
export async function runCli(argv: string[] = process.argv): Promise<void> {
  const program = createProgram();
  await program.parseAsync(argv);
}

if (import.meta.main) {
  runCli().catch((err) => {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
