# Ratio

<div align="center">

[![CI](https://github.com/sanjayrohith/ratio/actions/workflows/ci.yml/badge.svg)](https://github.com/sanjayrohith/ratio/actions/workflows/ci.yml)
[![Release](https://github.com/sanjayrohith/ratio/actions/workflows/release.yml/badge.svg)](https://github.com/sanjayrohith/ratio/actions/workflows/release.yml)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/sanjayrohith/ratio/releases)
[![Runtime](https://img.shields.io/badge/runtime-Bun%201.1+-fbf0df.svg?logo=bun)](https://bun.sh)
[![Protocol](https://img.shields.io/badge/protocol-MCP-8A2BE2.svg)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**A Socratic Interceptor and Comprehension Ledger for AI Coding Agents**

*Stop blindly approving 400-line agent diffs. Prove you actually understand your codebase before landing it on disk.*

[Quickstart](#quickstart) • [How It Works](#how-it-works) • [Agent Integration](#agent-integration) • [CLI Commands](#cli-reference) • [Architecture](#architecture) • [Demo](#demo)

</div>

---

## The Problem

AI coding agents like Claude Code, Cursor, and opencode have made software generation frictionless. An agent can scaffold authentication, database migrations, and complex async pipelines in seconds.

The consequence: **Developers approve massive diffs they cannot explain.** Weeks later, when a production incident occurs or when grilled in a technical interview viva, they cannot explain how their own code works. Every agent harness optimizes for task completion; none verify human comprehension.

## What Ratio Does

Ratio is a local-first **Model Context Protocol (MCP)** server that sits between your AI coding agent and your local filesystem:

1. **Intercepts Writes**: When an agent attempts a file write or edit exceeding complexity thresholds (line count, multi-layer transitions, new dependencies), Ratio pauses the write in an atomic staging buffer.
2. **Issues Socratic Checkpoints**: Instead of silently failing or blocking, Ratio returns a Socratic challenge question to the agent (e.g. *"Why does the JWT secret need to live in process environment variables rather than hardcoded in this middleware?"*).
3. **Validates Understanding**: The agent relays the challenge to the developer. The developer explains the mechanism in plain language. Ratio deterministically checks for mechanistic understanding without external LLM calls.
4. **Fades Scaffolding**: Ratio maintains a per-file trust score in a repo-scoped SQLite ledger (`.ratio/ledger.db`). Strong explanations increase trust and loosen write thresholds; evasive answers ("idk just do it") decay trust and tighten scrutiny.
5. **Generates Portfolio Proof**: At any point, run `ratio report` to produce a shareable, audited markdown ledger (`RATIO_REPORT.md`) with your **Viva Readiness Score** to prove authentic comprehension in interviews.

---

## Demo

Watch Ratio intercept a complex JWT auth middleware write in Claude Code, issue a Socratic challenge, evaluate the developer's explanation, and commit the verified file to disk:

[![Ratio Terminal Demo](https://asciinema.org/a/ratio-demo-badge.svg)](https://asciinema.org/a/ratio-socratic-interceptor-demo)

*(Click to view interactive terminal session replay on asciinema)*

---

## Architecture

```
Student's IDE / Terminal (Claude Code / Cursor / OpenCode)
                        │
                        ▼
         Coding Agent Tool Dispatch Pipeline
                        │
                        ▼ (stdio)
            Ratio MCP Server (Bun / TypeScript)
        ┌───────────────┴───────────────┐
        ▼                               ▼
Heuristic Complexity Scorer     Transactional Staging Buffer
 - Line count deltas             - Pending writes state machine
 - Architectural layer tagger    - Safe atomic file patcher
 - Dependency manifest diffs     - Deadlock & timeout guards
        │                               │
        └───────────────┬───────────────┘
                        ▼
              Socratic Engine
        - 15+ Core concept taxonomy
        - Deterministic keyword & synonym rubrics
        - Anti-pattern evasion detector
                        │
                        ▼
        Repo-Scoped SQLite Ledger (.ratio/ledger.db)
        - Sessions & Interceptions history
        - FTS5 Full-text search across Q&A
        - Per-file Trust Score Engine [0.0 - 1.0]
                        │
                        ▼
        Local Filesystem (Committed on Approval)
```

---

## Quickstart

### 1. Install Ratio CLI

```bash
# Global install with Bun (recommended)
bun add -g ratio

# Or with npm
npm install -g ratio
```

Or run standalone binaries from [GitHub Releases](https://github.com/sanjayrohith/ratio/releases) for Linux, macOS, or Windows.

### 2. Initialize in Your Repository

```bash
cd /path/to/your/project
ratio init
```

This creates:
- `.ratio/ledger.db`: Local SQLite database for audit history and trust scores.
- `ratio.config.json`: Local repository threshold and layer definitions.
- Automatically updates `.gitignore` to protect internal state.

Verify your environment setup:
```bash
ratio doctor
```

---

## Agent Integration

### Claude Code

Add Ratio to your Claude Code MCP configuration:

```bash
claude mcp add ratio bunx ratio
```

Or manually configure in `~/.claude.json` or `.claude/mcp.json`:

```json
{
  "mcpServers": {
    "ratio": {
      "command": "bunx",
      "args": ["ratio"]
    }
  }
}
```

### Cursor

In Cursor **Settings > Features > MCP**, click **Add New MCP Server**:

- **Name**: `ratio`
- **Type**: `stdio`
- **Command**: `bunx ratio`

### OpenCode

Add to your `opencode.json` configuration:

```json
{
  "mcp": {
    "servers": {
      "ratio": {
        "command": "bunx",
        "args": ["ratio"]
      }
    }
  }
}
```

---

## CLI Reference

| Command | Description |
| :--- | :--- |
| `ratio init` | Bootstrap Ratio in workspace (`.ratio/`, config, SQLite migrations, agent configs) |
| `ratio doctor` | Diagnose environment health, Bun runtime, database, and agent integrations |
| `ratio status` | Display repository trust metrics, pass rates, and per-file threshold table |
| `ratio log` | Display recent checkpoint history with pass/fail evaluation outcomes |
| `ratio report` | Generate audited markdown portfolio report (`RATIO_REPORT.md` or `--json`) |
| `ratio config get [key]` | Inspect repository scoring weights and threshold configuration |
| `ratio config set <key> <val>` | Customize line thresholds or layer rules directly from terminal |
| `ratio reset` | Reset per-file trust scores to baseline (1.00) |
| `ratio clean` | Purge historical checkpoint entries and old sessions safely |

---

## Understanding Ledger & Viva Readiness Score

Running `ratio report` generates `RATIO_REPORT.md` in your repository root:

```markdown
# Ratio Portfolio Audit: Understanding Ledger

> Target Repository: my-saas-app
> Auditor: Ratio — Socratic Interceptor for AI Coding Agents

## Executive Summary & Viva Readiness
| Key Metric | Value | Interpretation |
| :--- | :--- | :--- |
| Viva Readiness Score | 98 / 100 | Preparedness to explain and defend code in viva/interview |
| Comprehension Rating | Master | Mechanistic understanding demonstrated across all layers |
| Independent Understanding | 95.2% | Logic defended without reliance on evasive shortcuts |
| Checkpoint Pass Rate | 94.7% | 18 passed / 19 evaluated |
| Total Lines Authored | 1,420 lines | Net lines intercepted across all tool calls |
```

Include `RATIO_REPORT.md` in your project repository or portfolio to prove to recruiters, interviewers, and professors that you built your project with real understanding.

---

## Contributing

Contributions are welcome! Please ensure:
1. All changes pass `bun test`.
2. TypeScript types check cleanly via `bun run typecheck`.
3. Adhere to the existing atomic commit guidelines.

```bash
bun install
bun test
bun run typecheck
```

---

## License

[MIT License](LICENSE) © 2026 sanjayrohith
