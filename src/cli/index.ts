#!/usr/bin/env bun
import { Command } from 'commander';
import { executeInit } from './commands/init.js';
import { executeDoctor } from './commands/doctor.js';
import { executeStatus } from './commands/status.js';

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
    .option('-f, --force', 'overwrite existing configuration')
    .option('-c, --client <client>', 'target coding agent client (claude, cursor, opencode, all)', 'all')
    .action(async (options) => {
      const globalOpts = program.opts();
      const verbose = Boolean(globalOpts.verbose);
      const result = await executeInit({
        yes: options.yes,
        force: options.force,
        client: options.client,
        verbose,
      });

      console.log(`Initialized Ratio in ${result.rootDir}`);
      console.log(`  Config: ${result.configPath}`);
      console.log(`  Ledger: ${result.dbPath}`);
      if (result.configuredClients && result.configuredClients.length > 0) {
        console.log(`  Configured Clients: ${result.configuredClients.join(', ')}`);
      }
    });

  program
    .command('doctor')
    .description('Diagnose environment health, Bun runtime, database, and agent integrations')
    .action(async () => {
      const globalOpts = program.opts();
      const verbose = Boolean(globalOpts.verbose);
      const report = await executeDoctor({ verbose });

      console.log('\nRatio Environment Diagnostics:');
      for (const check of report.checks) {
        const symbol = check.status === 'ok' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
        console.log(`  ${symbol} ${check.name}: ${check.message}`);
        if (verbose && check.details) {
          console.log(`    Details: ${JSON.stringify(check.details)}`);
        }
      }
      console.log(
        `\nSummary: ${report.summary.passed} passed, ${report.summary.warnings} warnings, ${report.summary.failures} failures\n`
      );
      if (!report.healthy) {
        process.exitCode = 1;
      }
    });

  program
    .command('status')
    .description('Display repository trust metrics, pass rates, and active files')
    .action(async () => {
      const globalOpts = program.opts();
      const verbose = Boolean(globalOpts.verbose);
      await executeStatus({ verbose });
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
