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
- Sheet's General Access is "Anyone with the link can edit" so player dropdowns work. **Repo is PUBLIC** (verified via GitHub API 2026-06-05) — the "2026" lockscreen passcode in `public/index.html` is what gates picks, not URL obscurity. **Never commit personal email addresses, phone numbers, or anything else you wouldn't post on GitHub directly.**

## Current sheet state

- **24 races as of 2026-06-08**: 22 GPs + 2 sprints (Great Britain Sprint 7/4, Singapore Sprint 10/10). Bahrain + Saudi Arabia were dropped due to war overseas; the 2 sprints fill those slots.
- v3 scoring (as of 2026-05-07): P1-P22 in F1 table order including DNFs/DNS; First DNF in AA; hidden DNFs (AB) and DNS (AC) helper lists; DNF/DNS picks score 0 via SPLIT-MATCH check.
- **Sprint convention** (added 2026-06-08, see `sheet-tools/migrate_add_sprints.js`):
  - Sprint races score identically to main races (same P10/P2/DNF picks, same payout array).
  - **Sprints get no Round number** — `Results!A` is blank for sprint rows; only the 22 GPs are numbered 1-22.
  - Race name in `Results!B` uses the `(Sprint)` suffix, e.g., `Great Britain (Sprint)`.
  - Picks-tab race header is plain `{Race Name} — Race Day: {date}` for sprints (no `Round N` prefix). GP race headers keep `Round N — {Name} — Race Day: {date}`.
  - Scores-tab row-2 label is plain `{Race Name}` for sprints (no `Rn -` prefix).
  - Sprint URLs use F1's `/sprint-result` path (vs `/race-result` for main races). Same `{id}/{slug}` as the main race weekend. `f1_auto_results.js` handles both URL patterns and matches by race name.

## Conventions

- Branch naming: `fix/...` for bugs, `feat/...` for additions.
- Commits: descriptive subject + body explaining the *why*. No tag prefixes.
- Default branch: `master`. Direct merge after verification is fine for non-trivial changes; PRs aren't required (personal repo).
- After a session: ideally append a "Shipped today" note to `STATUS.md` (not yet created — establish on next non-trivial work session).

## Race-weekend email — formatting & style

Ross sends a "Picks Due" email after Saturday qualifying. The MCP-connected Gmail account is `ross@pacificsurfacing.com`, but the league sees mail from `snowtop@gmail.com` — so **draft into PS Gmail with `To: snowtop@gmail.com` only** (single recipient, just routes it to his snowtop inbox), then he forwards from snowtop to the league using his existing contact group. Never put league addresses anywhere in this repo or in memory.

**Standings data:** run `node sheet-tools/read_standings.js` — it pulls season totals (BP=points, BQ=$) from the Scores tab, sorts desc by points, assigns competition ranks (ties share rank).

### Subject

`🚨 P10 Picks Due — [Race] GP` — the red siren prefix is part of the style.

### Body — structural recipe

1. **Banner** (full-width, no max-width on the outer wrapper):
   - Black bar (`#000000`) with red **P10** (`#e30613`) + white **RACING** (letter-spacing for the airy look), small red 🏎️ right-aligned.
   - Thin 4px red strip (`#e30613`) directly under the bar.
2. **Bold opener:** `Hey Racers,`
3. **One-line context:** "Qualifying for the **[Race] GP** just wrapped. You've got until lights out to lock in your P10 pick."
4. **Three links in this exact order, each with its emoji prefix:**
   - 🏁 `Qualifying Results: formula1.com` → `https://www.formula1.com/en/results/{year}/races/{id}/{slug}/qualifying`
   - 👆 `Web App: p10-racing.com` (passcode **2026**) — always include the passcode parenthetical.
   - 📊 `Google Sheet: P10 Picks` → the live sheet URL.
   - Link styling: bold, underlined, color `#c8102e`.
5. **`Current Standings`** header + 2px red underline strip (`#c8102e`) + 4-column table (rank · name · points bold · $-won, gray `#bbb` for `$0`, darker gray `#888` for `$10+`).
6. **Sign-off:** `Good luck! 🏎️`

### Gmail HTML rendering gotchas

Gmail aggressively sanitizes layout CSS, so:
- **Use `bgcolor="#000000"` and `bgcolor="#e30613"` as HTML attributes** on `<table>`/`<td>` — Gmail strips `style="background:..."` from layout elements, which silently leaves white "RACING" text on a default white background (invisible) and no red strip.
- **Belt and suspenders:** include both the `bgcolor=""` attribute AND the inline `style="background-color:..."`.
- **No `<!DOCTYPE>`, no `<html>`, no `<body>` wrappers** — Gmail strips them anyway.
- **No `max-width` on the outer wrapper.** Ross wants the banner to flow the full width of the reading pane, not sit in a centered "small box".

## When starting a session here

- This file auto-loads.
- Read `STATUS.md` if present (in-flight state from previous session).
- Check `~/Documents/Claude/Projects/P-10 Racing/HANDOFF_TO_CLAUDE_CODE.md` for any Cowork-Claude handoff notes.
- For "what's been recently committed": `git log --oneline -10` on master.
