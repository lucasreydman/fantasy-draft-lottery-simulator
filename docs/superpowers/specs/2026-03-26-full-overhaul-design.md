# Fantasy Draft Lottery Simulator — Full Overhaul Design Spec
**Date:** 2026-03-26
**Scope:** Complete feature audit, bug fixes, and new feature additions
**Constraint:** Single-file no-build architecture (index.html + js/lottery.js + styles/main.css), pure vanilla JS, no dependencies

---

## Context

The simulator has a solid foundation: a 6-step setup wizard, recursive odds computation, pick ownership trades, a full-screen lottery reveal with staged animations, and localStorage persistence. However, a full audit reveals critical bugs, missing quality-of-life features that every serious commissioner needs, and several opportunities to make the reveal experience dramatically more engaging. Research into competing tools and community feedback confirms the highest-value gaps are: snake draft support, odds visualization, config sharing, auto-generated combinations, lottery history, and several broken CSS variables that make the wizard visually incorrect.

**Note on naming:** CLAUDE.md documents `leagueConfig` using stale field names (`drawnPickCount`, `byRecordPickCount`, `lockedPickCount`, `draftRounds`). The live codebase uses `drawnPicks`, `byRecordPicks`, `lockedPicks`, and `rounds`. This spec uses the live codebase names throughout.

---

## 1. Critical Bug Fixes

### 1a. Undefined CSS Variables in Wizard (Breaking)
The wizard CSS section (lines ~1508–1762 of `main.css`) references variables never defined in `:root`:
`--bg-primary`, `--bg-secondary`, `--border-color`, `--text-primary`, `--text-secondary`, `--primary`, `--primary-glow`, `--success`, `--danger`, `--font-mono`

**Fix:** Add all missing aliases to `:root` in `main.css` mapping them to existing design tokens:
```css
--bg-primary: #0F172A;
--bg-secondary: #1E293B;
--border-color: #334155;
--text-primary: #F8FAFC;
--text-secondary: #94A3B8;
--primary: #3B82F6;
--primary-glow: rgba(59, 130, 246, 0.35);
--success: #22C55E;
--danger: #EF4444;
--font-mono: 'JetBrains Mono', 'Courier New', monospace;
```

### 1b. Pick Ownership Null Validation
User can lock pick ownership with unassigned (null) picks, causing silent undefined behavior in draft order generation.

**Fix:** In `lockPickOwnership()` in `lottery.js`, before locking, iterate all rounds and pick slots. If any value is `null` or `undefined`, call `showToast('All picks must be assigned before locking.', 'error')` and return early.

### 1c. Pick Ownership Stale Indices on Team Re-edit
Unlocking teams and renaming/reordering does not reset pick ownership, leaving stale team-index references.

**Fix:** In `unlockTeams()` in `lottery.js`, after calling `saveTeamLockState(false)`, also call `localStorage.removeItem(LS_KEY_PICK_OWNERSHIP)` and reset `pickOwnership` to a fresh default (same initial structure that `initStateFromConfig()` produces).

### 1d. Accessibility — Missing ARIA Labels
Close button in fullscreen modal has no `aria-label`. `#reconfigureBtn` uses a bare gear symbol with no accessible name.

**Fix:** Confirm the close button in `runLottery()` — if `aria-label="Close lottery results"` is not already set, add it. Add `aria-label="Reconfigure league settings"` to `#reconfigureBtn` in `index.html`.

---

## 2. New Feature: Snake Draft Support

### What
Add a **Draft Format** selector as a new step in the setup wizard. Options: "Snake" (default) or "Linear".

### Wizard Step Numbering
The wizard currently has 6 steps (indices 0–5). Adding Draft Format as step 5 shifts Draft Rounds to step 6, making 7 steps total:
- Step 0: League Name
- Step 1: Team Count
- Step 2: Team Names
- Step 3: Lottery Structure (+ Floor Picks from §11)
- Step 4: Combinations
- **Step 5 (new): Draft Format**
- Step 6: Draft Rounds (was step 5)

Update `totalSteps` constant (currently `6`) to `7`.

