# Fantasy Draft Lottery Simulator — Full Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all critical bugs and add 13 new features to make the fantasy draft lottery simulator fully-fledged: snake draft, odds heatmap, auto-generated combinations, config export/import, clipboard sharing, lottery history, visual progress tracker, confetti, section badges, floor constraints, mobile UX fixes, and reconfigure flow improvements.

**Architecture:** Pure vanilla JS, single-page app with no build step. All logic lives in `js/lottery.js` (~1801 lines), all styles in `styles/main.css` (~1763 lines), and HTML structure in `index.html` (~107 lines). localStorage for persistence. No frameworks, no dependencies, no npm.

**Tech Stack:** Vanilla JS (ES6+), CSS custom properties, HTML5, localStorage, Canvas API (confetti), Clipboard API

**Spec:** `docs/superpowers/specs/2026-03-26-full-overhaul-design.md`

---

## Key Code Landmarks (read before editing)

- **Constants block:** `lottery.js` lines 1–22 — `LS_KEY_*` keys, timing constants
- **Module-level state:** lines 70–77 — `currentChances`, `teams`, `pickOwnership`, `teamsLocked`, `pickOwnershipLocked`, `lastLotteryResult`
- **`initStateFromConfig()`:** lines 79–89 — note `pickOwnership` is initialized to all-`null` 2D array
- **`showSetupWizard(existingConfig)`:** lines 164–561 — local `config` object (line 168), `totalSteps = 6` (line 179), `stepRenderers` array (lines 202–209), `validateStep()` switch (lines 476–546), `finishWizard()` (lines 548–558), `render()` call (line 560)
- **`renderCombinations(card)`:** lines 392–451 — local `list` variable (line 410) is the combo list element
- **`getFullDraftOrderData()`:** lines 1095–1108 — nested `round`/`pick` loops (0-indexed)
- **`updateFullDraftOrder()`:** lines 1110–1180 — creates `downloadWrap` and appends buttons
- **`runFinalLottery(officialResult)`:** lines 1353–1644 — `jumpAnalysis` declared at line 1362; `finishReveal()` is a nested function (line 1595) with closure access to `results`, `magicNumber`, and `jumpAnalysis`
- **`finishReveal()`:** lines 1595–1629 — sets `lastLotteryResult` (line 1598), calls `updateResultsDiv` (1616) and `updateFullDraftOrder` (1617)
- **`lastLotteryResult`:** module-level, line 77 — stores `{ results, magicNumber, timestamp }` after each run
- **Reset handler:** `index.html` lines ~91–96 in inline `<script>` block

---

## File Map

| File | Changes |
|------|---------|
| `styles/main.css` | `:root` CSS variable aliases; progress tracker styles; section badge styles; scroll hint on `.odds-table-container`; magic-number-help; min-height rule; reset-confirming state; wizard format option styles; history section styles |
| `js/lottery.js` | Null check in `lockPickOwnership`; clear stale data in `unlockTeams`; ARIA on close button; snake draft wizard step + `getFullDraftOrderData` logic; heatmap in `refreshOddsTableBody`; `generateWeights` + auto-generate in `renderCombinations`; `exportConfig`, `importConfig`, `LS_KEY_HISTORY` constant; `copyResults`; `saveToHistory`, `renderHistory`; `updateProgressTracker`; `launchConfetti`; `updateSectionBadges`, `setBadge`; floor constraint in `runQuickLottery`; reset double-tap in `initApp`; reconfigure snapshot + structural change logic |
| `index.html` | ARIA label on `#reconfigureBtn`; export/import buttons; `#historySection` stub; `#progressTracker` stub; magic-number-help text; **remove** existing `#resetButton` click handler from inline script |

---

## Task 1: Fix Undefined CSS Variables (Bug Fix §1a)

**Files:**
- Modify: `styles/main.css` (`:root` block)

- [ ] **Step 1: Read the `:root` block**
  Open `styles/main.css` lines 1–70. Confirm the closing `}` of `:root`. The existing tokens use names like `--color-primary`, `--color-bg-card`, etc. We are adding shorthand aliases.

- [ ] **Step 2: Append aliases inside `:root { ... }`**
  Add before the closing `}` of the `:root` block:
  ```css
  /* Aliases for wizard CSS compatibility */
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

- [ ] **Step 3: Verify**
  Open `index.html`. Click reconfigure (gear icon). Wizard inputs should have styled borders, correct dark backgrounds, visible text.

- [ ] **Step 4: Commit**
  ```bash
  git add styles/main.css
  git commit -m "fix: add missing CSS variable aliases for wizard styling"
  ```

---

## Task 2: Fix Pick Ownership Null Guard + Stale Indices (Bug Fixes §1b, §1c)

**Files:**
- Modify: `js/lottery.js` — `lockPickOwnership()`, `unlockTeams()`

**Context:** `lockPickOwnership()` is around line 813. `unlockTeams()` is around line 804. `initStateFromConfig()` initializes `pickOwnership` with all-`null` values (lines 86–88) — the reset below must match this pattern exactly.

- [ ] **Step 1: Add null validation to `lockPickOwnership()`**
  At the top of `lockPickOwnership()` body, before the lock logic:
  ```javascript
  for (let r = 0; r < pickOwnership.length; r++) {
    for (let p = 0; p < pickOwnership[r].length; p++) {
      if (pickOwnership[r][p] == null) {
        showToast('All picks must be assigned before locking.', 'error');
        return;
      }
    }
  }
  ```

- [ ] **Step 2: Clear stale data in `unlockTeams()`**
  After `saveTeamLockState(false)` (or equivalent lock-state save), add:
  ```javascript
  localStorage.removeItem(LS_KEY_PICK_OWNERSHIP);
  // Reset to null-filled fresh state (matching initStateFromConfig pattern)
  pickOwnership = Array(leagueConfig.rounds).fill(null).map(() =>
    Array(leagueConfig.teamCount).fill(null).map(() => null)
  );
  ```

- [ ] **Step 3: Verify null guard**
  Complete setup, lock teams. In pick ownership table, leave one dropdown at its blank default. Click "Confirm Pick Ownership". Error toast should appear; table should remain unlocked.

- [ ] **Step 4: Verify stale clear**
  Lock teams with custom names. Unlock teams. Pick ownership table should reset to blank dropdowns (no prior selections preserved).

- [ ] **Step 5: Commit**
  ```bash
  git add js/lottery.js
  git commit -m "fix: validate pick ownership before lock; clear stale indices on team unlock"
  ```

---

## Task 3: ARIA Labels (Bug Fix §1d)

**Files:**
- Modify: `index.html` — `#reconfigureBtn`
- Modify: `js/lottery.js` — close button in `runLottery()`

