# Working on this repo with Claude

This repo gets edited from two different Claude environments because each one is good at something different — and one of them can't push to GitHub. Until that gap closes, follow this hybrid pattern.

## The split

**Cowork-Claude** (web, claude.ai/cowork) — long-context drafting layer.
- Persistent project memory across sessions.
- Can read the live Google Sheet via the Drive connector.
- Can run Apps Script patches inside the sheet (e.g. `patch_results_formulas.gs`).
- **Cannot push code to this GitHub repo.** Connector is "Connected" but write tools 403 every time.

**Claude Code** (desktop CLI) — git layer.
- Pushes to GitHub like any normal git client.
- Reads the workspace folder Cowork wrote into.
- Doesn't have Cowork's long-running project memory.

## Why Cowork can't push

Confirmed connector bug, not a setup problem on our side:

- [anthropics/claude-code#52549](https://github.com/anthropics/claude-code/issues/52549) — Cowork's GitHub MCP wires to a dev endpoint (`[Dev] Anthropic Github MCP Connector`) that lacks repo write scope, regardless of whether the user has installed the Claude GitHub App.
- [anthropics/claude-code#47535](https://github.com/anthropics/claude-code/issues/47535) — exact symptom: GitHub integration shows "Connected" but no GitHub tools load.
- [anthropics/claude-code#23736](https://github.com/anthropics/claude-code/issues/23736) — broader pattern of MCPs silently failing in Cowork while working in Claude Code CLI.

Workarounds we considered and rejected:
- **Composio managed Cowork MCP** — works but adds a third party between Cowork and GitHub.
- **Self-hosted Docker `github-mcp-server` + tunnel** — works but Docker isn't installed locally and tunnel uptime is operational overhead.

We picked **hybrid** for now.

## The flow

```
┌────────────────────┐    drafts files    ┌──────────────────────┐
│  Cowork-Claude     │ ─────────────────▶ │  Workspace folder    │
│  (web)             │                    │  (local, on Ross's   │
│                    │                    │   Win11 desktop)     │
└────────────────────┘                    └──────────┬───────────┘
                                                     │ reads
                                                     ▼
                                          ┌──────────────────────┐
                                          │  Claude Code (CLI)   │
                                          │  copies into repo,   │
                                          │  commits, pushes     │
                                          └──────────────────────┘
```

**Workspace folder:** `C:\Users\Ross Livingston\Documents\Claude\Projects\P-10 Racing\`

**Handoff doc:** `HANDOFF_TO_CLAUDE_CODE.md` in the workspace folder. Cowork updates it at end of session. Claude Code reads it at start of next session, appends a "what shipped" note after merging.

## When to use which

| Task | Use |
|---|---|
| Drafting a script, talking through design, reading the live sheet | Cowork |
| Quick one-shot Apps Script patches inside the sheet | Cowork (paste into Extensions → Apps Script) |
| Anything that touches this repo (commit, push, branch, PR) | Claude Code |
| Debugging server-side scripts that hit the Google Sheets API | Either, but Claude Code has direct git access for the fix |

## Revisit when

- Anthropic ships a fix for the Cowork GitHub MCP gap (track [#52549](https://github.com/anthropics/claude-code/issues/52549)). At that point, this whole hybrid pattern can collapse — Cowork can do everything end-to-end.
- We outgrow the workspace-folder handoff (e.g., we want to work on this repo from a different machine or share with a teammate). Then it's worth setting up either Composio managed or a self-hosted MCP.