Update `validateStep()` switch:
- Add `case 5:` for Draft Format validation (always valid — no user input to validate beyond selection)
- Change current `case 5:` (Draft Rounds) to `case 6:`

Update the wizard progress dots to reflect 7 steps.

### Config
Add `draftFormat: 'snake' | 'linear'` to `leagueConfig`. Default: `'snake'`. Set default in `loadLeagueConfig()`.

### Snake Logic in `getFullDraftOrderData()`
The existing loop structure is:
```javascript
for (let round = 0; round < leagueConfig.rounds; round++) {
  for (let pick = 0; pick < leagueConfig.teamCount; pick++) {
    // look up pickOwnership[round][originalTeamAtPosition]
  }
}
```
For snake format, even-numbered rounds (1-indexed rounds 2, 4, 6…) are in reverse pick order. In the 0-indexed loop, this is `round % 2 === 1`. Apply reversal by iterating `pick` from `teamCount - 1` down to `0`:

```javascript
for (let round = 0; round < leagueConfig.rounds; round++) {
  const isReversed = leagueConfig.draftFormat === 'snake' && round % 2 === 1;
  const pickIndices = isReversed
    ? Array.from({ length: leagueConfig.teamCount }, (_, i) => leagueConfig.teamCount - 1 - i)
    : Array.from({ length: leagueConfig.teamCount }, (_, i) => i);
  for (const pick of pickIndices) {
    // existing lookup: pickOwnership[round][pick] gives the owning team index
  }
}
```
The `pickOwnership[round][pick]` lookup is unchanged — only the iteration order reverses, so pick slot 9 in round 2 of a 10-team league becomes the first pick of that round when reversed.

### UI Updates
- `updateFullDraftOrder()`: show "Snake Draft" or "Linear Draft" label next to section heading
- Both download functions: include format in output header line

---

## 3. New Feature: Odds Table Heatmap

### What
Color-code each odds table cell as a visual heatmap. Higher probability = deeper blue fill.

### How
In `refreshOddsTableBody()` in `lottery.js`, for each `<td>` cell containing a percentage value `v`:
```javascript
const intensity = Math.sqrt(v / 100); // perceptual scaling
td.style.background = `rgba(59, 130, 246, ${(intensity * 0.55).toFixed(3)})`;
```
Do not change text color — the existing light text is adequate contrast on this dark-themed app at all intensity levels.

---

## 4. New Feature: Auto-Generate Combinations

### What
An **"Auto-Generate"** button on wizard Step 4 (Combinations) that auto-fills NBA-style weighted values.

**Guard:** Only render/show this button when `lotteryEligible >= 2` (where `lotteryEligible = drawnPicks + byRecordPicks`). Hide it when `lotteryEligible < 2`.

### Preset Tables (each sums to exactly 1000):
```javascript
const NBA_WEIGHT_PRESETS = {
  2:  [600, 400],
  3:  [500, 300, 200],
  4:  [450, 250, 185, 115],
  5:  [400, 220, 175, 130, 75],
  6:  [360, 200, 165, 130, 95, 50],
  7:  [310, 185, 160, 130, 100, 70, 45],
  8:  [280, 175, 155, 130, 105, 75, 50, 30],
  9:  [250, 165, 150, 130, 110, 80, 55, 35, 25],
  10: [220, 155, 145, 130, 115, 90, 65, 45, 25, 10],
  11: [200, 145, 140, 125, 110, 90, 70, 55, 35, 20, 10],
  12: [185, 135, 130, 120, 110, 90, 75, 60, 45, 30, 15, 5],
  13: [170, 125, 120, 115, 105, 90, 80, 65, 55, 40, 20, 10, 5],
  14: [140, 135, 130, 120, 105, 90, 75, 60, 50, 35, 25, 15, 10, 10],
};
```

