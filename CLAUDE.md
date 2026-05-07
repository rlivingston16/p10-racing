# P10 Racing — Claude Code Instructions

Personal F1 fantasy league side project, owned by Ross's `snowtop@gmail.com`. **Not a Pacific Surfacing project** — keep all infrastructure (GCP projects, service accounts, OAuth clients) on personal accounts. Do not mix in PS-tagged credentials.

## Architecture in one line

The Google Sheet IS the database. This repo is (a) the player-facing website at p10-racing.com and (b) admin scripts that talk to the Sheet's API. No SQL, no local storage. Sheet ID: `1T__0CvsUq5Asq0-raVzxiXXvadfctATZwS7ANA-GQXo`.

## Key files

- **`PROJECT.md`** — full architecture, scoring rules, tab layouts, operational runbook. Read this when context needed.
- **`WORKFLOW.md`** — Cowork-Claude vs Claude-Code split, why the hybrid handoff exists. Default to Claude Code for repo work; Cowork is only useful for sheet-only Apps Script patches and SaaS connector reads.
- **`server.js`** — Express on port 3000. Thin pass-through to Sheets API. Hardcoded PLAYERS / DRIVERS arrays may drift from the sheet — flag if you spot it.
- **`lib/auth.js`** — credential resolver. Prefers service account, falls back to OAuth.
- **`sheet-tools/`** — admin scripts. Run with `node sheet-tools/<name>.js`.

## Authentication

- Service account JSON at `credentials/service-account.json` (gitignored).
- Service account email: `p10-sheets-bot@p10-racing-495619.iam.gserviceaccount.com`. Editor on the live Sheet AND on all 4 protected ranges (Picks, Scores, Results, Leaderboard).
- For OAuth-as-owner ops (e.g. `grant_editor.js` to add new editors to protected ranges), need both `client_secret_*.json` AND `token.json`. The client_secret lives at `~/Documents/NocBot/`; token.json hasn't been generated on this desktop yet — would require a one-time OAuth consent flow as snowtop@gmail.com.

## Critical safety

- **`build_p10.js` wipes the live Sheet** on every run. Banner comment warns. Use only for fresh-build / off-season scaffolding.
- For mid-season fixes, write a targeted patcher (e.g. `patch_v3_all_drivers.js`). Idempotent, only rewrites specific cells.
- Test new scripts against a duplicate sheet (File → Make a copy) before pointing at production.
- Sheet's General Access is "Anyone with the link can edit" so player dropdowns work — repo is private to limit URL discovery.

## Current sheet state

- 22 races today; will go to 24 when 2 mid-season replacement races get added (war overseas dropped Bahrain/Saudi Arabia).
- v3 scoring (as of 2026-05-07): P1-P22 in F1 table order including DNFs/DNS; First DNF in AA; hidden DNFs (AB) and DNS (AC) helper lists; DNF/DNS picks score 0 via SPLIT-MATCH check.
- Sprint races to be folded in this season — design TBD (separate rows vs columns within main-race rows).

## Conventions

- Branch naming: `fix/...` for bugs, `feat/...` for additions.
- Commits: descriptive subject + body explaining the *why*. No tag prefixes.
- Default branch: `master`. Direct merge after verification is fine for non-trivial changes; PRs aren't required (personal repo).
- After a session: ideally append a "Shipped today" note to `STATUS.md` (not yet created — establish on next non-trivial work session).

## When starting a session here

- This file auto-loads.
- Read `STATUS.md` if present (in-flight state from previous session).
- Check `~/Documents/Claude/Projects/P-10 Racing/HANDOFF_TO_CLAUDE_CODE.md` for any Cowork-Claude handoff notes.
- For "what's been recently committed": `git log --oneline -10` on master.