- [ ] **Step 1: Add aria-label to reconfigure button**
  In `index.html`, find `id="reconfigureBtn"`. Add `aria-label="Reconfigure league settings"` if not already present.

- [ ] **Step 2: Check close button in lottery.js**
  Search `lottery.js` for `closeButton` or `close-button`. Confirm whether `aria-label="Close lottery results"` is already set. If not, add it where `closeButton` is created.

- [ ] **Step 3: Commit**
  ```bash
  git add index.html js/lottery.js
  git commit -m "fix: add aria-labels to reconfigure and modal close buttons"
  ```

---

## Task 4: Snake Draft Support (Feature §2)

**Files:**
- Modify: `js/lottery.js` — wizard constants and functions, `getFullDraftOrderData`, download functions, `loadLeagueConfig`
- Modify: `styles/main.css` — format option card styles

**Context:** Currently `totalSteps = 6` (line 179) with `stepRenderers` array having 6 entries (lines 202–209). We insert a new step at index 5 (Draft Format), shifting Draft Rounds to index 6. `validateStep()` switch currently has `case 5` for Draft Rounds — this becomes `case 6`. In `getFullDraftOrderData()` (line 1097), the outer loop uses 0-indexed `round`; snake reversal applies when `round % 2 === 1`.

- [ ] **Step 1: Add `draftFormat` to `loadLeagueConfig()` defaults**
  In `loadLeagueConfig()`, after parsing `config` from localStorage:
  ```javascript
  if (!config.draftFormat) config.draftFormat = 'snake';
  ```
  This handles configs saved before this feature.

- [ ] **Step 2: Update `totalSteps` from `6` to `7`**
  Line 179: `const totalSteps = 7;`

- [ ] **Step 3: Add `renderDraftFormat(card)` function inside `showSetupWizard`**
  Add after `renderDraftRounds` (around line 475, before `validateStep`):
  ```javascript
  function renderDraftFormat(card) {
    const title = document.createElement('h2');
    title.className = 'wizard-title';
    title.textContent = 'Draft Format';
    card.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'wizard-subtitle';
    subtitle.textContent = 'How should pick order work across rounds?';
    card.appendChild(subtitle);

    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'wizard-format-options';

    ['snake', 'linear'].forEach(fmt => {
      const label = document.createElement('label');
      label.className = 'wizard-format-option' + (config.draftFormat === fmt ? ' selected' : '');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'draftFormat';
      input.value = fmt;
      if (config.draftFormat === fmt) input.checked = true;
      const strong = document.createElement('strong');
      strong.textContent = fmt === 'snake' ? 'Snake Draft' : 'Linear Draft';
      const span = document.createElement('span');
      span.textContent = fmt === 'snake'
        ? 'Odd rounds go 1→N, even rounds reverse N→1. Most common format.'
        : 'Same pick order every round.';
      label.appendChild(input);
      label.appendChild(strong);
      label.appendChild(span);
      label.addEventListener('click', () => {
        config.draftFormat = fmt;
        optionsDiv.querySelectorAll('.wizard-format-option').forEach(o => o.classList.remove('selected'));
        label.classList.add('selected');
      });
      optionsDiv.appendChild(label);
    });

    const field = document.createElement('div');
    field.className = 'wizard-field';
    field.appendChild(optionsDiv);
    card.appendChild(field);
  }
  ```

- [ ] **Step 4: Update `stepRenderers` array to include `renderDraftFormat` at index 5**
  ```javascript
  const stepRenderers = [
    renderLeagueName,       // 0
    renderTeamCount,        // 1
    renderTeamNames,        // 2
    renderLotteryStructure, // 3
    renderCombinations,     // 4
    renderDraftFormat,      // 5 (new)
    renderDraftRounds,      // 6 (was 5)
  ];
  ```

- [ ] **Step 5: Update `validateStep()` switch**
  Change existing `case 5:` (Draft Rounds) to `case 6:`. Add new `case 5:` before it:
  ```javascript
  case 5: { // Draft Format
    config.draftFormat = document.querySelector('input[name="draftFormat"]:checked')?.value || 'snake';
    return true;
  }
  case 6: { // Draft Rounds (was case 5)
    const rounds = parseInt(document.getElementById('wizRounds')?.value);
    if (!rounds || rounds < 1 || rounds > 10) { showToast('Rounds must be between 1 and 10.'); return false; }
    config.rounds = rounds;
    return true;
  }
  ```

- [ ] **Step 6: Add CSS for format option cards to `main.css`**
  ```css
  .wizard-format-options {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }
  .wizard-format-option {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: var(--space-md);
    border: 2px solid var(--border-color);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: border-color var(--transition-base);
  }
  .wizard-format-option input[type="radio"] { display: none; }
  .wizard-format-option strong { color: var(--text-primary); font-size: 1rem; }
  .wizard-format-option span { color: var(--text-secondary); font-size: 0.85rem; }
  .wizard-format-option.selected {
    border-color: var(--primary);
    background: rgba(59, 130, 246, 0.08);
  }
  ```

