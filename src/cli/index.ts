#!/usr/bin/env bun
import { Command } from 'commander';
import { executeInit } from './commands/init.js';
import { executeDoctor } from './commands/doctor.js';
import { executeStatus } from './commands/status.js';
import { executeLog } from './commands/log.js';
import { executeReport } from './commands/report.js';
import { executeConfigGet, executeConfigSet } from './commands/config.js';
import { executeReset, executeClean } from './commands/reset.js';
import { pc } from './ui.js';

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
        const symbol = check.status === 'ok' ? pc.green('✓') : check.status === 'warn' ? pc.yellow('⚠') : pc.red('✗');
        console.log(`  ${symbol} ${pc.bold(check.name)}: ${check.message}`);
        if (verbose && check.details) {
          console.log(`    ${pc.dim('Details:')} ${JSON.stringify(check.details)}`);
        }
      }
      console.log(
        `\nSummary: ${pc.green(`${report.summary.passed} passed`)}, ${pc.yellow(`${report.summary.warnings} warnings`)}, ${pc.red(`${report.summary.failures} failures`)}\n`
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
    .option('-s, --status <status>', 'filter by status (pending, passed, failed, bypassed)')
    .option('-f, --file <path>', 'filter by target file path')
    .action(async (options) => {
      const globalOpts = program.opts();
      const verbose = Boolean(globalOpts.verbose);
      const limit = parseInt(options.limit, 10) || 10;
      await executeLog({
        limit,
        status: options.status,
        file: options.file,
        verbose,
      });
    });

  program
    .command('report')
    .description('Generate shareable portfolio markdown report (RATIO_REPORT.md)')
    .option('-o, --output <file>', 'output report file destination')
    .option('--stdout', 'stream generated report directly to stdout')
    .option('--json', 'export structured JSON data for CI analysis or dashboards')
    .action(async (options) => {
      const globalOpts = program.opts();
      const verbose = Boolean(globalOpts.verbose);
      await executeReport({
        output: options.output,
        stdout: options.stdout,
        json: options.json,
        verbose,
      });
    });

  const configCmd = program
    .command('config')
    .description('Inspect or modify Ratio configuration settings');

  configCmd
    .command('get [key]')
    .description('Get a configuration value or display all settings')
    .action(async (key) => {
      const globalOpts = program.opts();
      const verbose = Boolean(globalOpts.verbose);
      await executeConfigGet(key, { verbose });
    });

  configCmd
    .command('set <key> <value>')
    .description('Set a configuration parameter')
    .action(async (key, value) => {
      const globalOpts = program.opts();
      const verbose = Boolean(globalOpts.verbose);
      await executeConfigSet(key, value, { verbose });
    });

  program
    .command('reset')
    .description('Reset per-file trust scores to initial values')
    .option('-f, --file <path>', 'target specific file to reset')
    .option('-y, --yes', 'skip interactive confirmation prompt')
    .action(async (options) => {
      const globalOpts = program.opts();
      const verbose = Boolean(globalOpts.verbose);
      await executeReset({
        file: options.file,
        yes: options.yes,
        verbose,
      });
    });

  program
    .command('clean')
    .description('Purge checkpoint history, interceptions, and old sessions from ledger')
    .option('--all', 'purge all historical ledger data')
    .option('-d, --days <number>', 'purge records older than specified number of days')
    .option('-y, --yes', 'skip interactive confirmation prompt')
    .action(async (options) => {
      const globalOpts = program.opts();
      const verbose = Boolean(globalOpts.verbose);
      const days = options.days ? parseInt(options.days, 10) : undefined;
      await executeClean({
        all: options.all,
        days,
        yes: options.yes,
        verbose,
      });
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
