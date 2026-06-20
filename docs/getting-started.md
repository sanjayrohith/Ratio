# Getting Started with Ratio: User Guide & Portfolio Walkthrough

Welcome to **Ratio** — the Socratic interceptor and comprehension ledger for AI coding agents.

Modern AI coding agents (Claude Code, Cursor, OpenCode) can scaffold full-stack features in seconds. While this dramatically accelerates productivity, it often leaves developers unable to explain or defend their implementation in technical job interviews, academic vivas, or production post-mortems.

Ratio solves this by sitting between your coding agent and your filesystem. When the agent attempts substantial architectural writes, Ratio holds the file in a staging buffer and requires you to explain the underlying mechanism in plain language. Your explanations are audited, scored, and cataloged into a verified **Understanding Ledger** (`RATIO_REPORT.md`).

---

## 1. Installation & Quickstart

### Prerequisites
- **Bun** (v1.1+ recommended) or **Node.js** (v20+)
- Git initialized in your project repository

### Global Installation

```bash
# Install globally via npm
npm install -g ratio-cli

# Or install with Bun
bun add -g ratio-cli
```

### Initializing Ratio in Your Project

Navigate to your project repository and run:

```bash
cd /path/to/my-project
ratio init
```

This creates:
- `.ratio/ledger.db`: Local SQLite database storing all checkpoints and trust scores.
- `ratio.config.json`: Local project configuration for thresholds and concept mappings.
- Appends `.ratio` and `*.tmp.*` to your `.gitignore`.

Verify your installation with the built-in diagnostic tool:

```bash
ratio doctor
```

---

## 2. Agent Setup & MCP Configuration

Ratio exposes a Model Context Protocol (MCP) server that agents connect to over standard input/output (`stdio`).

### Claude Code

Run this command in your terminal to register Ratio with Claude Code:

```bash
claude mcp add ratio npx ratio server
```

Alternatively, add Ratio directly to your `~/.claude.json` or project-level `.claude.json`:

```json
{
  "mcpServers": {
    "ratio": {
      "command": "npx",
      "args": ["ratio", "server"]
    }
  }
}
```

### Cursor IDE

In Cursor, open **Settings > Features > MCP** and add a new MCP server:

- **Name**: `ratio`
- **Type**: `command`
- **Command**: `npx ratio server`

Or edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "ratio": {
      "command": "npx",
      "args": ["ratio", "server"]
    }
  }
}
```

### OpenCode CLI & Cline

For OpenCode or Cline, configure the server in your MCP settings:

```json
{
  "mcpServers": {
    "ratio": {
      "command": "ratio",
      "args": ["server"]
    }
  }
}
```

---

## 3. The Interception Workflow & Answering Checkpoints

### How Interception Works

1. You prompt your agent: *"Implement user authentication with JWT and bcrypt."*
2. The agent calls `ratio_write_file` or `ratio_edit_file`.
3. Ratio's Complexity Scorer evaluates the diff against thresholds:
   - **Trivial edits** (< 50 lines, single layer, high trust) are **auto-approved** immediately (< 5ms).
   - **Architectural writes** (> 50 lines, layer transitions, new dependencies) trigger a **Socratic Checkpoint**.
4. The agent pauses file creation and displays Ratio's question in your chat.

### Example: Passing vs. Failing Answers

#### Checkpoint Prompt:
> **Socratic Checkpoint**: Modifying `src/services/jwt.ts`. Before writing, explain how token verification and expiration are enforced cryptographically.

#### ❌ Shallow / Evasive Answer (Rejected):
> *"We use JWT so the user stays logged in and it handles auth securely with tokens."*
- **Outcome**: `score: 30/100` — Rejected. Ratio prompts for mechanistic detail (e.g. secret key, HMAC signature, exp claim).

#### ✅ Mechanistic / Conceptual Answer (Approved):
> *"We sign the payload containing userId and role using HMAC-SHA256 with a server-side secret key from environment variables. During verification, we validate the cryptographic signature and verify that the current unix epoch is prior to the `exp` claim. If invalid or expired, jwt.verify throws and we reject with 401."*
- **Outcome**: `score: 92/100` — Approved! Write is atomically committed to disk. Trust score for `src/services/jwt.ts` increases by `+0.1`.

### Dynamic Trust Scaling (Fading Scaffolding)

Ratio uses an **Adaptive Trust Engine**:
- As you consistently explain a file or layer, your trust score rises towards `1.0`.
- At high trust (`> 0.85`), allowable line deltas automatically expand, fading scaffolding for mastered code.
- Shallow answers decrease trust, tightening thresholds to protect against unearned complexity.

---

## 4. Generating Portfolio Reports for Technical Interviews

When preparing for a job interview, viva examination, or hackathon judging, run:

```bash
ratio report
```

This generates **`RATIO_REPORT.md`** in your repository root, complete with:

1. **Viva Readiness Score (0-100)**: Quantified readiness to defend your codebase in a viva or live interview.
2. **Comprehension Rating**: Qualitative tier (*Master*, *Proficient*, *Competent*, *Developing*).
3. **Independent Understanding Percentage**: Ratio of successfully defended code to total AI-generated code.
4. **File-by-File Ledger**: Per-file audit of lines written, questions answered, and trust scores.
5. **Concept Mastery Matrix**: Breakdown across security, database transactions, concurrency, and API routing.
6. **Audit Evidence Log**: Exact questions asked and your recorded technical defenses.

### JSON Export for CI/CD or Portfolios

```bash
ratio report --json --output=audit-report.json
```

---

## 5. CLI Commands Reference

| Command | Description |
| :--- | :--- |
| `ratio init` | Initializes `.ratio/` ledger and `ratio.config.json` |
| `ratio doctor` | Performs comprehensive diagnostic health check |
| `ratio server` | Starts MCP server over stdio for agent connection |
| `ratio report` | Generates GitHub-flavored markdown portfolio audit |
| `ratio report --json` | Outputs machine-readable audit report |
| `ratio status` | Displays active session statistics and current trust scores |
| `ratio config get <key>` | Reads configuration value |
| `ratio config set <key> <val>` | Updates configuration threshold or setting |

---

## 6. Troubleshooting & Diagnostics

- **Agent writes directly without using MCP**:
  Ensure your agent is configured to call Ratio tools (`ratio_write_file`, `ratio_edit_file`). Ratio includes a `GitWatcher` that flags untracked direct modifications during audits.
- **Enable verbose debug tracing**:
  Set `RATIO_DEBUG=1` before launching your agent to stream real-time latency and decision traces to stderr:
  ```bash
  RATIO_DEBUG=1 npx ratio server
  ```
- **Database corrupted or locked**:
  Run `ratio doctor` to verify SQLite WAL mode, database migrations, and schema health.