### `generateWeights(n)` function for n > 14:
Interpolate linearly between the 14-team preset and a flat `1000/n` distribution:
```javascript
function generateWeights(n) {
  if (NBA_WEIGHT_PRESETS[n]) return [...NBA_WEIGHT_PRESETS[n]];
  const base = NBA_WEIGHT_PRESETS[14];
  const t = (n - 14) / (20 - 14); // 0 at n=14, 1 at n=20
  let weights = Array.from({ length: n }, (_, i) => {
    // Teams beyond the 14-slot preset inherit the last preset value (10) as their base
    const baseVal = i < base.length ? base[i] : base[base.length - 1];
    const flatVal = Math.floor(1000 / n);
    return Math.round(baseVal * (1 - t) + flatVal * t);
  });
  const diff = 1000 - weights.reduce((a, b) => a + b, 0);
  weights[0] += diff; // adjust worst team's slot to hit exactly 1000
  return weights;
}
```

After auto-fill, show a note beneath the inputs: "Based on NBA-style weighting. Adjust as needed."

---

## 5. New Feature: Config Export / Import

### localStorage Constant
Add `const LS_KEY_HISTORY = 'lotteryHistory';` to the constants block at the top of `lottery.js` (used by §7 as well — define once here).

### What
Two small icon buttons in the league header area (below league title):
- **Export Config** (↓ icon) — downloads `[league-name]-config.json`
- **Import Config** (↑ icon) — file picker to read and apply a saved config

### Export
```javascript
function exportConfig() {
  const json = JSON.stringify(leagueConfig, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = sanitizeFilename(leagueConfig.leagueName) + '-config.json';
  a.click();
  URL.revokeObjectURL(url);
}
```

### Import
Hidden `<input type="file" accept=".json">`. On change:
1. `FileReader.readAsText()` on the selected file
2. `JSON.parse()` the result
3. Validate the following required fields (abort with error toast if any fail):
   - `leagueName`: string, length ≥ 1
   - `teamCount`: number, integer, 4 ≤ value ≤ 20
   - `teamNames`: array, length === teamCount, all elements are non-empty strings
   - `drawnPicks`: number, integer, ≥ 1
   - `byRecordPicks`: number, integer, ≥ 0
   - `combinations`: array, length === teamCount, all elements ≥ 1, **sum === 1000** (not 1001)
   - `rounds`: number, integer, 1 ≤ value ≤ 10
4. On pass: `saveLeagueConfig(parsed)` → `initApp()` → `showToast('League config loaded!', 'success')`
5. On fail: `showToast('Invalid config file. Missing or incorrect fields.', 'error')`

---

## 6. New Feature: Copy Results to Clipboard

### What
A **"Copy Results"** button in `.draft-order-downloads` after lottery completes.

### Jump Delta Calculation
`analyzeLotteryJumps()` returns `{ jumpers, fallers }` where each entry has `{ team, pick, fromSeed }`. The jump delta is `fromSeed - pick` (positive = team moved up that many spots from their seeded position). Use `pick` (not `finalPosition` — there is no `finalPosition` field in the returned data).

### Copy Text Format
```
[League Name] Draft Lottery Results
Magic Number: [N] | [MM/DD/YYYY]

LOTTERY ORDER:
1. Team Name (Lucky Leap! +3)
2. Team Name
...
N. Team Name

Generated by Fantasy Draft Lottery Simulator
```

### Implementation
```javascript
function copyResults(resultsArray, magicNum, jumpers) {
  const date = new Date().toLocaleDateString('en-US');
  const jumperMap = {};
  jumpers.forEach(j => { jumperMap[j.team.name] = j.fromSeed - j.pick; });
  const lines = resultsArray.map((team, i) => {
    const delta = jumperMap[team.name];
    const tag = delta > 0 ? ` (Lucky Leap! +${delta})` : '';
    return `${i + 1}. ${team.name}${tag}`;
  });
  const text = [
    `${leagueConfig.leagueName} Draft Lottery Results`,
    `Magic Number: ${magicNum} | ${date}`,
    '',
    'LOTTERY ORDER:',
    ...lines,
    '',
    'Generated by Fantasy Draft Lottery Simulator',
  ].join('\n');
  navigator.clipboard.writeText(text).then(() => {
    showToast('Results copied to clipboard!', 'success');
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Results copied!', 'success');
  });
}
```

---

## 7. New Feature: Lottery History

### localStorage Key
`LS_KEY_HISTORY` — see §5 for the constant declaration. Do not redeclare.

