# P10 Racing — Project Reference

A Formula One pick-em tournament. Players pick three drivers per race (P10 / P2 / first DNF). Whoever predicts P10 best wins the most points — hence the name.

This document is the single source of truth for any Claude session working on this project. It mirrors the contents pasted into the **F1 P-10 Tournament** Project on claude.ai (Custom Instructions). When that and this file disagree, this file wins.

---

## Quick links

- **Live site:** https://www.p10-racing.com
- **GitHub repo:** https://github.com/rlivingston16/p10-racing
- **Google Sheet (live data):** https://docs.google.com/spreadsheets/d/1T__0CvsUq5Asq0-raVzxiXXvadfctATZwS7ANA-GQXo
- **Owner:** snowtop@gmail.com
- **Server:** runs on a Windows machine at `C:\Users\Worm\Documents\NocBot\p10app\`

## Tournament structure

- **22 players** (full list in `server.js` and `sheet-tools/build_p10.js` under `PLAYERS`).
- **24 races** in the F1 2026 calendar (Australia → Abu Dhabi). Race table in `sheet-tools/build_p10.js` under `RACES`.
- **Buy-in:** $2,200 total pot.
- **Per race, each player picks 3 drivers:**
  1. **P10** — who will finish 10th
  2. **P2** — who will finish 2nd
  3. **First DNF** — first driver to retire (or "NO DNF")
- **Scoring** by finishing position of the picked driver. The point array is:

  ```
  P1=1, P2=2, P3=4, P4=6, P5=8, P6=10, P7=12, P8=15, P9=18, P10=25,
  P11=18, P12=15, P13=12, P14=10, P15=8, P16=6, P17=4, P18=2, P19=1, P20=1
  ```

  P10 gets the most points (25); accuracy decays away from P10 in either direction. First-DNF pick adds a bonus when correct.

## Architecture

```
   ┌─────────────────────────┐         ┌───────────────────────────┐
   │  p10-racing.com         │  reads/writes  │  Google Sheet           │
   │  (Express, port 3000)   │ ──────────────▶│  1T__0Cvs...GQXo        │
   │  served from p10app/    │                │  (Results / Picks /     │
   └─────────────┬───────────┘                │   Scores / Leaderboard) │
                 │                            └─────────────▲───────────┘
                 │                                          │
                 │                                          │
   ┌─────────────▼─────────────┐         ┌──────────────────┴──────────┐
   │  Players (browser)        │         │  sheet-tools/ scripts        │
   │  - submit picks           │         │  - rebuild / sync / lock /   │
   │  - view standings         │         │    fetch race results        │
   └───────────────────────────┘         └──────────────────────────────┘
