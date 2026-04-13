# PRD: Ratio — A Socratic Interceptor for AI Coding Agents

## Why this instead of the "Pedagogical Harness" in the research doc

The research doc describes a full replacement harness: your own execution loop, your own Tree-sitter AST visualizer, your own sandbox, your own MCP simulation environment. That's a 6-month team project, not something one person ships and demos. Building a new harness also means competing with Claude Code and opencode on raw agent quality, which isn't your fight to pick.

The actual insight worth keeping from the doc is narrower and better: **the harness is the enforcement layer, and MCP already lets you sit inside anyone's harness without building one.** Claude Code, opencode, Cursor, Cline — they all speak MCP. So instead of building a harness, you build a single MCP server that any of those agents connect to. It sits between the agent's tool calls and the filesystem, and it's the thing enforcing the Socratic checkpoint, not the agent itself.

This is also just the Dejavu shape again: local-first, TypeScript/Bun, SQLite, MCP server + CLI. You've already built and shipped this exact kind of tool once, so the risk here is scoping, not tooling.

## Problem

Students using Claude Code, Cursor, or opencode to build projects can generate a working full-stack app without understanding a single architectural decision in it. Nothing in the current agent ecosystem checks whether the human approving a diff actually understood the diff. The agent will happily write 400 lines of auth middleware, the student clicks accept, and three weeks later they can't debug it because they never had to explain it.

This isn't a "students should learn to code properly" complaint. It's a gap in the tooling: every agent harness optimizes for task completion, and none of them ask "does the human in the loop actually know what just happened here."

## What Ratio does

Ratio is an MCP server you point your coding agent at. It doesn't generate code and it doesn't replace your agent. It watches the agent's file-write and file-edit tool calls, and it gates them behind two things:

1. **Complexity threshold checks** — if a single tool call is about to write more than N lines, touch more than one architectural layer (e.g. adds both a DB migration and an API route in one shot), or introduces a new dependency, Ratio pauses the write.
2. **A Socratic checkpoint** — instead of blocking silently, Ratio returns a tool result to the agent that says "before this write lands, ask the user to explain X." The agent (Claude Code, opencode, whatever) then has to relay that question to the student in its own next turn. The student answers in plain language. Ratio doesn't grade grammar, it checks whether the answer references the actual mechanism at stake (e.g. did they mention "render blocking" when asked why three sequential awaits in a React component matter).
3. If the student's answer is a non-answer ("idk just do it"), Ratio downgrades that file's trust score and starts requiring smaller diffs from the agent on that file going forward — this is the "faded scaffolding" idea from the doc, but implemented as a per-file trust score in SQLite instead of a whole separate agent mode.

Everything is logged locally to a SQLite ledger: which files were vibe-coded with zero friction, which ones triggered checkpoints, which checkpoints the student answered well versus badly. That ledger is the actual product for a student's portfolio: proof they can point to that says "here's what I understood versus what I outsourced," which is a stronger signal to an employer than a GitHub repo full of AI-generated code no one can verify.

## What Ratio explicitly does not do (v1)

- No AST visualizer UI. Complexity is measured with cheap heuristics first (lines changed, files touched per call, new imports), not a live Tree-sitter graph. That's a real v2 feature, not a v1 blocker.
- No sandboxed Docker execution environment. Ratio trusts the host agent's existing sandboxing (Claude Code and opencode already have their own approval flows).
- No "Vibe Mode vs Architect Mode" UI toggle. The mode switch is implicit — it's driven by the trust score, not a button the student clicks.
- No enterprise client simulation / FDE training sandbox. Interesting idea, separate project, not this one.
- No custom coding agent. Ratio is a passenger, not a driver.

## Target user

You, first — dogfood it on your own hackathon and portfolio repos. Then CS students doing agent-assisted coursework or hackathons who want to actually be able to defend their code in a viva or an interview afterward. Later, this is a genuinely defensible pitch for a hackathon judged on "does this solve a real problem with a working demo," because the demo is trivial to show: same prompt, two runs, one with Ratio attached and one without, and you can visibly show the agent stopping to ask a question in the Ratio run.

## Core architecture

```
Student's IDE / terminal
        |
   Coding agent (Claude Code / opencode / Cursor)
        |
   MCP client <-----> Ratio MCP server (local, stdio or localhost)
                              |
                        SQLite (repo-scoped ledger + trust scores)
                              |
                        Heuristic complexity scorer
```