- [ ] **Step 7: Implement snake reversal in `getFullDraftOrderData()`**
  Replace the existing nested loops (lines 1097–1106):
  ```javascript
  function getFullDraftOrderData(lotteryResults) {
    const rows = [];
    for (let round = 0; round < leagueConfig.rounds; round++) {
      const isReversed = leagueConfig.draftFormat === 'snake' && round % 2 === 1;
      const pickIndices = isReversed
        ? Array.from({ length: leagueConfig.teamCount }, (_, i) => leagueConfig.teamCount - 1 - i)
        : Array.from({ length: leagueConfig.teamCount }, (_, i) => i);
      for (const pick of pickIndices) {
        const originalTeamIndex = lotteryResults[pick].name === teams[pick].name
          ? pick
          : teams.findIndex(t => t.name === lotteryResults[pick].name);
        const ownerTeamIndex = pickOwnership[round][originalTeamIndex] !== null
          ? pickOwnership[round][originalTeamIndex]
          : originalTeamIndex;
        const pickNumber = round * leagueConfig.teamCount + (isReversed
          ? leagueConfig.teamCount - 1 - pickIndices.indexOf(pick)
          : pick) + 1;
        const teamName = teams[ownerTeamIndex].name;
        const viaName = ownerTeamIndex !== originalTeamIndex ? teams[originalTeamIndex].name : null;
        rows.push({ pickNumber, teamName, viaName });
      }
    }
    return rows;
  }
  ```
  **Correction:** The `pickNumber` calculation above is complex. Simplify: keep a sequential counter instead:
  ```javascript
  function getFullDraftOrderData(lotteryResults) {
    const rows = [];
    let overallPick = 1;
    for (let round = 0; round < leagueConfig.rounds; round++) {
      const isReversed = leagueConfig.draftFormat === 'snake' && round % 2 === 1;
      const pickIndices = isReversed
        ? Array.from({ length: leagueConfig.teamCount }, (_, i) => leagueConfig.teamCount - 1 - i)
        : Array.from({ length: leagueConfig.teamCount }, (_, i) => i);
      for (const pick of pickIndices) {
        const originalTeamIndex = lotteryResults[pick].name === teams[pick].name
          ? pick
          : teams.findIndex(t => t.name === lotteryResults[pick].name);
        const ownerTeamIndex = pickOwnership[round][originalTeamIndex] !== null
          ? pickOwnership[round][originalTeamIndex]
          : originalTeamIndex;
        const teamName = teams[ownerTeamIndex].name;
        const viaName = ownerTeamIndex !== originalTeamIndex ? teams[originalTeamIndex].name : null;
        rows.push({ pickNumber: overallPick++, teamName, viaName });
      }
    }
    return rows;
  }
  ```

- [ ] **Step 8: Add format label to `updateFullDraftOrder()`**
  After `fullDraftOrderDiv.innerHTML = '';` (line 1114), add:
  ```javascript
  const formatLabel = document.createElement('p');
  formatLabel.className = 'draft-format-label';
  formatLabel.textContent = leagueConfig.draftFormat === 'snake' ? '🐍 Snake Draft' : '📋 Linear Draft';
  fullDraftOrderDiv.appendChild(formatLabel);
  ```
  Add CSS: `.draft-format-label { font-size: 0.82rem; color: var(--color-text-muted); margin-bottom: var(--space-md); text-align: center; }`

- [ ] **Step 9: Add format to download output**
  In `downloadFullDraftOrder()` (line 1182), prepend to `lines` array:
  ```javascript
  const formatStr = leagueConfig.draftFormat === 'snake' ? 'Snake Draft' : 'Linear Draft';
  lines.push(`${leagueConfig.leagueName} — ${formatStr}`, '');
  ```

- [ ] **Step 10: Verify**
  Complete wizard. New Step 5 (Draft Format) appears with Snake/Linear cards. Complete with Snake. In full draft order, Round 2 picks should be in reverse order vs. Round 1 (team with pick 1 in round 1 should get the last pick in round 2).

- [ ] **Step 11: Commit**
  ```bash
  git add js/lottery.js styles/main.css
  git commit -m "feat: add snake draft support with wizard step and reversed even rounds"
  ```

---

## Task 5: Odds Table Heatmap (Feature §3)

**Files:**
- Modify: `js/lottery.js` — `refreshOddsTableBody()`

- [ ] **Step 1: Find `refreshOddsTableBody()` in lottery.js**
  Search for `refreshOddsTableBody`. Locate where `<td>` cells are created with percentage values.

- [ ] **Step 2: Add heatmap background**
  For each `td` containing an odds percentage value `v` (0–100), add after setting text:
  ```javascript
  const intensity = Math.sqrt(v / 100);
  td.style.background = `rgba(59, 130, 246, ${(intensity * 0.55).toFixed(3)})`;
  ```

- [ ] **Step 3: Verify**
  Open configured app. Odds table cells with high probability have visible blue fill; cells near 0% are transparent.

- [ ] **Step 4: Commit**
  ```bash
  git add js/lottery.js
  git commit -m "feat: add heatmap color-coding to odds table cells"
  ```

---

## Task 6: Auto-Generate Combinations (Feature §4)

**Files:**
- Modify: `js/lottery.js` — add `NBA_WEIGHT_PRESETS` constant, `generateWeights()` function, update `renderCombinations()`

**Context:** In `renderCombinations()` (line 392), the local variable `list` (line 410) is the combo list `div`. `lotteryEligible` is computed at line 408 as `config.drawnPicks + config.byRecordPicks`. The `updateComboTotal` function inside the closure (line 440) is triggered by `input` events on `.wiz-combo` inputs.