```

The Google Sheet **is the database.** No SQL / no local storage. Server and scripts both go through the Sheets API.

## Google Sheet — tab layout

Sheet ID: `1T__0CvsUq5Asq0-raVzxiXXvadfctATZwS7ANA-GQXo`

| Tab | What's in it |
|---|---|
| **Results** | Row per race. Cols: Round, Name, Date, URL (formula1.com page), P1–P20 driver names, First DNF. Actual race results land here weekly via `f1_auto_results.js`. |
| **Picks** | 22 players × 24 races, vertical layout. Each race is a 25-row block; rows 3–24 are player rows, columns B/C/D are P10/P2/DNF picks. The website's POST /api/picks writes here. |
| **Scores** | Calculated. Per race per player: P10 points, bonus (DNF), payout. |
| **Leaderboard** | Ranked standings + pot tracker (`B27:C35`). $2,200 buy-in distributed across positions. |

## The website (`p10app/server.js`)

- **Stack:** Node + Express, `cors`, `googleapis`, `nodemailer`.
- **Port:** 3000 (override with `PORT` env var).
- **Auth:** every `/api/*` route requires header `x-app-code: 2026`. Set via env var `APP_CODE`.
- **Static frontend:** served from `p10app/public/`.
- **Routes:**
  - `GET /api/leaderboard` — ranked standings
  - `GET /api/scores`
  - `GET /api/results`
  - `GET /api/picks/:round`
  - `GET /api/pot`
  - `GET /api/races` — race list + next-round detection + drivers + players
  - `POST /api/picks` — submit picks for a player + round
- **Run locally:** `cd p10app && npm install && node server.js`

### Credentials lookup (server)

`server.js` reads OAuth credentials from the parent directory by default (legacy layout where credentials live one level up at `NocBot/`). The newer `lib/auth.js` helper used by `sheet-tools/` is more flexible — see below.

## `sheet-tools/` — operational scripts

All scripts use `require('../lib/auth')` for credentials. They share one search-path helper that looks in this order:

1. `GOOGLE_CREDS` + `GOOGLE_TOKEN` env vars (preferred for production / containers).
2. `p10app/credentials/client_secret_*.json` + `token.json`.
3. `p10app/client_secret_*.json` + `token.json`.
4. `NocBot/client_secret_*.json` + `token.json` (legacy; how it currently works on the live server).

| Script | When to run | What it does |
|---|---|---|
| `f1_auto_results.js` | Mondays after a race | Fetches the F1 2026 results page from formula1.com, extracts URLs for completed races, updates the Results tab. |
| `tally_results.js` | After updating Results | Reads finishing positions, scores each player's picks. **⚠ See Known issues — currently targets a different sheet ID.** |
| `build_p10.js` | Once per season (or for a full rebuild) | Rebuilds all four tabs (Leaderboard, Picks, Results, Scores) with formulas, formatting, and pot data. Constant `BUY_IN = 2200`. |
| `update_races.js` | When the F1 calendar changes | Updates race names/dates on the Results tab. |
| `sync_drivers.js` | Weekly during the season | Scrapes the F1 drivers page, refreshes dropdown validation on the Picks tab so mid-season replacements are pickable. |
| `rebuild_picks_vertical.js` | Targeted rebuild of Picks tab | Useful if Picks tab gets corrupted. |
| `rebuild_scores_only.js` | Targeted rebuild of Scores tab | Useful if Scores formulas need to be reset. |
| `lock_sheets.js` | After Picks lock per race | Locks all tabs except player pick cells; only `snowtop@gmail.com` can edit protected ranges. |
| `reset_picks.js` | Start of season / clearing | Clears all pick cells. Destructive — confirm before running. |

## `fix_*.js` scripts (committed to repo)

The seven `fix_*.js` files at `p10app/` root (`fix_auth.js`, `fix_clear_picks.js`, `fix_mobile.js`, `fix_mobile2.js`, `fix_mobile3.js`, `fix_payout.js`, `fix_picks_auth.js`, `fix_pot_style.js`) are historical one-off patches. Read before running; many are not idempotent.

## Email scripts — *not in this repo*

`send_picks_reminder.js` and `qualifying_check.js` (sends a reminder ~4 hours after qualifying) live on the server only. They contain the Gmail App Password for `snowtop@gmail.com` and are deliberately gitignored.

**On desktop/laptop, do NOT recreate these scripts.** Send picks reminders by asking Claude directly to draft + send via the Gmail MCP connector. Claude already has Gmail access on those machines.

## Credentials setup (when starting on a new machine)

For Claude chat alone (no script execution), nothing is needed — the GitHub connector reads the repo and the Project's custom instructions cover the rest.

To run the server or any sheet-tool locally, you need:

1. The Google OAuth client secret JSON (`client_secret_*.json`) — from Google Cloud Console, OAuth 2.0 Client ID, Desktop type. Copy from the live server.
2. A `token.json` produced by an OAuth consent run for that client ID, with `https://www.googleapis.com/auth/spreadsheets` scope.

Place both under `p10app/credentials/` (gitignored). The server and all `sheet-tools/` scripts will pick them up automatically.

## Operational runbook

**Sunday (race day)** — players submit picks via the website until lock time.
**After Picks lock** — run `node sheet-tools/lock_sheets.js`.
**Monday morning** — `node sheet-tools/f1_auto_results.js` to pull URLs, then verify Results tab populated correctly. Tally + leaderboard update from formulas.
**Mid-season driver swap** — `node sheet-tools/sync_drivers.js`.
**End of season** — celebrate, screenshot Leaderboard, distribute pot.

## Known issues / quirks

- **Sheet ID drift in `tally_results.js`** — references `1YkH5FIIwmE_LiMsLrOpiyxaoO1juZh9Bt5M7xfcQ7ok`, not the live sheet. May be a leftover from development. Update before relying on it.
- **Player name inconsistencies** between scripts (`Elesa Cooperson` vs `Elesa Livingston`, `Tedders Livingston` present/absent). Real-world cause: name change. The `rename_elesa.js` script in `NocBot/` was the patch. If a player rename is needed again, do it sheet-side and update `PLAYERS` constants in `server.js` + `sheet-tools/build_p10.js`.
- **`server.js` credentials path differs from `sheet-tools/` credentials path.** Server expects creds at `../` (i.e. `NocBot/`); sheet-tools uses the flexible search via `lib/auth.js`. To unify, point server at `lib/auth.js` too — left as future work, low priority while the current layout works.

## Repo notes

- Remote: `https://github.com/rlivingston16/p10-racing.git` (no embedded token — use `gh auth login` or Windows Credential Manager).
- Branch: `master`.
- Original GitHub PAT was rotated as part of this migration (see `migration-notes/2026-05-02-cross-device.md` if you create one).

## Migration: how this project came to be portable

Originally the project lived on one Windows server, scripts scattered across `NocBot/` with absolute Windows paths. A homebrew Claude-like system called **OpenClaw** (`C:\Users\Worm\.openclaw\`, auto-launched at logon) coordinated cron jobs and email reminders.

The migration consolidated:

- All load-bearing helper scripts moved into `p10app/sheet-tools/`, refactored to use `lib/auth.js` for credentials so they're not pinned to one machine.
- `PROJECT.md` (this file) added so any Claude session has full context.
- `.gitignore` expanded to keep credentials, sent-flag state, and Gmail-password-bearing scripts out of the repo.
- GitHub PAT rotated; remote URL cleaned.
- A **claude.ai Project** named "F1 P-10 Tournament" was created with this file's contents as Custom Instructions and the GitHub connector wired to this repo. That's how desktop/laptop Claude sessions immediately have full context without anything local installed.

OpenClaw is **not** part of the canonical setup going forward. The server still runs the website (hostname maps to `https://www.p10-racing.com`), but tournament administration shifts to "ask Claude on any device" — Claude reads the repo via GitHub connector and sends emails via the Gmail connector.