### What
Track the last 5 lottery results. Show a collapsible **"Past Lottery Results"** section below the results section.

### Data Structure (stored under `LS_KEY_HISTORY`):
```javascript
[
  {
    date: "2026-03-26T14:30:00.000Z",
    magicNumber: 7,
    leagueName: "My League",
    results: [
      { name: "Team A", position: 1, jumped: true, delta: 3 },
      { name: "Team B", position: 2, jumped: false, delta: 0 },
    ]
  }
  // max 5 entries, newest first
]
```

### Functions
- `saveToHistory(resultsArray, magicNumber, jumpers)`: build entry, prepend to array, slice to 5, `JSON.stringify` → `safeSetItem(LS_KEY_HISTORY, ...)`
- `renderHistory()`: read from `LS_KEY_HISTORY`, build DOM inside `#historySection`

### UI
- `<section id="historySection" class="history-section">` stub in `index.html`
- Heading: "Past Lottery Results" with click-to-toggle collapse (▶/▼ icon)
- Each run: `.history-entry` card — formatted date, magic number, compact ordered list
- "Clear History" link at bottom: removes `LS_KEY_HISTORY`, calls `renderHistory()`
- Initially collapsed

---

## 8. New Feature: Visual Progress Tracker

### What
A 3-step status bar between `.league-header` and `.team-inputs-section`:
```
● 1. Teams  ──  ● 2. Pick Ownership  ──  ● 3. Run Lottery
```

### Implementation
- Add `<div id="progressTracker" class="progress-tracker"></div>` in `index.html`
- `updateProgressTracker()` in `lottery.js`: reads `teamsLocked` and `pickOwnershipLocked` booleans, rebuilds the inner HTML

### Call Sites (call `updateProgressTracker()` AND `updateSectionBadges()` at the end of each):
- `lockTeams()`
- `unlockTeams()`
- `lockPickOwnership()`
- `unlockPickOwnership()`

### Scroll Targets on Click
- Step 1 → `document.querySelector('.team-inputs-section').scrollIntoView({ behavior: 'smooth' })`
- Step 2 → `document.querySelector('.pick-ownership-section').scrollIntoView({ behavior: 'smooth' })`
- Step 3 → `document.querySelector('.lottery-section').scrollIntoView({ behavior: 'smooth' })`

### CSS Classes
- `.progress-step.completed` — green dot and text
- `.progress-step.active` — blue dot, subtle pulse animation
- `.progress-step.pending` — gray, not clickable

---

## 9. New Feature: Confetti on Lottery Complete

### `launchConfetti()` in `lottery.js`
Call when the `.fullscreen-complete` div is appended to the modal.
```javascript
function launchConfetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const colors = ['#FFD700','#C0C0C0','#3B82F6','#F8FAFC','#F59E0B','#22C55E'];
  const particles = Array.from({ length: 150 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height - canvas.height,
    r: Math.random() * 6 + 3,
    color: colors[Math.floor(Math.random() * colors.length)],
    vx: (Math.random() - 0.5) * 4,
    vy: Math.random() * 4 + 2,
    rot: Math.random() * Math.PI * 2,
    rotV: (Math.random() - 0.5) * 0.2,
  }));
  const start = performance.now();
  function frame(now) {
    const elapsed = now - start;
    if (elapsed > 3000) {
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas); // guard against modal close mid-animation
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const alpha = Math.max(0, 1 - elapsed / 3000);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.rot += p.rotV;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r);
      ctx.restore();
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
```

---

## 10. New Feature: Section Status Badges

### What
Pill badge on section `<h2>` tags showing lock status.

### Call Sites
Call `updateSectionBadges()` alongside `updateProgressTracker()` in the same four functions (see §8 call sites).

### Implementation
```javascript
function updateSectionBadges() {
  const teamsH2 = document.querySelector('.team-inputs-section h2');
  const picksH2 = document.querySelector('.pick-ownership-section h2');
  setBadge(teamsH2, teamsLocked);
  setBadge(picksH2, pickOwnershipLocked);
}
function setBadge(h2, isConfirmed) {
  if (!h2) return;
  let badge = h2.querySelector('.section-badge');
  if (!badge) { badge = document.createElement('span'); badge.className = 'section-badge'; h2.appendChild(badge); }
  badge.className = `section-badge section-badge--${isConfirmed ? 'confirmed' : 'pending'}`;
  badge.textContent = isConfirmed ? 'Confirmed ✓' : 'Pending';
}
```