- **Ratio MCP server**: TypeScript on Bun, same base as Dejavu. Exposes MCP tools that wrap the agent's normal file-write path. Practically, this means Ratio registers tools like `ratio_write_file` and `ratio_edit_file` that the agent is instructed (via its own system prompt or CLAUDE.md-style config) to call instead of writing directly.
- **Complexity scorer**: pure heuristic in v1 — line delta, file count in one turn, new dependency detection via package.json/Cargo.toml/requirements.txt diff, and a naive "layer" tagger (does this touch something in `/api`, `/db`, `/auth` etc. based on path conventions). No AST parsing required for v1.
- **Ledger**: SQLite, same FTS5-backed approach as Dejavu, repo-scoped. Tables: `checkpoints` (file, timestamp, question asked, answer given, pass/fail judgment), `trust_scores` (per-file, decays on repeated shallow answers, recovers on strong answers).
- **Answer judgment**: v1 uses a cheap keyword/concept match (does the answer mention the specific mechanism the question was about) rather than a second LLM call, to keep this fast and free to run. A model-graded judgment is a clear v2 upgrade once the heuristic version proves the workflow is worth keeping.
- **CLI**: `ratio init` (sets up the SQLite db + repo config), `ratio report` (dumps the understanding ledger as a shareable markdown summary — this is the portfolio artifact).

## User flow (v1 demo path)

1. Student runs `ratio init` in a repo. This drops a `.ratio/` config and tells the connected agent (via MCP tool registration) to route writes through Ratio.
2. Student prompts their agent normally: "add JWT auth to this Express app."
3. Agent starts generating. First small edit (e.g. adding a dependency) goes through with no friction — low complexity, no checkpoint.
4. Agent's next call adds a 60-line auth middleware file plus a DB migration in one shot. Ratio's scorer flags it as crossing the complexity threshold and multi-layer.
5. Ratio returns a tool result instead of a plain success: `{"status": "checkpoint_required", "question": "This adds both a new DB column and new middleware in one step. Before I write this, explain: why does the JWT secret need to live outside the codebase, and what happens if it doesn't?"}`
6. The agent (per its own instructions) relays that question to the student instead of proceeding.
7. Student answers in the chat. Agent calls `ratio_submit_answer`. Ratio checks it against the concept map for that question type, logs the result, and either releases the write or asks a simplified follow-up.
8. At the end of the session, `ratio report` produces a one-page markdown summary: files touched, checkpoints triggered, understanding score per file.

## Success metrics (for your own build, not investors)

- It actually intercepts real Claude Code / opencode sessions without you having to fork either agent. This is the core technical risk and it should be the first thing you validate, before writing any of the scoring logic.
- Median added latency per checkpoint stays under a few seconds so it doesn't feel like the tool is fighting the student.
- On a rebuilt version of one of your past hackathon projects, Ratio should trigger somewhere around 5 to 15 checkpoints for a small full-stack feature. Zero checkpoints means your thresholds are too loose to matter. Constant checkpoints on every single write means it's unusable and you've built an annoying linter, not a tutor.

## Build order

1. Prove MCP interception works at all: minimal Ratio server with a single tool that always returns "checkpoint required" regardless of content, wired into Claude Code or opencode. If the agent actually stops and relays the question, the core mechanic is real.
2. Add the heuristic complexity scorer (line count, file count, dependency diff, layer tagging by path).
3. Add SQLite ledger with the schema above.
4. Add answer judgment (keyword/concept match to start).
5. Add trust score decay/recovery per file.
6. Build `ratio report` as the shareable artifact.
7. Only after all of the above works end to end: revisit whether an AST-based scorer (Tree-sitter) is worth the added complexity, or whether the path-and-line-count heuristic is already good enough.

## Open questions to resolve before you start coding

- Does Claude Code's or opencode's config format actually let you force "use this MCP tool instead of your native file-write tool," or does the agent still have a native write path you can't fully route around? This determines whether v1 is enforceable or just advisory.
- Do you score understanding per file, per PR-sized session, or per concept (auth, async, state management) across the whole repo? Per-file is simplest for v1 and probably right.
- Is the "concept map" per question hand-written by you for a fixed set of common patterns (async/await, auth, N+1 queries, state management), or generated live? Hand-written for a fixed library of 15 to 20 patterns is the realistic v1 scope.
