# Implementation Plan: Ratio — A Socratic Interceptor for AI Coding Agents

This plan details the complete end-to-end development roadmap for **Ratio**, an MCP server that intercepts file-write and file-edit tool calls from AI coding agents (such as Claude Code, Cursor, and opencode) to enforce Socratic checkpoints and track understanding in a repo-scoped SQLite ledger.

The plan consists of **118 atomic implementation tasks** organized across 20 development phases. Each task corresponds to a focused unit of work with explicit implementation instructions grounded in [`prd.md`](file:///home/sanjayrohith/codes/ratio/prd.md).

## Development Phase Roadmap

| Phase | Tasks | Milestone Focus |
| :--- | :---: | :--- |
| Phase 1 | 6 | Repository Scaffolding & Initial MCP Server Skeleton |
| Phase 2 | 7 | Agent Integration Protocol & Tool Dispatch Pipeline |
| Phase 3 | 6 | Heuristic Complexity Scorer: Line Delta & Dependency Analysis |
| Phase 4 | 8 | Complexity Scorer: Architectural Layer Tagger & Aggregation |
| Phase 5 | 4 | SQLite Ledger Database Foundation & Workspace Scoping |
| Phase 6 | 5 | Checkpoint Persistence & Full-Text Search (FTS5) |
| Phase 7 | 6 | Per-File Trust Score Engine (Faded Scaffolding) |
| Phase 8 | 4 | Staged Write Persistence & Transactional State Machine |
| Phase 9 | 4 | Socratic Question Bank & Concept Taxonomy |
| Phase 10 | 3 | Deterministic Concept & Keyword Evaluation Engine |
| Phase 11 | 4 | Answer Submission MCP Tool & Resolution Loop |
| Phase 12 | 5 | Concept Map Expansion & Evaluation Refinement |
| Phase 13 | 7 | CLI Framework & Project Bootstrap (`ratio init`) |
| Phase 14 | 4 | CLI Status & Inspection Commands (`ratio status`, `ratio log`) |
| Phase 15 | 6 | Shareable Portfolio Report Generator (`ratio report`) |
| Phase 16 | 6 | CLI Polish, Configuration Customization & Export Options |
| Phase 17 | 5 | Multi-File Batch Interception & Concurrency Handling |
| Phase 18 | 7 | Performance Optimization & Low-Latency Enforcement (<50ms) |
| Phase 19 | 10 | Agent Compatibility Suite & Dogfooding Simulation |
| Phase 20 | 11 | Documentation, CI/CD, Packaging & v1.0.0 Production Release |
| **TOTAL** | **118** | **Full Production Lifecycle** |

## Development Checklist

### Phase 1 (6 tasks) — Repository Scaffolding & Initial MCP Server Skeleton

- [x] **Task 1**: Initialize the repository with Bun configuration (`package.json`, `tsconfig.json`, `bunfig.toml`), `.gitignore`, and development dependencies for TypeScript, ESLint, and Prettier.

  ```bash
  git commit -m "chore: initialize repository structure and bun project configuration"
  ```

- [x] **Task 2**: Scaffold core application directory tree (`src/server`, `src/cli`, `src/core`, `src/storage`, `src/types`) and create foundational TypeScript interfaces for MCP tools, interceptor events, and configuration schemas.

  ```bash
  git commit -m "feat: scaffold base project directories and core type definitions"
  ```

- [x] **Task 3**: Implement the baseline Model Context Protocol (MCP) server in `src/server/index.ts` using `@modelcontextprotocol/sdk` configured with `StdioServerTransport` for local IPC with coding agents.

  ```bash
  git commit -m "feat: implement minimal modelcontextprotocol server over stdio"
  ```

- [x] **Task 4**: Register the initial MCP tool signatures for `ratio_write_file` and `ratio_edit_file` in `src/server/tools.ts`, defining input schemas for target path, file content, and agent rationale.

  ```bash
  git commit -m "feat: add initial stub tool registration for file-write interception"
  ```

- [x] **Task 5**: Implement the prototype interception handler returning a static `checkpoint_required` response with a dummy question, validating step 1 of the PRD build order to prove agents pause for questions.

  ```bash
  git commit -m "feat: implement mock interceptor returning mandatory checkpoint status"
  ```

- [x] **Task 6**: Create unit tests in `test/server/handshake.test.ts` verifying MCP server startup, JSON-RPC 2.0 handshake, tool enumeration, and mock tool invocation over mock stdio streams.

  ```bash
  git commit -m "test: add unit test suite for mcp server handshake and tool listing"
  ```

### Phase 2 (7 tasks) — Agent Integration Protocol & Tool Dispatch Pipeline

- [x] **Task 7**: Define strict Zod and TypeScript schemas in `src/types/protocol.ts` for interceptor responses: `checkpoint_required` (with challenge prompt and ticket ID), `write_permitted`, and `write_rejected` states.

  ```bash
  git commit -m "feat: define structured tool response schemas for checkpoints and write status"
  ```

- [x] **Task 8**: Build an in-memory staging buffer in `src/core/staging/buffer.ts` to hold pending file writes, generate unique ticket IDs, and preserve write payloads while awaiting Socratic checkpoint resolution.

  ```bash
  git commit -m "feat: implement write request staging mechanism for intercepted files"
  ```

- [x] **Task 9**: Implement safe filesystem operations in `src/storage/fs.ts` handling parent directory creation, atomic temporary file creation, and replacement for approved writes.

  ```bash
  git commit -m "feat: implement direct filesystem write execution when write is permitted"
  ```

- [x] **Task 10**: Implement diff patching and line-range replacement in `src/core/staging/patcher.ts` for `ratio_edit_file`, ensuring accurate string substitutions before staging.

  ```bash
  git commit -m "feat: implement atomic patch and edit application for ratio_edit_file"
  ```

- [x] **Task 11**: Create configuration templates in `templates/agent-rules/` generating `CLAUDE.md` and cursor rules that instruct agents (Claude Code, opencode, Cursor) to route file writes through Ratio MCP tools.

  ```bash
  git commit -m "feat: add agent prompt injection and config template generator"
  ```

- [x] **Task 12**: Add integration test in `test/integration/interception-flow.test.ts` simulating a full agent write request, verifying the returned checkpoint payload and staged write retention.

  ```bash
  git commit -m "test: add end-to-end simulation test for agent write interception flow"
  ```

- [x] **Task 13**: Write architectural documentation in `docs/architecture/interception-protocol.md` explaining how Ratio intercepts agent file writes via MCP and how to configure supported agents.

  ```bash
  git commit -m "docs: document mcp interception protocol and agent configuration guide"
  ```

### Phase 3 (6 tasks) — Heuristic Complexity Scorer: Line Delta & Dependency Analysis

- [x] **Task 14**: Define TypeScript types and default thresholds in `src/core/scorer/types.ts` for line count delta, file count per turn, and third-party dependency additions.

  ```bash
  git commit -m "feat: define complexity metric types and configurable scoring thresholds"
  ```

- [x] **Task 15**: Implement `LineDeltaCalculator` in `src/core/scorer/line-delta.ts` computing lines added, lines removed, and total modification footprint between current disk content and proposed content.

  ```bash
  git commit -m "feat: implement line delta calculator for write and edit operations"
  ```

- [x] **Task 16**: Implement dependency diff parsers in `src/core/scorer/dependencies.ts` for `package.json`, `Cargo.toml`, `requirements.txt`, `pyproject.toml`, and `go.mod` to detect newly added libraries.

  ```bash
  git commit -m "feat: implement multi-manifest dependency diff parser"
  ```

- [x] **Task 17**: Connect `LineDeltaCalculator` and dependency diff detection into the MCP tool request handler, automatically approving trivial edits and flagging writes that exceed thresholds.

  ```bash
  git commit -m "feat: integrate line threshold and dependency checks into interception pipeline"
  ```

- [x] **Task 18**: Create comprehensive unit tests in `test/scorer/line-delta.test.ts` testing new file creation, multiline replacements, single-line tweaks, whitespace-only changes, and deletions.

  ```bash
  git commit -m "test: add unit tests for line delta calculation across varied file formats"
  ```

- [ ] **Task 19**: Write unit tests in `test/scorer/dependencies.test.ts` validating detection of added packages across npm, pip, and cargo manifests with various dependency block structures.

  ```bash
  git commit -m "test: add unit tests for dependency parser detecting new imports and packages"
  ```

### Phase 4 (8 tasks) — Complexity Scorer: Architectural Layer Tagger & Aggregation

- [ ] **Task 20**: Define architectural layer categories (`api`, `db`, `auth`, `ui`, `core`, `config`, `worker`) and regex/glob path matchers in `src/core/scorer/layers.ts`.

  ```bash
  git commit -m "feat: define architectural layer taxonomy and path pattern matchers"
  ```

- [ ] **Task 21**: Implement `LayerTransitionDetector` in `src/core/scorer/transitions.ts` to identify when tool invocations within a single turn cross architectural layer boundaries.

  ```bash
  git commit -m "feat: implement multi-layer change detector across concurrent writes"
  ```

- [ ] **Task 22**: Implement the composite scoring aggregator in `src/core/scorer/composite.ts`, combining line delta, file count, layer transitions, and dependency additions into a unified risk assessment.

  ```bash
  git commit -m "feat: implement composite complexity score aggregator"
  ```

- [ ] **Task 23**: Expand `ratio.config.json` schema in `src/core/config/schema.ts` to allow customizable scoring weights, layer path definitions, and line delta thresholds per repository.

  ```bash
  git commit -m "feat: add configurable rule definitions in ratio configuration schema"
  ```

- [ ] **Task 24**: Integrate architectural layer tagging into `ratio_write_file` and `ratio_edit_file`, flagging multi-layer operations (such as simultaneously adding a DB migration and an API route) for checkpointing.

  ```bash
  git commit -m "feat: integrate layer tagger into write interception pipeline"
  ```

- [ ] **Task 25**: Add unit tests in `test/scorer/layers.test.ts` verifying layer classification for standard project structures (Express, Next.js, Django, FastAPI, NestJS).

  ```bash
  git commit -m "test: add unit tests for architectural path pattern matching"
  ```

- [ ] **Task 26**: Create integration tests in `test/scorer/composite.test.ts` verifying that multi-layer changes trigger checkpoints while single-layer small diffs pass through transparently.

  ```bash
  git commit -m "test: add integration tests for composite complexity scoring engine"
  ```

- [ ] **Task 27**: Refactor complexity scoring into modular pipeline stages (`SizeStage`, `LayerStage`, `DependencyStage`) sharing a common `EvaluationContext` interface for maintainability.

  ```bash
  git commit -m "refactor: extract complexity analysis into modular pipeline stages"
  ```

### Phase 5 (4 tasks) — SQLite Ledger Database Foundation & Workspace Scoping

- [ ] **Task 28**: Implement the SQLite database provider in `src/storage/db.ts` using `bun:sqlite`, configuring Write-Ahead Logging (WAL), foreign keys, and synchronous pragmas.

  ```bash
  git commit -m "feat: initialize sqlite database connection with wal mode and bun:sqlite"
  ```

- [ ] **Task 29**: Create migration script in `src/storage/migrations/001_initial_schema.sql` defining `sessions`, `interceptions`, `checkpoints`, and `trust_scores` tables with indexes and timestamps.

  ```bash
  git commit -m "feat: define and execute initial schema migration for ledger and sessions"
  ```

- [ ] **Task 30**: Build repository workspace utilities in `src/storage/workspace.ts` to locate project root, ensure isolated `.ratio/` directory creation, and manage repo-scoped `ledger.db`.

  ```bash
  git commit -m "feat: implement repository scoping and local .ratio directory locator"
  ```

- [ ] **Task 31**: Add tests in `test/storage/migration.test.ts` verifying database initialization, migration application, table schema integrity, and clean connection disposal.

  ```bash
  git commit -m "test: add migration runner tests and sqlite connection lifecycle checks"
  ```

### Phase 6 (5 tasks) — Checkpoint Persistence & Full-Text Search (FTS5)

- [ ] **Task 32**: Implement `CheckpointRepository` in `src/storage/checkpoint-repo.ts` with methods to insert checkpoints, record student answers, update pass/fail status, and query records.

  ```bash
  git commit -m "feat: implement data access layer for logging checkpoint events"
  ```

- [ ] **Task 33**: Implement `SessionRepository` in `src/storage/session-repo.ts` to group tool calls into distinct coding sessions, tracking files touched, duration, and checkpoint statistics.

  ```bash
  git commit -m "feat: implement interception session tracker and turn correlator"
  ```

- [ ] **Task 34**: Add migration in `src/storage/migrations/002_fts5_checkpoints.sql` creating an FTS5 virtual table `checkpoints_fts` and triggers to enable fast full-text search across questions and answers.

  ```bash
  git commit -m "feat: add fts5 virtual table for full-text search over checkpoint history"
  ```

- [ ] **Task 35**: Implement query interface in `src/storage/queries.ts` supporting pagination, filtering by file path, date ranges, concept category, and full-text keyword queries.

  ```bash
  git commit -m "feat: implement repository query interface for checkpoint history retrieval"
  ```

- [ ] **Task 36**: Add integration tests in `test/storage/checkpoint-repo.test.ts` verifying checkpoint persistence, lifecycle status updates, and keyword search via FTS5 queries.

  ```bash
  git commit -m "test: add integration tests for checkpoint persistence and fts5 search"
  ```

### Phase 7 (6 tasks) — Per-File Trust Score Engine (Faded Scaffolding)

- [ ] **Task 37**: Define mathematical formulas and default parameters in `src/core/trust/model.ts`: initial score (1.0), decay penalty (-0.25), recovery increment (+0.1), and bounds [0.0, 1.0].

  ```bash
  git commit -m "feat: define trust score mathematical model and decay-recovery constants"
  ```

- [ ] **Task 38**: Implement `TrustScoreRepository` in `src/storage/trust-repo.ts` managing per-file records, tracking score adjustments, total passes, total failures, and update timestamps.

  ```bash
  git commit -m "feat: implement trust score repository and per-file state persistence"
  ```

- [ ] **Task 39**: Build `DynamicThresholdScaler` in `src/core/trust/scaler.ts` that scales line delta limits based on file trust score: lower trust tightens write thresholds, higher trust fades scaffolding.

  ```bash
  git commit -m "feat: implement dynamic threshold scaling based on file trust score"
  ```

- [ ] **Task 40**: Implement trust score coordinator in `src/core/trust/coordinator.ts` updating file scores immediately when checkpoint answers are evaluated as passed or failed.

  ```bash
  git commit -m "feat: implement trust score update logic triggered on checkpoint resolution"
  ```

- [ ] **Task 41**: Write unit tests in `test/trust/model.test.ts` verifying boundary clamping [0.0, 1.0], penalty calculation on shallow answers, and incremental recovery on strong explanations.

  ```bash
  git commit -m "test: add unit tests for trust score decay and recovery formulas"
  ```

- [ ] **Task 42**: Write integration tests in `test/trust/scaler.test.ts` proving that repeated shallow answers progressively tighten diff thresholds on the affected file.

  ```bash
  git commit -m "test: add integration test for dynamic threshold adaptation over successive writes"
  ```

### Phase 8 (4 tasks) — Staged Write Persistence & Transactional State Machine

- [ ] **Task 43**: Add `pending_writes` table migration and DAO in `src/storage/pending-writes.ts` to persist staged write payloads to disk, ensuring recovery across agent restarts.

  ```bash
  git commit -m "feat: implement sqlite-backed pending writes table for atomic transaction safety"
  ```

- [ ] **Task 44**: Implement commit transaction executor in `src/core/staging/executor.ts` that loads staged payloads from SQLite, writes to the target path atomically, and marks status as `COMMITTED`.

  ```bash
  git commit -m "feat: implement staged write release and commit transaction executor"
  ```

- [ ] **Task 45**: Implement rejection cleanup handler in `src/core/staging/rollback.ts` that purges staged payloads upon checkpoint rejection or cancellation without modifying the target file.

  ```bash
  git commit -m "feat: implement staged write rejection and rollback cleanup handler"
  ```

- [ ] **Task 46**: Write tests in `test/staging/lifecycle.test.ts` verifying state transitions: `PENDING` -> `APPROVED` -> `COMMITTED` and `PENDING` -> `REJECTED`, checking database records.

  ```bash
  git commit -m "test: add state machine tests for staged write lifecycle transitions"
  ```

### Phase 9 (4 tasks) — Socratic Question Bank & Concept Taxonomy

- [ ] **Task 47**: Define taxonomy enums and concept definitions in `src/core/concepts/taxonomy.ts` covering 15 full-stack patterns (JWT secrets, DB migrations, async waterfalls, SQL injection, connection pools, etc.).

  ```bash
  git commit -m "feat: define core concept taxonomy covering 15 common full-stack patterns"
  ```

- [ ] **Task 48**: Build question bank catalog in `src/core/concepts/catalog.ts` containing targeted Socratic questions focusing on architectural rationale, mechanisms, and trade-offs.

  ```bash
  git commit -m "feat: implement question bank catalog with concept-specific probing questions"
  ```

- [ ] **Task 49**: Build `QuestionSelector` in `src/core/concepts/selector.ts` mapping detected architectural layers, touched files, and diff keywords to appropriate Socratic questions.

  ```bash
  git commit -m "feat: implement context-aware question selector based on complexity triggers"
  ```

- [ ] **Task 50**: Write unit tests in `test/concepts/catalog.test.ts` verifying that all 15 concepts provide valid probing questions, keyword rubrics, and correct category classifications.

  ```bash
  git commit -m "test: add catalog verification tests for question bank completeness"
  ```

### Phase 10 (3 tasks) — Deterministic Concept & Keyword Evaluation Engine

- [ ] **Task 51**: Define mechanism keyword rubrics, technical synonym dictionaries, and anti-pattern evasion phrases (`idk`, `just do it`, `skip`) in `src/core/evaluation/rubrics.ts`.

  ```bash
  git commit -m "feat: define concept keyword rubrics, anti-patterns, and synonym dictionaries"
  ```

- [ ] **Task 52**: Implement deterministic evaluation engine in `src/core/evaluation/matcher.ts` checking whether the student's answer references required mechanisms without calling external LLMs.

  ```bash
  git commit -m "feat: implement fast deterministic keyword matching evaluation engine"
  ```

- [ ] **Task 53**: Author unit tests in `test/evaluation/matcher.test.ts` testing student answers across genuine explanations, partial answers, technical synonyms, and evasive shortcuts.

  ```bash
  git commit -m "test: add unit tests for concept matcher across valid and invalid answers"
  ```

### Phase 11 (4 tasks) — Answer Submission MCP Tool & Resolution Loop

- [ ] **Task 54**: Implement and register `ratio_submit_answer` MCP tool in `src/server/tools/submit-answer.ts`, taking `ticket_id` and `answer` text, and delegating to evaluation engine.

  ```bash
  git commit -m "feat: implement ratio_submit_answer mcp tool handler"
  ```

- [ ] **Task 55**: Implement shallow answer rejection in `src/core/evaluation/follow-up.ts`, returning a guiding hint and follow-up prompt when answers lack mechanistic understanding.

  ```bash
  git commit -m "feat: implement shallow answer rejection and graduated follow-up generation"
  ```

- [ ] **Task 56**: Integrate evaluation outcome with `TrustScoreRepository` and staging executor: approve and flush write on success, or penalize file trust on failure.

  ```bash
  git commit -m "feat: connect answer evaluation result to trust score update and write release"
  ```

- [ ] **Task 57**: Author integration tests in `test/integration/answer-loop.test.ts` simulating the full write -> checkpoint -> submit answer -> evaluate -> commit filesystem flow.

  ```bash
  git commit -m "test: add integration tests for full checkpoint-answer-evaluation loop"
  ```

### Phase 12 (5 tasks) — Concept Map Expansion & Evaluation Refinement

- [ ] **Task 58**: Add concepts, questions, and rubrics in `src/core/concepts/catalog.ts` for React re-render loops (`STATE_RENDER_LOOP`), mutation bugs (`STATE_IMMUTABILITY`), and cache invalidation.

  ```bash
  git commit -m "feat: expand concept catalog with state management and caching patterns"
  ```

- [ ] **Task 59**: Add concepts, questions, and rubrics for API idempotency keys (`API_IDEMPOTENCY`), rate limiting algorithms (`RATE_LIMITING`), and error boundaries (`ERROR_BOUNDARY`).

  ```bash
  git commit -m "feat: expand concept catalog with api design and error boundary patterns"
  ```

- [ ] **Task 60**: Build normalizer in `src/core/evaluation/normalizer.ts` handling lowercase conversion, punctuation stripping, word stemming, and pluralization tolerance.

  ```bash
  git commit -m "feat: implement fuzzy token matching and pluralization normalizer for evaluation"
  ```

- [ ] **Task 61**: Extend `checkpoints` table migration and repository methods to record numeric concept coverage scores (0-100), detected keywords, and evasion indicators.

  ```bash
  git commit -m "feat: add explanation quality scoring metrics to checkpoint ledger"
  ```

- [ ] **Task 62**: Add unit tests in `test/concepts/expanded.test.ts` and `test/evaluation/normalizer.test.ts` verifying fuzzy matching, stemming, and evaluation for newly added concepts.

  ```bash
  git commit -m "test: add test coverage for expanded concept questions and normalized evaluation"
  ```

### Phase 13 (7 tasks) — CLI Framework & Project Bootstrap (`ratio init`)

- [ ] **Task 63**: Scaffold the command-line interface entry point in `src/cli/index.ts` using `commander`, defining global flags (`--verbose`, `--help`, `--version`) and subcommands.

  ```bash
  git commit -m "feat: scaffold ratio cli entry point using commander and bun executable"
  ```

- [ ] **Task 64**: Implement `ratio init` in `src/cli/commands/init.ts` creating `.ratio/` directory, generating default `ratio.config.json`, and running initial SQLite migrations.

  ```bash
  git commit -m "feat: implement ratio init command to bootstrap .ratio configuration"
  ```

- [ ] **Task 65**: Implement automatic Claude Code configuration updater in `src/cli/configurators/claude.ts` modifying `.claude.json` or `.claude/mcp.json` to register Ratio MCP server.

  ```bash
  git commit -m "feat: implement automatic mcp client configuration writer for claude code"
  ```

- [ ] **Task 66**: Implement configuration generators in `src/cli/configurators/cursor.ts` and `opencode.ts` generating MCP connection JSON for Cursor and opencode.

  ```bash
  git commit -m "feat: implement cursor and opencode mcp configuration generator"
  ```

- [ ] **Task 67**: Implement template injector in `src/cli/configurators/guidelines.ts` writing Socratic routing guidelines into project `CLAUDE.md` to force agents to invoke Ratio tools.

  ```bash
  git commit -m "feat: implement claude.md and agent guidelines template injection"
  ```

- [ ] **Task 68**: Implement `ratio doctor` in `src/cli/commands/doctor.ts` checking Bun runtime presence, SQLite ledger health, file write permissions, and agent configuration status.

  ```bash
  git commit -m "feat: implement ratio doctor diagnostic command for environment validation"
  ```

- [ ] **Task 69**: Write CLI tests in `test/cli/init.test.ts` validating `ratio init` in temporary test directories, checking created files and config schemas.

  ```bash
  git commit -m "test: add end-to-end cli tests for ratio init and configuration generation"
  ```

### Phase 14 (4 tasks) — CLI Status & Inspection Commands (`ratio status`, `ratio log`)

- [ ] **Task 70**: Implement `ratio status` in `src/cli/commands/status.ts` displaying total checkpoints, pass rate, active sessions, and tracked files from SQLite ledger.

  ```bash
  git commit -m "feat: implement ratio status command showing active repo metrics"
  ```

- [ ] **Task 71**: Implement `ratio log` in `src/cli/commands/log.ts` rendering recent checkpoint history with colorized pass/fail status, questions, and timestamps.

  ```bash
  git commit -m "feat: implement ratio log command to display recent checkpoints in terminal"
  ```

- [ ] **Task 72**: Add per-file trust score breakdown table to `ratio status` rendering current trust ratings (0.0 - 1.0) and effective line thresholds per file.

  ```bash
  git commit -m "feat: add trust score inspection table to ratio status output"
  ```

- [ ] **Task 73**: Add test coverage in `test/cli/status.test.ts` and `test/cli/log.test.ts` verifying terminal output formatting, empty ledger states, and option handling.

  ```bash
  git commit -m "test: add cli tests for ratio status and log command outputs"
  ```

### Phase 15 (6 tasks) — Shareable Portfolio Report Generator (`ratio report`)

- [ ] **Task 74**: Design the markdown report structure in `src/core/reporting/template.ts` with executive summary, comprehension rating, viva readiness score, and file audit tables.

  ```bash
  git commit -m "feat: design markdown report template structure for portfolio export"
  ```

- [ ] **Task 75**: Implement `ReportAnalytics` in `src/core/reporting/analytics.ts` computing total lines authored, checkpoint pass/fail ratio, and independent understanding percentage.

  ```bash
  git commit -m "feat: implement metrics aggregator calculating comprehension ratios"
  ```

- [ ] **Task 76**: Implement per-file breakdown generator in `src/core/reporting/file-summary.ts` detailing lines written, checkpoints triggered, questions answered, and final trust score.

  ```bash
  git commit -m "feat: implement per-file understanding ledger breakdown generator"
  ```

- [ ] **Task 77**: Build concept mastery reporter in `src/core/reporting/concept-summary.ts` listing architectural concepts successfully defended versus bypassed or failed.

  ```bash
  git commit -m "feat: implement concept mastery summary section in report generator"
  ```

- [ ] **Task 78**: Implement `ratio report` CLI command in `src/cli/commands/report.ts` generating `RATIO_REPORT.md` in repository root, with `--output` and `--stdout` options.

  ```bash
  git commit -m "feat: implement ratio report command with file export and stdout flags"
  ```

- [ ] **Task 79**: Write snapshot and unit tests in `test/reporting/report.test.ts` asserting correct markdown formatting, metrics calculation, and table structures.

  ```bash
  git commit -m "test: add unit and snapshot tests for markdown report generation"
  ```

### Phase 16 (6 tasks) — CLI Polish, Configuration Customization & Export Options

- [ ] **Task 80**: Implement `ratio config get` and `ratio config set` in `src/cli/commands/config.ts` allowing command-line inspection and modification of threshold parameters.

  ```bash
  git commit -m "feat: implement ratio config get/set commands for threshold customization"
  ```

- [ ] **Task 81**: Add `--json` export option to `ratio report` in `src/cli/commands/report.ts` enabling structured JSON data export for CI analysis or external dashboards.

  ```bash
  git commit -m "feat: add json export format option to ratio report command"
  ```

- [ ] **Task 82**: Implement `ratio reset` and `ratio clean` in `src/cli/commands/reset.ts` with interactive confirmation prompts to reset trust scores or purge old logs.

  ```bash
  git commit -m "feat: implement ledger reset and purge commands with safety prompts"
  ```

- [ ] **Task 83**: Enhance CLI commands with `picocolors` formatting, spinners (`ora`), and clear diagnostic output for improved developer experience.

  ```bash
  git commit -m "feat: add colorized terminal output and spinners for long-running cli actions"
  ```

- [ ] **Task 84**: Standardize error handling and exit code conventions across all CLI commands (0 = success, 1 = user/configuration error, 2 = internal fatal error).

  ```bash
  git commit -m "refactor: unify error handling and exit codes across all cli commands"
  ```

- [ ] **Task 85**: Add integration tests in `test/cli/config.test.ts` and `test/cli/report-json.test.ts` verifying CLI config modifications and JSON report schema compliance.

  ```bash
  git commit -m "test: add integration tests for config modification and json report export"
  ```

### Phase 17 (5 tasks) — Multi-File Batch Interception & Concurrency Handling

- [ ] **Task 86**: Implement `BatchTransactionCoordinator` in `src/core/staging/batch.ts` handling rapid multi-file writes in a single turn and computing cross-file layer impact.

  ```bash
  git commit -m "feat: implement multi-file batch write transaction coordinator"
  ```

- [ ] **Task 87**: Implement ticket timeout manager in `src/core/staging/timeout.ts` to expire abandoned pending writes after configurable timeout (e.g., 10 minutes) without deadlocking.

  ```bash
  git commit -m "feat: implement deadlock detection and timeout handling for pending writes"
  ```

- [ ] **Task 88**: Add SQLite connection retry logic with exponential backoff and 5000ms busy timeout in `src/storage/db.ts` to prevent `SQLITE_BUSY` errors under concurrent tool calls.

  ```bash
  git commit -m "feat: implement concurrent sqlite connection handling and busy retry logic"
  ```

- [ ] **Task 89**: Write stress tests in `test/server/concurrency.test.ts` simulating concurrent tool calls and database transactions to verify consistency and lock handling.

  ```bash
  git commit -m "test: add concurrency stress tests for simultaneous write requests"
  ```

- [ ] **Task 90**: Write tests in `test/staging/timeout.test.ts` confirming abandoned staged writes expire cleanly and release locks for subsequent operations.

  ```bash
  git commit -m "test: add timeout and expiration tests for abandoned checkpoints"
  ```

### Phase 18 (7 tasks) — Performance Optimization & Low-Latency Enforcement (<50ms)

- [ ] **Task 91**: Add early-exit optimizations in `ComplexityScorer` in `src/core/scorer/index.ts` to bypass heavy AST/regex checks for small diffs on trusted files in <5ms.

  ```bash
  git commit -m "perf: optimize heuristic complexity scorer with early-exit conditions"
  ```

- [ ] **Task 92**: Implement memory caching in `src/core/scorer/cache.ts` for manifest file contents and compiled layer regex matchers to reduce disk I/O on repeated calls.

  ```bash
  git commit -m "perf: cache parsed package manifests and layer pattern regexes in memory"
  ```

- [ ] **Task 93**: Add composite indexes in `src/storage/migrations/003_performance_indexes.sql` on `(file_path, updated_at)` and `(status, created_at)` for sub-millisecond queries.

  ```bash
  git commit -m "perf: optimize sqlite query indexes for checkpoint lookups and trust scores"
  ```

- [ ] **Task 94**: Build a benchmarking script in `bench/interception-latency.ts` measuring end-to-end latency of MCP tool dispatch, scoring, and SQLite logging.

  ```bash
  git commit -m "feat: implement latency benchmarking harness for tool call interceptor"
  ```

- [ ] **Task 95**: Implement explicit stream buffer cleanup and prepared statement finalization in `src/server/transport.ts` to prevent memory leaks during long-running sessions.

  ```bash
  git commit -m "feat: add memory leak prevention and resource disposal for stdio streams"
  ```

- [ ] **Task 96**: Add automated latency regression tests in `test/bench/latency.test.ts` asserting that median added interception overhead remains strictly under 50ms.

  ```bash
  git commit -m "test: add benchmark regression tests validating interception latency under 50ms"
  ```

- [ ] **Task 97**: Refactor MCP JSON-RPC message dispatcher in `src/server/dispatcher.ts` to eliminate superfluous memory allocations in high-throughput coding sessions.

  ```bash
  git commit -m "refactor: streamline mcp request dispatching for high-throughput coding sessions"
  ```

### Phase 19 (10 tasks) — Agent Compatibility Suite & Dogfooding Simulation

- [ ] **Task 98**: Build mock Claude Code client simulator in `test/harness/mock-claude.ts` exercising stdio transport, tool invocation, and question relaying behavior.

  ```bash
  git commit -m "feat: implement mock claude code client harness for integration testing"
  ```

- [ ] **Task 99**: Build mock opencode client simulator in `test/harness/mock-opencode.ts` verifying JSON-RPC compliance and tool interaction across different agent engines.

  ```bash
  git commit -m "feat: implement mock opencode client harness for dual-agent verification"
  ```

- [ ] **Task 100**: Create simulation script in `scripts/simulate-feature.ts` modeling the PRD demo flow: Express app adding JWT authentication middleware and database migration.

  ```bash
  git commit -m "feat: implement end-to-end full-stack feature simulation script"
  ```

- [ ] **Task 101**: Fix handling of zero-byte file creations, empty replacement strings, and file deletion requests in `src/core/staging/patcher.ts`.

  ```bash
  git commit -m "fix: handle edge case where agent sends empty file edits or deletions"
  ```

- [ ] **Task 102**: Add binary and media file detection in `src/core/scorer/binary.ts` to bypass conceptual checkpoints for images and fonts while maintaining ledger tracking.

  ```bash
  git commit -m "fix: handle binary file writes and non-text asset bypass"
  ```

- [ ] **Task 103**: Add path canonicalization and sandbox boundary validation in `src/core/security/path.ts` preventing writes outside the repository root.

  ```bash
  git commit -m "fix: prevent path traversal attacks in ratio_write_file targets"
  ```

- [ ] **Task 104**: Implement git-based change detection in `src/core/sync/git-watcher.ts` flagging untracked direct file writes that bypassed Ratio MCP tools.

  ```bash
  git commit -m "feat: implement graceful fallback when agent bypasses mcp and writes directly"
  ```

- [ ] **Task 105**: Run end-to-end dogfooding test in `test/dogfood/hackathon.test.ts` verifying that building a standard full-stack feature triggers between 5 and 15 checkpoints.

  ```bash
  git commit -m "test: run automated dogfooding suite against simulated hackathon repo"
  ```

- [ ] **Task 106**: Write security boundary tests in `test/security/path-traversal.test.ts` attempting directory escapes via `../`, null bytes, and symlinks, asserting all are blocked.

  ```bash
  git commit -m "test: add security boundary tests verifying path traversal prevention"
  ```

- [ ] **Task 107**: Refactor internal event emitter and logger in `src/core/logger.ts` to support clean structured output and formatted tracing when `RATIO_DEBUG=1`.

  ```bash
  git commit -m "refactor: clean up internal event emitter and logger for debug visibility"
  ```

### Phase 20 (11 tasks) — Documentation, CI/CD, Packaging & v1.0.0 Production Release

- [ ] **Task 108**: Author architecture reference in `docs/architecture/overview.md` with Mermaid sequence diagrams illustrating Agent <-> MCP <-> SQLite <-> Filesystem workflow.

  ```bash
  git commit -m "docs: create comprehensive architecture documentation and interception flowcharts"
  ```

- [ ] **Task 109**: Write user guide in `docs/getting-started.md` explaining installation, agent setup, answering checkpoints, and presenting portfolio reports in interviews.

  ```bash
  git commit -m "docs: write user getting-started guide and student portfolio showcase walkthrough"
  ```

- [ ] **Task 110**: Create showcase artifact in `docs/examples/SAMPLE_RATIO_REPORT.md` illustrating an audited portfolio report from an agent-assisted hackathon project.

  ```bash
  git commit -m "docs: create sample ratio report showcase artifact in documentation"
  ```

- [ ] **Task 111**: Create GitHub Actions workflow in `.github/workflows/ci.yml` running linting, TypeScript typecheck, and Bun test suite across Linux and macOS runners.

  ```bash
  git commit -m "ci: implement github actions workflow for automated testing and linting"
  ```

- [ ] **Task 112**: Create release workflow in `.github/workflows/release.yml` using `bun build --compile` to generate standalone binaries for Linux (x64, arm64), macOS (x64, arm64), and Windows.

  ```bash
  git commit -m "ci: implement cross-platform compilation and binary artifact build pipeline"
  ```

- [ ] **Task 113**: Implement local session summary in `src/cli/summary.ts` printing total intercepted writes, checkpoints cleared, and active trust scores upon process termination.

  ```bash
  git commit -m "feat: add telemetry-free local metrics summary to cli exit messages"
  ```

- [ ] **Task 114**: Configure `package.json` distribution metadata, `bin` field for `ratio` CLI executable, `files` list, and publishing permissions for npm distribution.

  ```bash
  git commit -m "build: configure npm publishing configuration and binary distribution manifests"
  ```

- [ ] **Task 115**: Fix cross-platform edge cases in `src/core/utils/platform.ts` handling Windows path separators (`\` vs `/`), CRLF line endings, and stdio binary encoding.

  ```bash
  git commit -m "fix: resolve final edge cases in windows file path separators and stdio encoding"
  ```

- [ ] **Task 116**: Execute smoke tests in `test/smoke/binary.test.ts` verifying CLI execution, MCP initialization, and reporting against compiled standalone binaries.

  ```bash
  git commit -m "test: execute full end-to-end smoke test across compiled distribution binaries"
  ```

- [ ] **Task 117**: Finalize version `1.0.0` in `package.json`, generate `CHANGELOG.md` detailing the entire development roadmap, and verify MIT license in `LICENSE`.

  ```bash
  git commit -m "chore: finalize version 1.0.0 release metadata, changelog, and license files"
  ```

- [ ] **Task 118**: Update repository root `README.md` with product overview, badge links, quickstart commands, architecture overview, and instructions for Claude Code and Cursor.

  ```bash
  git commit -m "docs: update main readme with quickstart, demo asciinema link, and mcp installation commands"
  ```