### CSS
```css
.section-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  margin-left: 0.5rem;
  vertical-align: middle;
}
.section-badge--confirmed { background: rgba(34,197,94,0.15); color: #22C55E; }
.section-badge--pending   { background: rgba(245,158,11,0.15); color: #F59E0B; }
```

---

## 11. New Feature: Pick Floor Constraints

### What
Optional "Floor Picks" number input in wizard Step 3 (Lottery Structure). Default: 0 (disabled).

### Config
Add `floorPicks: number` to `leagueConfig`. Default: `0`. Persist through wizard.

### Floor Constraint Logic in `runQuickLottery()`
After computing a `result` array, check the constraint:
```javascript
function floorSatisfied(results, floorPicks) {
  // For each of the first floorPicks positions, the team's originalIndex must be < floorPicks
  // (originalIndex 0 = worst team, which should stay in top floorPicks picks)
  for (let i = 0; i < floorPicks; i++) {
    if (results[i].originalIndex >= floorPicks) return false;
  }
  return true;
}
```
Apply in `runQuickLottery()`:
```javascript
const MAX_FLOOR_ATTEMPTS = 500;
let attempts = 0;
let result;
do {
  result = computeSingleDraw();
  attempts++;
} while (leagueConfig.floorPicks > 0 && !floorSatisfied(result, leagueConfig.floorPicks) && attempts < MAX_FLOOR_ATTEMPTS);

if (attempts === MAX_FLOOR_ATTEMPTS && leagueConfig.floorPicks > 0 && !floorSatisfied(result, leagueConfig.floorPicks)) {
  showToast('Floor constraint could not be satisfied with current combination weights — result may not respect floor picks.', 'warning');
}
```

### UI
If `floorPicks > 0`, show a note in the odds section: "Floor constraint active: worst [N] teams guaranteed top [N] picks."

---

## 12. Mobile & UX Improvements

### Odds Table Mobile Overflow
Wrap the odds table in a `<div class="odds-table-scroll-wrapper">` with scroll hint shadow:
```css
.odds-table-scroll-wrapper {
  overflow-x: auto;
  position: relative;
}
.odds-table-scroll-wrapper::after {
  content: '';
  position: absolute;
  top: 0; right: 0; bottom: 0;
  width: 32px;
  background: linear-gradient(to right, transparent, rgba(15,23,42,0.8));
  pointer-events: none;
}
```

### Magic Number Help Text
Add `<p class="magic-number-help">Pick 1–99. Your official result is the Nth simulation.</p>` below the magic number `<input>` in `index.html`.

CSS: `.magic-number-help { font-size: 0.78rem; color: var(--color-text-muted); margin-top: 0.25rem; }`

### Touch Target Sizes
In `main.css`: `button { min-height: 44px; }` applied globally. Add targeted overrides for badge/icon buttons that must be smaller for layout.

### Reset Button Confirmation (Double-Tap)
**The existing click handler for `#resetButton` in `index.html` (lines ~84–104) must be removed.** Replace it with this handler, either in `index.html` or moved into `lottery.js` during `initApp()`:
```javascript
let resetPending = false;
let resetTimer = null;
document.getElementById('resetButton').addEventListener('click', () => {
  if (!resetPending) {
    resetPending = true;
    const btn = document.getElementById('resetButton');
    btn.textContent = 'Are you sure? Click again to reset all data.';
    btn.classList.add('reset-confirming');
    resetTimer = setTimeout(() => {
      resetPending = false;
      btn.textContent = 'Reset All Data';
      btn.classList.remove('reset-confirming');
    }, 3000);
  } else {
    clearTimeout(resetTimer);
    localStorage.clear();
    location.reload();
  }
});
```
Add `.reset-confirming` CSS state: border-color changes to warning amber.

---

## 13. Improved Reconfigure Flow

