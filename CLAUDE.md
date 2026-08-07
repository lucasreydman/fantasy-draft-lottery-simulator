# Fantasy Draft Lottery Simulator — Project Guide

## Architecture

Single-page, no-build, no-dependency web app:
- **No frameworks / no build step / no dependencies** — plain HTML, CSS, vanilla JS.
- **Client-side only** — all state lives in `localStorage`.

## Key files

- **index.html** — static structure: header, league summary, teams, odds, pick ownership, run controls, results, history. Sections are populated by JS.
- **js/lottery.js** — all application logic (see map below).
- **styles/main.css** — design tokens + all styling. Dark "sports arena" theme; semantic z-index scale; reduced-motion fallbacks.
- **.github/workflows/static.yml** — GitHub Pages deploy on push to `main`.
- **docs/audit-2026-07-13.md** — audit findings & overhaul rationale.

## Config object

```js
{
  leagueName: string,
  teamCount: number (4–20),
  teamNames: string[],          // standings order, worst → best; single source of truth for names
  drawnPicks: number,           // decided by lottery draw
  byRecordPicks: number,        // reverse-standings, but in the lottery pool
  lockedPicks: number,          // auto = teamCount - drawnPicks - byRecordPicks (never negative)
  combinations: number[],       // length = drawnPicks + byRecordPicks, sums to 1000
  rounds: number (1–10),
  draftFormat: 'snake' | 'linear',
  odds: number[][],             // odds[team][position] as percentages
}
```

### localStorage keys

- `lotteryLeagueConfig` — the config object.
- `lotteryPickOwnership` — `pickOwnership[round][originalTeamIndex] = ownerIndex | null` (null = self-owned).
- `lotteryHistory` — last 20 runs, each tagged with `league` for per-league filtering.
- Legacy keys from earlier versions are cleared on reset.

## Function map (js/lottery.js)

- `sanitizeConfig(raw)` — validates & **repairs** any config into a coherent one (or null). The app never crashes on bad/old saved data.
- `loadLeagueConfig()` / `saveLeagueConfig()` — persistence; load self-heals a repaired config.
- `computeOdds()` — exact analytical enumeration; falls back to `computeOddsMonteCarlo()` when `oddsExactCost()` exceeds the DP budget (keeps large leagues responsive).
- `generateWeights(n)` — NBA-style descending weights (preset table 2–14, quadratic decline above), always summing to 1000.
- `runLotterySimulation()` — one official weighted draw (NBA discarded-combination redraw rule).
- `createCeremony(precomputed, magicNumber)` — the reveal controller. Owns **all** timers; supports clean `close` (discard) and `skip` (commit + close); reduced-motion aware; resize-robust flexbox podium; commits result exactly once via `finish()`.
- `createTeamInputs()` — inline-editable team names (no confirm gate); persist on change.
- `createPickOwnershipTable()` — self-owned by default; trades highlighted; collapsible editor.
- `getFullDraftOrderData()` / `updateFullDraftOrder()` — snake/linear order honoring traded picks.
- `initApp()` / `safeInitApp()` — render everything; `safeInitApp` shows a recovery panel if init throws.
- `bindStaticControls()` — binds header/run/reset once in `DOMContentLoaded`; Reset is bound **outside** `initApp` so it works even if init fails.

## Design principles

- **Never crash on state** — validate/repair on load; recovery panel as last resort.
- **Runnable immediately** — sensible defaults (self-owned picks) instead of mandatory setup gates.
- **One owner for timers** — the ceremony controller; no orphaned `setTimeout`/`setInterval`.
- **Accessible** — contrast, keyboard, focus management, reduced motion.

## Testing

No build step. Serve statically (`python -m http.server`) and drive with Playwright
(`webapp-testing` skill). Clear `localStorage` to replay first-run. Cover: presets,
wizard, inline edits, trades, magic number, run/skip/close, bad-config recovery,
reduced motion, mobile.

## Deployment

GitHub Pages via Actions on push to `main`. Also deployable to any static host
(e.g. Vercel) — it's a plain static folder with no build.
