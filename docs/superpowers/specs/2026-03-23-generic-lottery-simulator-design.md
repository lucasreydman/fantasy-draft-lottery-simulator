# Fantasy Draft Lottery Simulator — Generic/Customizable Version

**Date:** 2026-03-23
**Status:** Draft

## Context

The existing `fantasy-draft-lottery` repo is a polished NBA-style draft lottery simulator hardcoded for "The People's Dynasty League" (10 teams, specific combinations, specific team names). The goal is to create a new standalone repo (`fantasy-draft-lottery-simulator`) that is a fully customizable version of the same tool — any league can use it by configuring their own setup.

## Approach

**Copy + Refactor.** Copy all files from the existing repo into a new repo, then refactor to replace hardcoded league-specific constants with a config-driven system. Same code style (single HTML/JS/CSS, no build tools, no frameworks).

## What Users Can Customize

1. **League name** — displayed in header, page title, modal title, and download filenames
2. **Number of teams** — any count from 4 to 20
3. **Team names** — free text inputs (no hardcoded dropdown)
4. **Lottery structure** — how many picks are drawn by lottery, assigned by reverse record, or locked by standings
5. **Combinations** — manual input of combination counts per lottery-eligible team (each ≥ 1, must sum to 1000)
6. **Draft rounds** — configurable (1–10), affects pick ownership table

## Setup Wizard

First-time visitors (no localStorage config) see a full-page step-by-step wizard:

1. **League Name** — text input, placeholder "My Fantasy League", max 60 chars
2. **Number of Teams** — number input (min 4, max 20)
3. **Team Names** — dynamic list of text inputs, ordered worst-to-best seed. Each required, no duplicates allowed.
4. **Lottery Structure** — three inputs:
   - Picks drawn by lottery (e.g., 4) — min 1
   - Picks assigned by reverse record (e.g., 2) — min 0
   - Locked picks auto-calculated and displayed (teamCount - drawn - byRecord) — min 0
   - Validation: drawn + byRecord ≤ teamCount; drawn ≥ 1
5. **Combinations** — for each lottery-eligible team (drawnPicks + byRecordPicks count), number input for combination count. Running total shown; must sum to 1000. Each value must be ≥ 1 (integer only). Helper text explains that by-record teams need combinations because they participate in the lottery pool — if a by-record team's number is drawn, they jump up into a drawn pick slot.
6. **Draft Rounds** — number input (min 1, max 10, default 3)

**Navigation:** Users can go back to any previous step. Step data is preserved when navigating backward.

**Completion:** Config saved to localStorage. Main lottery page loads.

**Reconfigure:** "Reconfigure League" button in header re-enters wizard **pre-filled with current config values** so users can edit rather than start from scratch. Saving a reconfigured league clears team lock state, pick ownership, and lottery results from localStorage.

## Config Object

```javascript
const leagueConfig = {
  leagueName: "My Fantasy League",
  teamCount: 10,
  teamNames: ["Team A", "Team B", ...],  // length = teamCount, worst-to-best
  drawnPicks: 4,
  byRecordPicks: 2,
  lockedPicks: 4,           // computed: teamCount - drawnPicks - byRecordPicks
  combinations: [224, ...], // length = drawnPicks + byRecordPicks (lottery-eligible teams only)
  rounds: 3,
  odds: [[...], ...],       // computed analytically — see Odds section
};
```

**localStorage keys:**
- `lotteryLeagueConfig` — the full config JSON (including computed odds)
- `lotteryTeamNames` — saved team name assignments (runtime, separate from config defaults)
- `lotteryTeamsLocked` — boolean string (runtime state)
- `lotteryPickOwnershipLocked` — boolean string (runtime state)
- `lotteryPickOwnership` — rounds × teamCount ownership array (runtime state)

Config keys store league setup. Runtime keys store session state (same pattern as existing app). Old localStorage keys from the original app are ignored (new repo, clean slate).

## Analytical Odds Calculation

Exact probability computation using recursive conditional probability.

**Algorithm (`computeOdds(combinations, drawnPicks)`):**