- [ ] **Step 1: Add preset table after the constants block (around line 22)**
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

  function generateWeights(n) {
    if (NBA_WEIGHT_PRESETS[n]) return [...NBA_WEIGHT_PRESETS[n]];
    const base = NBA_WEIGHT_PRESETS[14];
    const t = (n - 14) / (20 - 14);
    let weights = Array.from({ length: n }, (_, i) => {
      // Teams beyond the 14-slot preset inherit the last preset value (10) as their base
      const baseVal = i < base.length ? base[i] : base[base.length - 1];
      const flatVal = Math.floor(1000 / n);
      return Math.round(baseVal * (1 - t) + flatVal * t);
    });
    const diff = 1000 - weights.reduce((a, b) => a + b, 0);
    weights[0] += diff; // adjust worst-team slot to hit exactly 1000
    return weights;
  }
  ```

- [ ] **Step 2: Add auto-generate button in `renderCombinations()` (only when `lotteryEligible >= 2`)**
  After line 408 (`const lotteryEligible = config.drawnPicks + config.byRecordPicks;`) and before `card.appendChild(list)` (line 433), insert:
  ```javascript
  if (lotteryEligible >= 2) {
    const autoBtn = document.createElement('button');
    autoBtn.type = 'button';
    autoBtn.className = 'wizard-btn-back'; // secondary style
    autoBtn.textContent = 'Auto-Generate (NBA-style)';
    autoBtn.style.cssText = 'margin-bottom:0.75rem;width:auto;';
    autoBtn.addEventListener('click', () => {
      const weights = generateWeights(lotteryEligible);
      const inputs = card.querySelectorAll('.wiz-combo');
      weights.forEach((w, i) => { if (inputs[i]) inputs[i].value = w; });
      inputs[0]?.dispatchEvent(new Event('input')); // trigger sum update
    });
    card.appendChild(autoBtn);
  }
  ```
  Then append `list` and after it, add the note:
  ```javascript
  card.appendChild(list);
  if (lotteryEligible >= 2) {
    const note = document.createElement('p');
    note.style.cssText = 'font-size:0.8rem;color:var(--text-secondary);margin-top:0.25rem;';
    note.textContent = 'Based on NBA-style weighting. Adjust as needed.';
    card.appendChild(note);
  }
  ```
  (The existing `card.appendChild(list)` at line 433 should be kept — just add the above around it.)

- [ ] **Step 3: Verify**
  Wizard step 4: "Auto-Generate (NBA-style)" button appears. Click it — all combo inputs fill, sum counter shows 1000. Inputs remain editable.

- [ ] **Step 4: Commit**
  ```bash
  git add js/lottery.js
  git commit -m "feat: add NBA-style auto-generate button for lottery combinations"
  ```

---

## Task 7: Config Export / Import + LS_KEY_HISTORY Constant (Feature §5)

**Files:**
- Modify: `js/lottery.js` — constants block, add `exportConfig()`, `importConfig()`, wire in `initApp()`
- Modify: `index.html` — add buttons to league header
- Modify: `styles/main.css` — button styles

- [ ] **Step 1: Add `LS_KEY_HISTORY` to constants block (line ~21)**
  ```javascript
  const LS_KEY_HISTORY = 'lotteryHistory';
  ```

- [ ] **Step 2: Add `exportConfig()` function (near download functions, around line 1214)**
  ```javascript
  function exportConfig() {
    const json = JSON.stringify(leagueConfig, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sanitizeFilename(leagueConfig.leagueName) + '-config.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Config exported!', 'success');
  }
  ```

- [ ] **Step 3: Add `importConfig()` function**
  ```javascript
  function importConfig() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          const errors = [];
          if (typeof parsed.leagueName !== 'string' || !parsed.leagueName.trim()) errors.push('leagueName');
          if (typeof parsed.teamCount !== 'number' || parsed.teamCount < 4 || parsed.teamCount > 20) errors.push('teamCount');
          if (!Array.isArray(parsed.teamNames) || parsed.teamNames.length !== parsed.teamCount || parsed.teamNames.some(n => !n)) errors.push('teamNames');
          if (typeof parsed.drawnPicks !== 'number' || parsed.drawnPicks < 1) errors.push('drawnPicks');
          if (typeof parsed.byRecordPicks !== 'number' || parsed.byRecordPicks < 0) errors.push('byRecordPicks');
          if (!Array.isArray(parsed.combinations) || parsed.combinations.length !== parsed.teamCount || parsed.combinations.some(c => c < 1) || parsed.combinations.reduce((a,b)=>a+b,0) !== 1000) errors.push('combinations');
          if (typeof parsed.rounds !== 'number' || parsed.rounds < 1 || parsed.rounds > 10) errors.push('rounds');
          if (errors.length > 0) {
            showToast('Invalid config file. Bad fields: ' + errors.join(', '), 'error');
            return;
          }
          saveLeagueConfig(parsed);
          showToast('League config loaded!', 'success');
          initApp();
        } catch {
          showToast('Invalid config file. Could not parse JSON.', 'error');
        }
      };
      reader.readAsText(file);
    });
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  }
  ```

- [ ] **Step 4: Add buttons to `index.html` in league-header**
  After `<p id="leagueSubtitle">...</p>`, add:
  ```html
  <div class="header-config-actions">
    <button id="exportConfigBtn" class="config-action-btn" title="Export league config">&#8595; Export Config</button>
    <button id="importConfigBtn" class="config-action-btn" title="Import league config">&#8593; Import Config</button>
  </div>
  ```

- [ ] **Step 5: Wire buttons in `initApp()`**
  At the end of `initApp()` (before the closing `}`):
  ```javascript
  document.getElementById('exportConfigBtn')?.addEventListener('click', exportConfig);
  document.getElementById('importConfigBtn')?.addEventListener('click', importConfig);
  ```

- [ ] **Step 6: Add CSS**
  ```css
  .header-config-actions {
    display: flex;
    gap: var(--space-sm);
    justify-content: center;
    margin-top: var(--space-sm);
  }
  .config-action-btn {
    background: rgba(255,255,255,0.06);
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
    padding: 4px 12px;
    border-radius: var(--radius-pill);
    font-size: 0.78rem;
    cursor: pointer;
    transition: all var(--transition-fast);
    min-height: 32px;
  }
  .config-action-btn:hover {
    background: rgba(59,130,246,0.12);
    border-color: var(--primary);
    color: var(--text-primary);
  }
  ```

- [ ] **Step 7: Verify export**
  Click "↓ Export Config". JSON file downloads.

- [ ] **Step 8: Verify import**
  Clear localStorage, reload. Click "↑ Import Config", select the JSON. App restores league and shows main UI.

- [ ] **Step 9: Verify invalid import**
  Remove `leagueName` from the JSON, import it. Error toast lists the bad field.

- [ ] **Step 10: Commit**
  ```bash
  git add js/lottery.js index.html styles/main.css
  git commit -m "feat: add config export/import and LS_KEY_HISTORY constant"
  ```

---

## Task 8: Copy Results to Clipboard (Feature §6)

**Files:**
- Modify: `js/lottery.js` — add `copyResults()`, augment `lastLotteryResult`, add button in `updateFullDraftOrder()`

**Context:** `lastLotteryResult` (line 77) already exists and is set in `finishReveal()` (line 1598). `finishReveal()` is a nested function inside `runFinalLottery()` (line 1595) and has closure access to `results`, `magicNumber`, and `jumpAnalysis` (declared at line 1362). We augment `lastLotteryResult` to include `jumpers`. Then `updateFullDraftOrder()` (line 1110) reads from `lastLotteryResult` to build the copy button.

- [ ] **Step 1: Add `copyResults()` function (near download functions)**
  ```javascript
  function copyResults() {
    if (!lastLotteryResult) return;
    const { results, magicNumber, jumpers } = lastLotteryResult;
    const date = new Date().toLocaleDateString('en-US');
    const jumperMap = {};
    (jumpers || []).forEach(j => { jumperMap[j.team.name] = j.fromSeed - j.pick; });
    const lines = results.map((team, i) => {
      const delta = jumperMap[team.name];
      const tag = delta > 0 ? ` (Lucky Leap! +${delta})` : '';
      return `${i + 1}. ${team.name}${tag}`;
    });
    const text = [
      `${leagueConfig.leagueName} Draft Lottery Results`,
      `Magic Number: ${magicNumber} | ${date}`,
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

- [ ] **Step 2: Augment `lastLotteryResult` in `finishReveal()` to include `jumpers`**
  In `finishReveal()` (line 1598), change:
  ```javascript
  lastLotteryResult = {
    results,
    magicNumber,
    timestamp: new Date().toISOString()
  };
  ```
  To:
  ```javascript
  lastLotteryResult = {
    results,
    magicNumber,
    timestamp: new Date().toISOString(),
    jumpers: jumpAnalysis.jumpers   // jumpAnalysis is in scope via closure from runFinalLottery
  };
  ```

- [ ] **Step 3: Add "Copy Results" button in `updateFullDraftOrder()` (line 1174 area)**
  After `downloadWrap.appendChild(top10Btn);` (line 1175), add:
  ```javascript
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'lottery-button';
  copyBtn.textContent = '📋 Copy Results';
  copyBtn.style.fontSize = '0.9rem';
  copyBtn.addEventListener('click', copyResults);
  downloadWrap.appendChild(copyBtn);
  ```

- [ ] **Step 4: Verify**
  Run lottery. After modal closes, click "📋 Copy Results". Paste into text editor — should have formatted text with team names, magic number, date.

- [ ] **Step 5: Commit**
  ```bash
  git add js/lottery.js
  git commit -m "feat: add copy results to clipboard button"
  ```

---

## Task 9: Lottery History (Feature §7)

**Files:**
- Modify: `js/lottery.js` — add `saveToHistory()`, `renderHistory()`
- Modify: `index.html` — add `#historySection` stub
- Modify: `styles/main.css` — history styles

**Context:** `LS_KEY_HISTORY` is defined in Task 7. In `finishReveal()` (line 1595), `results`, `magicNumber`, and `jumpAnalysis` are all in scope via closures. Call `saveToHistory` there, after `lastLotteryResult` is set.

- [ ] **Step 1: Add `#historySection` stub to index.html**
  Before `<div class="reset-container">`, add:
  ```html
  <section id="historySection" class="history-section" style="display:none;"></section>
  ```

- [ ] **Step 2: Add `saveToHistory()` function to lottery.js**
  ```javascript
  function saveToHistory(results, magicNumber, jumpers) {
    const jumperMap = {};
    (jumpers || []).forEach(j => { jumperMap[j.team.name] = j.fromSeed - j.pick; });
    const entry = {
      date: new Date().toISOString(),
      magicNumber,
      leagueName: leagueConfig.leagueName,
      results: results.map((team, i) => ({
        name: team.name,
        position: i + 1,
        jumped: !!jumperMap[team.name],
        delta: jumperMap[team.name] || 0,
      })),
    };
    let history = [];
    try { history = JSON.parse(localStorage.getItem(LS_KEY_HISTORY) || '[]'); } catch(e) {}
    history.unshift(entry);
    history = history.slice(0, 5);
    safeSetItem(LS_KEY_HISTORY, JSON.stringify(history));
    renderHistory();
  }
  ```

- [ ] **Step 3: Add `renderHistory()` function**
  ```javascript
  function renderHistory() {
    const section = document.getElementById('historySection');
    if (!section) return;
    let history = [];
    try { history = JSON.parse(localStorage.getItem(LS_KEY_HISTORY) || '[]'); } catch(e) {}
    if (history.length === 0) { section.style.display = 'none'; return; }
    section.style.display = '';
    section.innerHTML = `
      <div class="history-header">
        <h2>Past Lottery Results <span class="history-count">(${history.length} run${history.length !== 1 ? 's' : ''})</span></h2>
        <button class="history-toggle-btn" aria-expanded="false" aria-controls="historyList">&#9654;</button>
      </div>
      <div id="historyList" class="history-list" style="display:none;">
        ${history.map(entry => {
          const d = new Date(entry.date);
          const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          return `
            <div class="history-entry">
              <div class="history-entry-meta">${dateStr} ${timeStr} &middot; Magic #${entry.magicNumber}</div>
              <ol class="history-entry-results">
                ${entry.results.map(r => `<li>${r.name}${r.jumped ? ` <span class="history-leap">+${r.delta}</span>` : ''}</li>`).join('')}
              </ol>
            </div>`;
        }).join('')}
        <button class="history-clear-btn">Clear History</button>
      </div>
    `;
    section.querySelector('.history-toggle-btn').addEventListener('click', function() {
      const list = document.getElementById('historyList');
      const expanded = this.getAttribute('aria-expanded') === 'true';
      list.style.display = expanded ? 'none' : 'block';
      this.textContent = expanded ? '\u25BA' : '\u25BC';
      this.setAttribute('aria-expanded', String(!expanded));
    });
    section.querySelector('.history-clear-btn').addEventListener('click', () => {
      localStorage.removeItem(LS_KEY_HISTORY);
      renderHistory();
    });
  }
  ```

- [ ] **Step 4: Call `saveToHistory()` in `finishReveal()`**
  In `finishReveal()` (after `lastLotteryResult = { ... }` block, line ~1602), add:
  ```javascript
  saveToHistory(results, magicNumber, jumpAnalysis.jumpers);
  ```
  Note: `jumpAnalysis` is accessible here because `finishReveal` is a closure inside `runFinalLottery` where `jumpAnalysis` is declared.

- [ ] **Step 5: Call `renderHistory()` in `initApp()`**
  Add `renderHistory();` near end of `initApp()`.

- [ ] **Step 6: Add CSS for history section**
  ```css
  .history-section { /* inherits section card styling from base `section` rules */ }
  .history-header { display: flex; align-items: center; justify-content: space-between; }
  .history-count { font-size: 0.8rem; color: var(--color-text-muted); font-weight: 400; margin-left: 0.5rem; }
  .history-toggle-btn { background: none; border: none; color: var(--color-text-muted); font-size: 1rem; cursor: pointer; min-height: 32px; padding: 0 8px; }
  .history-list { margin-top: var(--space-md); }
  .history-entry { padding: var(--space-sm) 0; border-bottom: 1px solid var(--border-color); }
  .history-entry:last-of-type { border-bottom: none; }
  .history-entry-meta { font-size: 0.78rem; color: var(--color-text-muted); margin-bottom: 0.25rem; }
  .history-entry-results { margin: 0; padding-left: 1.2rem; font-size: 0.85rem; columns: 2; }
  .history-entry-results li { margin-bottom: 0.15rem; }
  .history-leap { color: #22C55E; font-size: 0.75rem; font-weight: 600; }
  .history-clear-btn { margin-top: var(--space-md); background: none; border: 1px solid var(--color-danger); color: var(--color-danger); padding: 4px 12px; border-radius: var(--radius-pill); font-size: 0.78rem; cursor: pointer; min-height: 32px; }
  .history-clear-btn:hover { background: rgba(239,68,68,0.1); }
  ```

- [ ] **Step 7: Verify**
  Run lottery. "Past Lottery Results (1 run)" section appears. Toggle open — shows result list. Run 3 times total — shows "3 runs". "Clear History" removes section.

- [ ] **Step 8: Commit**
  ```bash
  git add js/lottery.js index.html styles/main.css
  git commit -m "feat: add lottery history section with last 5 results"
  ```

---

## Task 10: Visual Progress Tracker + Section Badges (Features §8, §10)

**Files:**
- Modify: `index.html` — add `#progressTracker`
- Modify: `js/lottery.js` — add `updateProgressTracker()`, `updateSectionBadges()`, `setBadge()`, wire to 4 lock functions + `initApp()`
- Modify: `styles/main.css` — tracker and badge styles

- [ ] **Step 1: Add `#progressTracker` to index.html**
  Between the `.league-header` closing tag and the `.team-inputs-section` opening tag:
  ```html
  <div id="progressTracker" class="progress-tracker"></div>
  ```

- [ ] **Step 2: Add `updateProgressTracker()` function to lottery.js**
  ```javascript
  function updateProgressTracker() {
    const el = document.getElementById('progressTracker');
    if (!el) return;
    const steps = [
      { label: '1. Teams', done: teamsLocked, target: '.team-inputs-section' },
      { label: '2. Pick Ownership', done: pickOwnershipLocked, target: '.pick-ownership-section' },
      { label: '3. Run Lottery', done: false, active: teamsLocked && pickOwnershipLocked, target: '.lottery-section' },
    ];
    el.innerHTML = steps.map((step, i) => {
      const cls = step.done ? 'completed' : (step.active ? 'active' : 'pending');
      const icon = step.done ? '&#10003;' : '&#9679;';
      const connector = i < steps.length - 1
        ? `<span class="progress-connector ${step.done ? 'completed' : ''}"></span>`
        : '';
      return `<button class="progress-step ${cls}" data-target="${step.target}" ${cls === 'pending' ? 'disabled' : ''}>${icon} ${step.label}</button>${connector}`;
    }).join('');
    el.querySelectorAll('.progress-step:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.querySelector(btn.dataset.target);
        if (target) target.scrollIntoView({ behavior: 'smooth' });
      });
    });
  }
  ```

- [ ] **Step 3: Add `setBadge()` and `updateSectionBadges()` to lottery.js**
  ```javascript
  function setBadge(h2, isConfirmed) {
    if (!h2) return;
    let badge = h2.querySelector('.section-badge');
    if (!badge) {
      badge = document.createElement('span');
      h2.appendChild(badge);
    }
    badge.className = `section-badge section-badge--${isConfirmed ? 'confirmed' : 'pending'}`;
    badge.textContent = isConfirmed ? 'Confirmed \u2713' : 'Pending';
  }

  function updateSectionBadges() {
    setBadge(document.querySelector('.team-inputs-section h2'), teamsLocked);
    setBadge(document.querySelector('.pick-ownership-section h2'), pickOwnershipLocked);
  }
  ```

- [ ] **Step 4: Wire update calls to all 4 lock functions**
  Find `lockTeams()`, `unlockTeams()`, `lockPickOwnership()`, `unlockPickOwnership()` in lottery.js. Add at the end of each function body:
  ```javascript
  updateProgressTracker();
  updateSectionBadges();
  ```

- [ ] **Step 5: Call both functions in `initApp()`**
  Add near the end of `initApp()`:
  ```javascript
  updateProgressTracker();
  updateSectionBadges();
  ```

- [ ] **Step 6: Add CSS for progress tracker and badges**
  ```css
  .progress-tracker {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-md) 0;
    gap: 0;
  }
  .progress-step {
    background: none;
    border: 2px solid var(--border-color);
    border-radius: var(--radius-pill);
    color: var(--color-text-muted);
    padding: 6px 16px;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--transition-base);
    min-height: 36px;
  }
  .progress-step.completed { border-color: #22C55E; color: #22C55E; }
  .progress-step.active {
    border-color: var(--color-primary);
    color: var(--color-primary);
    animation: progressPulse 2s ease-in-out infinite;
  }
  .progress-step[disabled], .progress-step.pending { opacity: 0.4; cursor: default; }
  .progress-connector {
    display: block;
    width: 2rem;
    height: 2px;
    background: var(--border-color);
    flex-shrink: 0;
    transition: background var(--transition-base);
  }
  .progress-connector.completed { background: #22C55E; }
  @keyframes progressPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); }
    50% { box-shadow: 0 0 0 6px rgba(59,130,246,0.2); }
  }
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

- [ ] **Step 7: Verify**
  Open app. Progress tracker shows 3 steps, steps 2 and 3 are grayed out. Lock teams → step 1 turns green. Lock picks → step 2 turns green, step 3 pulses. Section headings show "Pending" amber → "Confirmed ✓" green on lock.

- [ ] **Step 8: Commit**
  ```bash
  git add js/lottery.js index.html styles/main.css
  git commit -m "feat: add visual progress tracker and section status badges"
  ```

---

## Task 11: Confetti on Lottery Complete (Feature §9)

**Files:**
- Modify: `js/lottery.js` — add `launchConfetti()`, call in `finishReveal()`

- [ ] **Step 1: Add `launchConfetti()` function (before `initApp`)**
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
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
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

- [ ] **Step 2: Call `launchConfetti()` in `finishReveal()`**
  In `finishReveal()` (around line 1604), immediately after appending `completeMsg` to `animationContainer`:
  ```javascript
  launchConfetti();
  ```

- [ ] **Step 3: Verify**
  Run lottery. When "Draft lottery complete!" appears, colored confetti particles fall across the screen for ~3 seconds.

- [ ] **Step 4: Commit**
  ```bash
  git add js/lottery.js
  git commit -m "feat: add canvas confetti burst on lottery completion"
  ```

---

## Task 12: Pick Floor Constraints (Feature §11)

**Files:**
- Modify: `js/lottery.js` — `loadLeagueConfig()`, `renderLotteryStructure()`, `validateStep()` case 3, `runQuickLottery()`

- [ ] **Step 1: Add `floorPicks` default in `loadLeagueConfig()`**
  After `config.lockedPicks = ...` computation, add:
  ```javascript
  if (config.floorPicks == null) config.floorPicks = 0;
  ```
  Also add `floorPicks: 0` to the default config object in the default return path (or just ensure it's set post-parse).

- [ ] **Step 2: Add floor picks input to `renderLotteryStructure()`**
  Find `renderLotteryStructure(card)`. After the existing by-record picks input and its label, append a new field:
  ```javascript
  const floorField = document.createElement('div');
  floorField.className = 'wizard-field';
  floorField.innerHTML = `
    <label for="wizFloor">Guaranteed Top-N Floor <span style="color:var(--text-secondary);font-size:0.8rem">(optional)</span></label>
    <input type="number" id="wizFloor" min="0" max="${config.drawnPicks || 4}" value="${config.floorPicks || 0}" style="width:100%">
    <p style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.25rem;">Worst N teams guaranteed to land in top N picks. Set 0 to disable.</p>
  `;
  card.appendChild(floorField);
  ```

- [ ] **Step 3: Save `floorPicks` in `validateStep()` case 3**
  In `case 3:`, after saving `config.drawnPicks` and `config.byRecordPicks`, add:
  ```javascript
  const floor = parseInt(document.getElementById('wizFloor')?.value || '0', 10);
  config.floorPicks = isNaN(floor) ? 0 : Math.max(0, floor);
  ```

- [ ] **Step 4: Add `floorSatisfied()` helper and retry loop in `runQuickLottery()`**
  Add before `runQuickLottery`:
  ```javascript
  function floorSatisfied(results, floorPicks) {
    if (!floorPicks) return true;
    for (let i = 0; i < floorPicks; i++) {
      if (results[i].originalIndex >= floorPicks) return false;
    }
    return true;
  }
  ```
  In `runQuickLottery()`, find the core draw logic. Refactor the existing body into an inner `computeSingleDraw()` function (or just wrap it). Apply retry:
  ```javascript
  const MAX_FLOOR_ATTEMPTS = 500;
  let attempts = 0;
  let result;
  do {
    result = computeSingleDraw();
    attempts++;
  } while (leagueConfig.floorPicks > 0 && !floorSatisfied(result, leagueConfig.floorPicks) && attempts < MAX_FLOOR_ATTEMPTS);
  if (attempts >= MAX_FLOOR_ATTEMPTS && leagueConfig.floorPicks > 0 && !floorSatisfied(result, leagueConfig.floorPicks)) {
    showToast('Floor constraint could not be satisfied — result may not respect floor picks.', 'warning');
  }
  return result;
  ```

- [ ] **Step 5: Add floor note to odds section**
  In `createOddsTable()` or wherever the odds table is rendered, if `leagueConfig.floorPicks > 0`, append a note element after the table:
  ```javascript
  if (leagueConfig.floorPicks > 0) {
    const note = document.createElement('p');
    note.className = 'odds-floor-note';
    note.textContent = `Floor constraint: worst ${leagueConfig.floorPicks} teams guaranteed top ${leagueConfig.floorPicks} picks.`;
    // append after odds table container
  }
  ```
  CSS: `.odds-floor-note { font-size: 0.8rem; color: var(--color-text-muted); margin-top: 0.5rem; }`

- [ ] **Step 6: Verify**
  Set floor = 3. Run lottery 10 times. In every result, picks 1, 2, and 3 should all have `originalIndex < 3` (the 3 worst-seeded teams).

- [ ] **Step 7: Commit**
  ```bash
  git add js/lottery.js
  git commit -m "feat: add floor pick constraint guaranteeing worst N teams top N picks"
  ```

---

## Task 13: Mobile & UX Improvements (Feature §12)

**Files:**
- Modify: `styles/main.css` — scroll hint on `.odds-table-container`, magic-number-help, min-height, reset-confirming
- Modify: `index.html` — magic-number-help text; remove old reset handler
- Modify: `js/lottery.js` — reset double-tap in `initApp()`

- [ ] **Step 1: Add scroll hint to `.odds-table-container` in main.css**
  Find the existing `.odds-table-container` rule. Add:
  ```css
  .odds-table-container {
    overflow-x: auto;
    position: relative;
  }
  .odds-table-container::after {
    content: '';
    position: absolute;
    top: 0; right: 0; bottom: 0;
    width: 32px;
    background: linear-gradient(to right, transparent, rgba(15,23,42,0.8));
    pointer-events: none;
  }
  ```
  (If `.odds-table-container` already has rules, add the properties to the existing rule block.)

- [ ] **Step 2: Add magic number help text to index.html**
  Find `<input type="number" id="magicNumber"`. Immediately after it, add:
  ```html
  <p class="magic-number-help">Pick 1–99. Your official result is the Nth simulation.</p>
  ```

- [ ] **Step 3: Add CSS for magic-number-help, min-height, reset-confirming**
  ```css
  .magic-number-help {
    font-size: 0.78rem;
    color: var(--color-text-muted);
    margin-top: 0.25rem;
  }
  button { min-height: 44px; }
  .config-action-btn, .history-toggle-btn, .history-clear-btn { min-height: 32px; }
  .reset-confirming {
    border-color: #F59E0B !important;
    color: #F59E0B !important;
  }
  ```

- [ ] **Step 4: Remove existing reset handler from index.html**
  In `index.html`, find the inline `<script>` block. Remove the `document.getElementById('resetButton').addEventListener(...)` call entirely. Leave any other handlers in the block intact.

- [ ] **Step 5: Add double-tap reset handler in `initApp()`**
  At the end of `initApp()`:
  ```javascript
  let resetPending = false;
  let resetTimer = null;
  const resetBtn = document.getElementById('resetButton');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (!resetPending) {
        resetPending = true;
        resetBtn.textContent = 'Are you sure? Click again to reset all data.';
        resetBtn.classList.add('reset-confirming');
        resetTimer = setTimeout(() => {
          resetPending = false;
          resetBtn.textContent = 'Reset All Data';
          resetBtn.classList.remove('reset-confirming');
        }, 3000);
      } else {
        clearTimeout(resetTimer);
        localStorage.clear();
        location.reload();
      }
    });
  }
  ```

- [ ] **Step 6: Verify mobile scroll**
  Open in dev tools narrow viewport. Odds table should scroll horizontally with shadow hint.

- [ ] **Step 7: Verify reset guard**
  Click Reset once → text changes. Wait 4 seconds → resets. Click twice quickly → data clears, page reloads.

- [ ] **Step 8: Commit**
  ```bash
  git add js/lottery.js index.html styles/main.css
  git commit -m "feat: mobile UX improvements, scroll hint, magic number help, double-tap reset guard"
  ```

---

## Task 14: Improved Reconfigure Flow (Feature §13)

**Files:**
- Modify: `js/lottery.js` — `showSetupWizard()`, `finishWizard()`

**Context:** `showSetupWizard(existingConfig)` defines a local `config` variable at line 168 from `existingConfig || default`. The wizard mutates `config` in-place during `validateStep()`. `finishWizard()` is at line 548 and currently unconditionally clears all localStorage keys. The snapshot must capture from `config` (not `leagueConfig`) right after `config` is assigned (line 168), before `render()` is called (line 560).

- [ ] **Step 1: Add snapshot immediately after `config` definition (after line 176)**
  In `showSetupWizard()`, after the closing `}` of the `config` object definition (line 176), add:
  ```javascript
  const oldTeamCount = config.teamCount;
  const oldDrawnPicks = config.drawnPicks;
  ```
  These are captured before any `validateStep()` mutations can occur.

- [ ] **Step 2: Update `finishWizard()` with conditional clear**
  In `finishWizard()` (line 548), replace the unconditional `localStorage.removeItem(...)` block with:
  ```javascript
  function finishWizard() {
    saveLeagueConfig(config); // save first

    const structuralChange = config.teamCount !== oldTeamCount || config.drawnPicks !== oldDrawnPicks;
    if (structuralChange) {
      localStorage.removeItem(LS_KEY_TEAM_NAMES);
      localStorage.removeItem(LS_KEY_TEAMS_LOCKED);
      localStorage.removeItem(LS_KEY_PICK_OWNERSHIP_LOCKED);
      localStorage.removeItem(LS_KEY_PICK_OWNERSHIP);
      showToast('League structure changed — please re-enter team names.', 'warning');
    } else {
      showToast('Settings updated. Team order preserved.', 'success');
    }

    overlay.style.display = 'none';
    document.querySelector('.container').style.display = '';
    initApp();
  }
  ```

- [ ] **Step 3: Verify same-structure reconfigure**
  Configure a 10-team league with custom names. Lock teams. Click reconfigure gear. Change only the league name. Complete wizard. Team names should still be populated. Toast: "Settings updated. Team order preserved."

- [ ] **Step 4: Verify structural-change reconfigure**
  Same setup. Reconfigure, change team count to 12. Complete wizard. Team name inputs should be blank. Toast: "League structure changed — please re-enter team names."

- [ ] **Step 5: Commit**
  ```bash
  git add js/lottery.js
  git commit -m "feat: preserve team names on reconfigure when structure unchanged"
  ```

---

## Final Task: Integration Verification

- [ ] **Step 1: Full fresh start test**
  Clear localStorage completely. Open `index.html`. Walk through:
  1. Wizard renders with correct styling (Task 1 — CSS var bug fixed)
  2. Step 3 shows floor picks input (Task 12)
  3. Step 4 shows "Auto-Generate" button (Task 6)
  4. New Step 5 (Draft Format) appears with Snake/Linear option cards (Task 4)
  5. Complete wizard → main app shows progress tracker and "Pending" section badges (Task 10)
  6. Lock teams → progress step 1 turns green, badge turns "Confirmed ✓"
  7. All pick ownership dropdowns show — attempt lock with one unassigned → error toast (Task 2)
  8. Assign all picks, lock → step 2 turns green, step 3 pulses
  9. Odds table shows heatmap blue fills (Task 5)
  10. Run lottery → confetti fires after "Draft lottery complete!" (Task 11)
  11. "📋 Copy Results" button visible → click it → clipboard has formatted text (Task 8)
  12. "Past Lottery Results (1 run)" section visible (Task 9)
  13. Export config → JSON downloads (Task 7)
  14. Clear localStorage → import config → league fully restored (Task 7)
  15. Narrow viewport → odds table scrolls horizontally (Task 13)
  16. Reset → double-tap guard works (Task 13)
  17. Same-count reconfigure → names preserved (Task 14)

- [ ] **Step 2: Final commit**
  ```bash
  git add .
  git commit -m "feat: complete fantasy draft lottery simulator overhaul — 13 features, 4 bug fixes"
  ```