### What
Preserve team names and pick ownership when reconfiguring without structural changes. Clear and re-prompt when team count or drawn pick count changes.

### Implementation
**Snapshot must be captured as `const` values at the very top of `showSetupWizard()`, before `render()` is called and before any wizard mutations to `leagueConfig` can occur:**
```javascript
const oldTeamCount = leagueConfig.teamCount;
const oldDrawnPicks = leagueConfig.drawnPicks;
```
These are closed over by `finishWizard()`.

In the wizard finish handler:
```javascript
const structuralChange = leagueConfig.teamCount !== oldTeamCount || leagueConfig.drawnPicks !== oldDrawnPicks;
if (structuralChange) {
  localStorage.removeItem(LS_KEY_TEAMS_LOCKED);
  localStorage.removeItem(LS_KEY_PICK_OWNERSHIP_LOCKED);
  localStorage.removeItem(LS_KEY_PICK_OWNERSHIP);
  localStorage.removeItem(LS_KEY_TEAM_NAMES);
  showToast('League structure changed — please re-enter team names.', 'warning');
} else {
  showToast('Settings updated. Team order preserved.', 'success');
}
initApp();
```

---

## File Modification Plan

| File | What Changes |
|------|-------------|
| `styles/main.css` | §1a: CSS variable aliases in `:root`; §8: Progress tracker styles; §10: Section badge styles; §12: Scroll wrapper, magic-number-help, min-height rule, reset-confirming state |
| `js/lottery.js` | §1b: Null check in `lockPickOwnership()`; §1c: Clear stale data in `unlockTeams()`; §1d: ARIA on close button; §2: `draftFormat` wizard step + `getFullDraftOrderData()` snake logic; §3: Heatmap in `refreshOddsTableBody()`; §4: `generateWeights()` + auto-generate in wizard step 4; §5: `exportConfig()`, `importConfig()`, `LS_KEY_HISTORY` constant; §6: `copyResults()`; §7: `saveToHistory()`, `renderHistory()`; §8: `updateProgressTracker()`; §9: `launchConfetti()`; §10: `updateSectionBadges()`, `setBadge()`; §11: floor constraint in `runQuickLottery()`; §12: reset double-tap handler in `initApp()` (replacing the one in index.html); §13: reconfigure snapshot + structural change logic |
| `index.html` | §1d: `aria-label` on `#reconfigureBtn`; §5: export/import buttons; §7: `#historySection` stub; §8: `#progressTracker` stub; §12: magic-number-help text; §12: **remove** existing `#resetButton` click handler from inline script |

---

## Verification Plan

1. Clear localStorage → open `index.html` → wizard renders with correct styling (§1a)
2. Wizard step 4 → click Auto-Generate → combination inputs fill, sum = 1000 (§4)
3. Complete wizard choosing Snake → full draft order round 2 is reversed vs. round 1 (§2)
4. Lock teams → lock picks with one null pick → error toast, lock blocked (§1b)
5. Lock teams → unlock teams → pick ownership table cleared (§1c)
6. Lock everything → run lottery → confetti fires (§9)
7. Click "Copy Results" → clipboard has correct formatted text with date (§6)
8. Run lottery 3 times → History section shows 3 collapsible entries (§7)
9. Export config → JSON downloads → clear localStorage → import JSON → league fully restored (§5)
10. Import a JSON file missing `leagueName` → error toast shown, no crash (§5 validation)
11. Set floor picks = 3, run 10 lotteries → worst 3 teams always in picks 1-3 (§11)
12. Mobile viewport → odds table scrolls horizontally (§12)
13. Click Reset once → button text changes to confirmation → wait 4s → resets to original text, no data cleared (§12 guard)
14. Click Reset twice quickly → data cleared, page reloads (§12)
15. Progress tracker → pending on load → step 1 green after team confirm → step 2 green after pick confirm → step 3 pulses (§8)
16. Section badges → "Pending" amber on Teams h2 → "Confirmed ✓" green after locking (§10)
17. Reconfigure same team count → toast says "preserved", team names still populated (§13)
18. Reconfigure different team count → warning toast, team name inputs blank (§13)
