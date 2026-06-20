# Changelog

All notable changes to **Ratio** are documented in this file. This project follows [Semantic Versioning](https://semver.org/).

---

## [1.0.0] — 2026-06-20

### Production Release — Socratic Interceptor for AI Coding Agents

#### Added
- **Core MCP Interception**:
  - Implementation of Model Context Protocol (MCP) server over standard input/output (`ratio_write_file`, `ratio_edit_file`, and `ratio_submit_answer`).
  - Strict JSON-RPC 2.0 dispatch pipeline with sub-millisecond serialization and memory management.
  - Transparent write passthrough for low-risk changes and non-code assets.

- **Heuristic Complexity Scorer**:
  - Multi-factor risk analysis evaluating line deltas, file count per agent turn, and dependency manifest modifications (`package.json`, `Cargo.toml`, `requirements.txt`, `pyproject.toml`, `go.mod`).
  - Architectural layer taxonomy (`api`, `db`, `auth`, `ui`, `core`, `config`, `worker`) flagging cross-boundary changes.
  - Early-exit scoring path keeping median added latency under 5ms for trivial edits.

- **Socratic Pedagogical Engine**:
  - Context-aware question selector mapping architectural triggers to probing Socratic questions.
  - Concept taxonomy spanning authentication, database migrations, state immutability, caching, idempotency, rate limiting, and async patterns.
  - Fast, deterministic keyword and concept rubrics with synonym dictionaries, word stemming, and anti-pattern evasion detection without external LLM dependencies.
  - Graduated follow-up guidance when student explanations lack mechanistic reasoning.

- **Faded Scaffolding & Trust Score Engine**:
  - Per-file dynamic trust score `[0.0, 1.0]` that decays on evasive answers (-0.25) and recovers on strong defenses (+0.1).
  - Dynamic threshold scaling that tightens scrutiny on low-trust files and fades scaffolding on well-understood files.

- **Transactional Staging & Resilience**:
  - Safe staging buffer and SQLite-backed `pending_writes` transactional state machine (`PENDING` -> `APPROVED` -> `COMMITTED` / `REJECTED`).
  - Deadlock prevention and configurable ticket expiration for abandoned turns.
  - SQLite WAL mode with busy timeout and exponential backoff retry logic.

- **Workspace Scoping & SQLite Ledger**:
  - Repo-scoped storage in `.ratio/ledger.db` tracking sessions, interceptions, checkpoints, and trust histories.
  - SQLite FTS5 full-text search across all historical questions and answers.

- **Developer CLI**:
  - `ratio init`: Automatic workspace initialization, default configuration, and MCP client registration for Claude Code, Cursor, and opencode.
  - `ratio status`: Real-time inspection of repository trust scores, pass rates, active files, and effective thresholds.
  - `ratio log`: Colorized history of recent checkpoints and evaluation outcomes.
  - `ratio report`: Generates verified markdown (`RATIO_REPORT.md`) and JSON portfolio audit reports proving student comprehension for viva defense and technical interviews.
  - `ratio config`: In-terminal inspection and live adjustment of scoring parameters.
  - `ratio reset` & `ratio clean`: Guided maintenance and reset commands.
  - `ratio doctor`: Comprehensive diagnostic utility verifying runtime, ledger, permissions, and agent configurations.
  - Telemetry-free local metrics summary upon process termination.

- **Cross-Platform Compatibility & Distribution**:
  - Robust path normalization, CRLF/LF preservation, and stdio binary encoding in `platform.ts`.
  - GitHub Actions CI pipeline testing across Linux and macOS environments.
  - Standalone binary cross-compilation pipeline generating native executables for Linux (x64, arm64), macOS (x64, arm64), and Windows (x64).
  - Production distribution packaging on npm.

---

## Development Lifecycle

- **Phase 1**: Repository scaffolding, Bun configuration, core types, initial MCP server skeleton and handshake test suite.
- **Phase 2**: Interceptor protocol schemas, staging buffer, atomic filesystem write executor, and agent rule templates.
- **Phase 3**: Heuristic complexity scorer, line delta calculator, multi-manifest dependency diff parser, and unit test suites.
- **Phase 4**: Architectural layer taxonomy, multi-layer transition detector, composite score aggregator, and configuration schema.
- **Phase 5**: SQLite ledger database foundation with WAL mode, initial migration scripts, and workspace scoping utilities.
- **Phase 6**: Checkpoint repository, interception session tracker, FTS5 full-text search virtual tables, and query interfaces.
- **Phase 7**: Trust score mathematical model, per-file persistence, and dynamic threshold scaling engine.
- **Phase 8**: Persistent pending writes table, commit transaction executor, and rollback cleanup handler.
- **Phase 9**: Socratic question catalog covering full-stack patterns and context-aware question selector.
- **Phase 10**: Deterministic keyword evaluation engine, rubrics, anti-pattern detection, and evaluation unit tests.
- **Phase 11**: `ratio_submit_answer` MCP tool, shallow answer follow-up prompts, and filesystem release loop.
- **Phase 12**: Expanded concept taxonomy (caching, idempotency, rate limiting, render loops), token normalizer, and numeric explanation scoring.
- **Phase 13**: Commander CLI scaffolding, `ratio init`, MCP client auto-configurators, and `ratio doctor`.
- **Phase 14**: `ratio status`, `ratio log`, and colorized per-file trust table inspections.
- **Phase 15**: Shareable portfolio audit report generator (`ratio report`) and comprehension analytics.
- **Phase 16**: `ratio config`, `--json` report export, `ratio reset`/`clean`, and unified CLI error conventions.
- **Phase 17**: Multi-file batch write transaction coordinator, ticket timeout manager, and SQLite busy retry handling.
- **Phase 18**: Early-exit scoring optimizations (<5ms), prepared statement finalizer, and latency regression tests (<50ms SLA).
- **Phase 19**: Agent test harnesses (Claude Code & opencode simulators), hackathon dogfooding suite, and path traversal security boundary hardening.
- **Phase 20**: Comprehensive architecture docs, user guides, sample reports, CI/CD pipelines, cross-platform platform utilities, binary smoke test suite, and v1.0.0 production packaging.