```
Input: combinations[] (length = lotteryEligibleTeams), drawnPicks (int)
Output: odds[][] (lotteryEligibleTeams × lotteryEligibleTeams matrix)

The matrix is lotteryEligibleTeams × lotteryEligibleTeams (not just drawnPicks columns)
because by-record teams also have probability distributions across their possible landing spots.

function computeOdds(combinations, drawnPicks):
  totalAssigned = sum(combinations)  // must be 1000
  // NOTE: Use 1000 (ASSIGNED) as denominator, NOT 1001 (TOTAL_POOL).
  // The 1001st "discarded" combo always triggers a redraw, so it has
  // zero probability of selecting any team and is irrelevant to odds.
  lotteryTeamCount = combinations.length

  // odds[team][position] = probability team lands in that position
  // Positions 0..drawnPicks-1 are lottery-drawn
  // Positions drawnPicks..lotteryTeamCount-1 are by-record

  // Use recursive state enumeration:
  // State = set of teams already drawn in picks 0..k-1
  // For each state at pick k, compute:
  //   P(team i drawn at pick k | state) = combinations[i] / (totalAssigned - sum of drawn teams' combos)

  // For by-record positions: after all drawn picks, remaining lottery teams
  // are sorted by original index (worst seed first = ascending index).
  // Their probabilities at by-record positions are deterministic given
  // which teams were drawn.

  // Implementation: enumerate all possible sets of drawn teams (up to
  // C(lotteryTeamCount, drawnPicks) final states) with their probabilities.
  // For each final state, the by-record assignments are deterministic.

  // Performance: max C(20, 20) = 1 state at worst case. Realistic worst
  // case ~C(20, 10) = 184,756 states. Instant in-browser.
```

Result cached in `leagueConfig.odds` and persisted to localStorage with the config.

## Changes to lottery.js

### Removed Constants
- `TEAM_NAME_OPTIONS` — replaced by free text inputs
- `DEFAULT_TEAM_ASSIGNMENTS` — replaced by config team names
- `TEAM_LABELS` — generated dynamically by `generateTeamLabels()`
- `COMBINATIONS` — replaced by `leagueConfig.combinations` (padded with zeros for locked teams at runtime)
- `odds` — replaced by `leagueConfig.odds` (computed)
- `TOTAL_POOL`, `ASSIGNED` — stay as constants (1001, 1000)

### Modified Functions
- **`createTeamInputs()`** — generates `teamCount` free text `<input>` fields (not `<select>` dropdowns), pre-filled from config
- **`refreshOddsTableBody()`** — dynamic columns (one per pick position for lottery-eligible teams), dynamic rows. Only shows lottery-eligible teams (no rows for locked teams). Also generates `<thead>` dynamically (remove static thead from HTML). Update table caption to describe computed odds.
- **`createPickOwnershipTable()`** — `rounds × teamCount` grid
- **`runQuickLottery()`** — parameterized: draw `drawnPicks` picks, assign `byRecordPicks` by reverse record, append `lockedPicks` locked teams. At lottery init, build full-length `currentChances` by spreading `leagueConfig.combinations` and appending zeros for locked teams.
- **`analyzeLotteryJumps()`** — replace hardcoded `TOP_FOUR_SEED_MAX = 3` with `drawnPicks - 1`. Replace `index < 4` checks with `index < drawnPicks`. Replace `index === 4 || index === 5` with `index >= drawnPicks && index < drawnPicks + byRecordPicks`.
- **`runLottery()` / reveal functions** — see "Reveal Animation Scaling" section below
- **`updateFullDraftOrder()`** — dynamic round count
- **`getFullDraftOrderData()`** — dynamic round/team count
- **`downloadFullDraftOrder()`** / **`downloadOriginalTop10()`** — adapt to variable sizes. Include league name in filenames: `{sanitizedLeagueName}-draft-order-full.txt` (sanitize: lowercase, replace spaces/special chars with hyphens)
- **`validateTeamSelections()`** — validate `teamCount` inputs, uniqueness

### New Functions
- **`showSetupWizard()`** — renders wizard UI, handles step navigation (forward and back)
- **`saveLeagueConfig(config)`** — validates and persists config to localStorage
- **`loadLeagueConfig()`** — loads config from localStorage, returns null if none
- **`computeOdds(combinations, drawnPicks)`** — analytical odds calculation (see algorithm above)
- **`generateTeamLabels(teamCount)`** — creates seed labels dynamically. Array index 0 = worst seed (highest number), last index = best (Champion). Top 3 get special labels: "Champion", "2nd Place", "3rd Place" (if teamCount ≥ 3). Rest get "Nth Seed" descending.

### Unchanged
- Toast system, `showToast()`
- `safeSetItem()` localStorage wrapper
- Animation/timing constants
- Magic number system (carries over exactly as-is)
- Focus trap, accessibility patterns

## Reveal Animation Scaling

The current reveal has three phases hardcoded for a 4-drawn/2-by-record/4-locked structure. Here's how each phase adapts:

### Phase 1: Quick Iterations (magic number > 1)
- Currently shows top 3 (gold/silver/bronze podium) for preview iterations
- **Adapted:** show `min(drawnPicks, 3)` positions on quick podium. If drawnPicks < 3, show fewer.

### Phase 2: Automatic Picks (bottom-up reveal)
- Currently reveals picks 10 through 5 (lockedPicks + byRecordPicks, counting down)
- **Adapted:** reveals picks `teamCount` through `drawnPicks + 1`. Count = `lockedPicks + byRecordPicks`. If this is 0 (all picks drawn), skip this phase entirely.

### Phase 3: Top Picks Podium (dramatic reveal)
- Currently reveals picks 4 through 1 with podium positions `pos-1` through `pos-4`
- **Adapted:** reveals picks `drawnPicks` through 1.
- **Podium scaling:**
  - 1 drawn pick: single centered reveal, no podium layout (just a hero card)
  - 2 drawn picks: side-by-side, 1st taller than 2nd
  - 3 drawn picks: standard gold/silver/bronze podium
  - 4-6 drawn picks: podium with proportionally scaled heights (current approach extends naturally)
  - 7+ drawn picks: cap podium at top 6, reveal remaining drawn picks in the automatic-picks style before the podium phase
- **CSS:** Generate `pos-N` and `place-N` classes dynamically via CSS custom properties or inline styles. Heights: `place-1` = tallest, each subsequent = `tallest × (1 - 0.1 × (position - 1))`, with a floor.

### Reveal order within podium
- Current order: [4th, 3rd, 2nd, 1st] (worst to best)
- **Adapted:** reveal from position `drawnPicks` (or 6 if capped) down to 1

## Changes to index.html

- **Title:** set dynamically from `leagueConfig.leagueName`
- **Header:** generic default text ("Fantasy Draft Lottery"), updated from config on load. JS also sets modal title from config.
- **Add wizard container:** `<div id="setupWizard" class="wizard-overlay">` (hidden when config exists)
- **Add reconfigure button** in header (gear icon)
- **Odds table:** remove static `<thead>` — generated dynamically by JS. Update caption text.
- **Remove all "People's Dynasty League" references**

## Changes to styles/main.css

- **Add wizard styles:** full-page overlay, step cards, navigation buttons, progress indicator (step dots), input styling
- **Dynamic grids:** use CSS custom properties `--team-count`, `--round-count` set by JS on body/container
- **Team inputs grid:** adapt from 4-col to `auto-fill, minmax(200px, 1fr)` for any team count
- **Podium:** generate heights proportionally. Use `calc()` with CSS custom property `--podium-count`. Cap visual podium at 6 positions.
- **Odds table caption:** style for computed-odds description
- **Minimal other changes** — keep existing design tokens, dark theme, responsive breakpoints, all @keyframes

## File Structure

```
c:\Users\lucas\dev\fantasy-draft-lottery-simulator\
├── index.html
├── js/lottery.js
├── styles/main.css
├── images/favicon.png
├── .github/workflows/static.yml
├── README.md               # new, describes the generic tool
├── CLAUDE.md               # new, project instructions for this repo
├── LICENSE
└── .gitignore
```

## Deployment

- New GitHub repo: `fantasy-draft-lottery-simulator`
- Same GitHub Actions workflow (`static.yml`) for GitHub Pages deployment
- Deploy on push to `main`

## Verification

1. **Wizard flow:** Open in browser with empty localStorage → wizard appears → complete all steps → main page loads with configured league. Test back navigation in wizard.
2. **Odds accuracy:** Configure with original 10-team setup (combinations [224,224,224,224,60,45]) → computed odds should match the hardcoded odds table from the original repo within 0.1%
3. **Lottery draw:** Run lottery with various configs (4, 6, 8, 10, 12, 20 teams) → correct number of drawn/record/locked picks
4. **Edge cases:** Test all-drawn (drawnPicks = teamCount), single drawn pick, 0 by-record picks, equal combinations (e.g., 4×250)
5. **Pick ownership:** Verify table renders correct rounds × teams, trades persist
6. **Exports:** Download draft order → correct format with variable team/round counts, league name in filename
7. **Reconfigure:** Click reconfigure → wizard pre-filled with current config → change values → save → main page updates, old runtime state cleared
8. **Responsive:** Test on mobile viewport sizes with various team counts
9. **Accessibility:** Tab through wizard and main page, verify focus management
10. **Reveal animation:** Verify podium scales correctly for 1, 3, 4, 6, 8 drawn picks
