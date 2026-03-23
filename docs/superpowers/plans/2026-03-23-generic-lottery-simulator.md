# Fantasy Draft Lottery Simulator (Generic) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a new repo `fantasy-draft-lottery-simulator` that is a fully customizable version of the existing `fantasy-draft-lottery` app — any league can configure their own team count, names, lottery structure, combinations, and rounds.

**Architecture:** Copy all files from `c:\Users\lucas\dev\fantasy-draft-lottery` into `c:\Users\lucas\dev\fantasy-draft-lottery-simulator`, then refactor the single `lottery.js` to be config-driven. A setup wizard collects league configuration on first visit. Odds are computed analytically from user-defined combinations. All hardcoded league-specific constants are replaced with `leagueConfig` references.

**Tech Stack:** Pure HTML/CSS/JS (no build tools, no frameworks). GitHub Pages deployment via GitHub Actions.

**Spec:** `c:\Users\lucas\dev\fantasy-draft-lottery\docs\superpowers\specs\2026-03-23-generic-lottery-simulator-design.md`

---

## File Structure

All work happens in `c:\Users\lucas\dev\fantasy-draft-lottery-simulator\`:

| File | Action | Responsibility |
|------|--------|---------------|
| `index.html` | Copy + modify | Page structure, wizard container, dynamic header, remove static odds thead |
| `js/lottery.js` | Copy + heavy refactor | All app logic: config, wizard, odds computation, lottery engine, UI |
| `styles/main.css` | Copy + modify | Add wizard styles, dynamic grids, scaled podium |
| `images/favicon.png` | Copy as-is | Site icon |
| `.github/workflows/static.yml` | Copy as-is | GitHub Pages deployment |
| `README.md` | Create new | Documentation for the generic tool |
| `CLAUDE.md` | Create new | Project instructions |
| `LICENSE` | Copy as-is | License |
| `.gitignore` | Copy as-is | Git ignore rules |

---

## Task 1: Create New Repo and Copy Files

**Files:**
- Create: `c:\Users\lucas\dev\fantasy-draft-lottery-simulator\` (entire directory)

- [ ] **Step 1: Create directory and initialize git**

```bash
mkdir -p c:/Users/lucas/dev/fantasy-draft-lottery-simulator
cd c:/Users/lucas/dev/fantasy-draft-lottery-simulator
git init
```

- [ ] **Step 2: Copy all source files**

```bash
cp c:/Users/lucas/dev/fantasy-draft-lottery/index.html .
mkdir -p js styles images .github/workflows
cp c:/Users/lucas/dev/fantasy-draft-lottery/js/lottery.js js/
cp c:/Users/lucas/dev/fantasy-draft-lottery/styles/main.css styles/
cp c:/Users/lucas/dev/fantasy-draft-lottery/images/favicon.png images/
cp c:/Users/lucas/dev/fantasy-draft-lottery/.github/workflows/static.yml .github/workflows/
cp c:/Users/lucas/dev/fantasy-draft-lottery/LICENSE .
cp c:/Users/lucas/dev/fantasy-draft-lottery/.gitignore .
```

- [ ] **Step 3: Create new README.md**

Write a README describing the generic tool: what it does, how to use it (setup wizard), customization options, deployment instructions.

- [ ] **Step 4: Create new CLAUDE.md**

Write project instructions reflecting the new config-driven architecture, file structure, and key functions.

- [ ] **Step 5: Initial commit**

```bash
cd c:/Users/lucas/dev/fantasy-draft-lottery-simulator
git add -A
git commit -m "Initial copy from fantasy-draft-lottery for generic refactor"
```

---

## Task 2: Add Config System and localStorage Keys

**Files:**
- Modify: `c:\Users\lucas\dev\fantasy-draft-lottery-simulator\js\lottery.js` (lines 1-91)

This task replaces all hardcoded constants with a config-driven system.

- [ ] **Step 1: Replace constants section**

Replace lines 1-91 of `lottery.js` with:

```javascript
// ============================================
// CONSTANTS
// ============================================

const TOTAL_POOL = 1001;
const ASSIGNED = 1000;

// Timing constants (ms)
const ITERATION_DELAY_MS = 800;
const PICK_DELAY_MS = 3000;
const PICK_DELAY_SECONDS = PICK_DELAY_MS / 1000;
const CALCULATING_DELAY_MS = 5000;
const REVEAL_START_DELAY_MS = 1000;
const NEXT_BUTTON_DELAY_MS = 1000;

// localStorage keys
const LS_KEY_LEAGUE_CONFIG = 'lotteryLeagueConfig';
const LS_KEY_TEAM_NAMES = 'lotteryTeamNames';
const LS_KEY_TEAMS_LOCKED = 'lotteryTeamsLocked';
const LS_KEY_PICK_OWNERSHIP_LOCKED = 'lotteryPickOwnershipLocked';
const LS_KEY_PICK_OWNERSHIP = 'lotteryPickOwnership';

// ============================================
// LEAGUE CONFIG
// ============================================

let leagueConfig = null;

function loadLeagueConfig() {
    try {
        const saved = localStorage.getItem(LS_KEY_LEAGUE_CONFIG);
        if (!saved) return null;
        const config = JSON.parse(saved);
        if (!config || typeof config.teamCount !== 'number') return null;
        config.lockedPicks = config.teamCount - config.drawnPicks - config.byRecordPicks;
        return config;
    } catch (e) {
        console.warn('Failed to load league config', e);
        return null;
    }
}

function saveLeagueConfig(config) {
    config.lockedPicks = config.teamCount - config.drawnPicks - config.byRecordPicks;
    config.odds = computeOdds(config.combinations, config.drawnPicks);
    safeSetItem(LS_KEY_LEAGUE_CONFIG, JSON.stringify(config));
    leagueConfig = config;
}

function generateTeamLabels(teamCount) {
    const labels = new Array(teamCount);
    // Last index = Champion (best), index 0 = worst seed
    if (teamCount >= 1) labels[teamCount - 1] = 'Champion';
    if (teamCount >= 2) labels[teamCount - 2] = '2nd Place';
    if (teamCount >= 3) labels[teamCount - 3] = '3rd Place';
    for (let i = teamCount - 4; i >= 0; i--) {
        labels[i] = `${formatOrdinal(teamCount - i)} Seed`;
    }
    return labels;
}

function sanitizeFilename(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ============================================
// DYNAMIC STATE (initialized from config)
// ============================================

let currentChances = [];
let teams = [];
let pickOwnership = [];
let teamsLocked = false;
let pickOwnershipLocked = false;
let confirmTeamButton = null;
let confirmPickOwnershipButton = null;
let lastLotteryResult = null;

function initStateFromConfig() {
    const lotteryEligible = leagueConfig.combinations;
    currentChances = [...lotteryEligible, ...new Array(leagueConfig.lockedPicks).fill(0)];
    teams = currentChances.map((c, i) => ({
        name: leagueConfig.teamNames[i] || '',
        chances: c
    }));
    pickOwnership = Array(leagueConfig.rounds).fill().map(() =>
        Array(leagueConfig.teamCount).fill().map(() => null)
    );
}

function applyChancesToTeams() {
    currentChances.forEach((c, i) => { teams[i].chances = c; });
}

// Stub — replaced with full implementation in Task 3
function computeOdds(combinations, drawnPicks) { return []; }
```

- [ ] **Step 2: Verify the file is syntactically valid**

Open the file and check for missing brackets or syntax issues. The remaining functions (toast, localStorage, etc.) should still be intact below.

- [ ] **Step 3: Commit**

```bash
git add js/lottery.js
git commit -m "Replace hardcoded constants with config-driven system"
```

---

## Task 3: Implement Analytical Odds Calculation

**Files:**
- Modify: `c:\Users\lucas\dev\fantasy-draft-lottery-simulator\js\lottery.js`

Add the `computeOdds()` function right after the config section (before the toast section).

- [ ] **Step 1: Add computeOdds function**

Insert after the `applyChancesToTeams()` function:

```javascript
// ============================================
// ANALYTICAL ODDS CALCULATION
// ============================================

function computeOdds(combinations, drawnPicks) {
    const n = combinations.length; // lottery-eligible teams
    const total = combinations.reduce((a, b) => a + b, 0);
    // odds[team][position] — team = lottery-eligible index, position = final pick position (0-indexed)
    const odds = Array.from({ length: n }, () => new Array(n).fill(0));

    // Recursive enumeration of drawn pick states
    // state: { drawnSet: Set of drawn team indices, probability: number }
    // At each pick k (0..drawnPicks-1), expand all states

    let states = [{ drawnSet: new Set(), prob: 1.0 }];

    for (let pick = 0; pick < drawnPicks; pick++) {
        const nextStates = new Map(); // key = sorted drawn indices string, value = { drawnSet, prob }

        for (const state of states) {
            const remainingPool = total - [...state.drawnSet].reduce((s, i) => s + combinations[i], 0);
            if (remainingPool <= 0) continue;

            for (let team = 0; team < n; team++) {
                if (state.drawnSet.has(team)) continue;
                if (combinations[team] <= 0) continue;

                const drawProb = combinations[team] / remainingPool;
                const totalProb = state.prob * drawProb;

                // Record this team getting this pick position
                odds[team][pick] += totalProb;

                // Build next state
                const newDrawn = new Set(state.drawnSet);
                newDrawn.add(team);
                const key = [...newDrawn].sort((a, b) => a - b).join(',');

                if (nextStates.has(key)) {
                    nextStates.get(key).prob += totalProb;
                } else {
                    nextStates.set(key, { drawnSet: newDrawn, prob: totalProb });
                }
            }
        }

        states = [...nextStates.values()];
    }

    // For by-record positions: remaining teams sorted by ascending index (worst seed first)
    for (const state of states) {
        const remaining = [];
        for (let i = 0; i < n; i++) {
            if (!state.drawnSet.has(i)) remaining.push(i);
        }
        remaining.sort((a, b) => a - b);
        remaining.forEach((team, idx) => {
            odds[team][drawnPicks + idx] += state.prob;
        });
    }

    // Convert to percentages rounded to 1 decimal
    return odds.map(row => row.map(p => Math.round(p * 1000) / 10));
}
```

- [ ] **Step 2: Verify odds match original hardcoded values**

After implementation, we will verify by calling `computeOdds([224, 224, 224, 224, 60, 45], 4)` in the browser console and comparing against the original odds table:
```
[22.4, 21.9, 21.0, 19.1, 15.7,  0.0]
[22.4, 21.8, 20.9, 19.1, 14.7,  0.9]
[22.4, 21.9, 20.9, 19.1, 13.8,  1.9]
[22.4, 21.9, 21.0, 19.1, 12.8,  2.8]
[ 6.0,  7.2,  9.2, 13.3, 43.0, 21.3]
[ 4.4,  5.4,  7.0, 10.3,  0.0, 73.0]
```

- [ ] **Step 3: Commit**

```bash
git add js/lottery.js
git commit -m "Add analytical odds calculation from combinations"
```

---

## Task 4: Implement Setup Wizard

**Files:**
- Modify: `c:\Users\lucas\dev\fantasy-draft-lottery-simulator\js\lottery.js`
- Modify: `c:\Users\lucas\dev\fantasy-draft-lottery-simulator\index.html`
- Modify: `c:\Users\lucas\dev\fantasy-draft-lottery-simulator\styles\main.css`

- [ ] **Step 1: Add wizard container to index.html**

Add immediately after `<body>` opening tag (before `.container`):

```html
<div id="setupWizard" class="wizard-overlay" style="display:none;">
    <!-- Populated by JavaScript -->
</div>
```

Add a reconfigure button inside `.league-header` after the subtitle:

```html
<button type="button" id="reconfigureBtn" class="reconfigure-button" title="Reconfigure League">&#9881; Reconfigure</button>
```

- [ ] **Step 2: Add wizard CSS to styles/main.css**

Append wizard styles to end of main.css (before the media queries):

```css
/* ============================================
   SETUP WIZARD
   ============================================ */

.wizard-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
    background: var(--bg-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow-y: auto;
    padding: var(--space-lg);
}

.wizard-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 16px;
    padding: var(--space-2xl);
    max-width: 640px;
    width: 100%;
    box-shadow: var(--shadow-lg);
}

.wizard-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: var(--space-xs);
}

.wizard-subtitle {
    font-size: 0.95rem;
    color: var(--text-secondary);
    margin-bottom: var(--space-xl);
}

.wizard-progress {
    display: flex;
    gap: var(--space-xs);
    margin-bottom: var(--space-xl);
}

.wizard-progress-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--border-color);
    transition: background var(--transition-base);
}

.wizard-progress-dot.active {
    background: var(--primary);
}

.wizard-progress-dot.completed {
    background: var(--success);
}

.wizard-field {
    margin-bottom: var(--space-lg);
}

.wizard-field label {
    display: block;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: var(--space-xs);
}

.wizard-field input[type="text"],
.wizard-field input[type="number"] {
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    color: var(--text-primary);
    font-size: 1rem;
    font-family: inherit;
}

.wizard-field input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px var(--primary-glow);
}

.wizard-field .helper-text {
    font-size: 0.85rem;
    color: var(--text-secondary);
    margin-top: var(--space-xs);
}

.wizard-team-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-sm);
}

.wizard-team-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
}

.wizard-team-item label {
    min-width: 80px;
    font-size: 0.85rem;
    margin-bottom: 0;
}

.wizard-team-item input {
    flex: 1;
    padding: var(--space-xs) var(--space-sm);
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 0.9rem;
    font-family: inherit;
}

.wizard-team-item input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px var(--primary-glow);
}

.wizard-combo-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: var(--space-sm);
}

.wizard-combo-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
}

.wizard-combo-item label {
    min-width: 80px;
    font-size: 0.85rem;
    margin-bottom: 0;
}

.wizard-combo-item input {
    width: 80px;
    padding: var(--space-xs) var(--space-sm);
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 0.9rem;
    font-family: var(--font-mono);
    text-align: right;
}

.wizard-combo-total {
    margin-top: var(--space-md);
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 1rem;
}

.wizard-combo-total.valid {
    color: var(--success);
}

.wizard-combo-total.invalid {
    color: var(--danger);
}

.wizard-nav {
    display: flex;
    justify-content: space-between;
    margin-top: var(--space-xl);
    gap: var(--space-md);
}

.wizard-nav button {
    padding: var(--space-sm) var(--space-lg);
    border-radius: 8px;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    border: none;
    transition: all var(--transition-base);
}

.wizard-btn-back {
    background: var(--bg-primary);
    color: var(--text-secondary);
    border: 1px solid var(--border-color) !important;
}

.wizard-btn-back:hover {
    background: var(--border-color);
}

.wizard-btn-next {
    background: var(--primary);
    color: #fff;
}

.wizard-btn-next:hover {
    filter: brightness(1.1);
}

.wizard-btn-next:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.wizard-error {
    color: var(--danger);
    font-size: 0.85rem;
    margin-top: var(--space-xs);
}

.reconfigure-button {
    background: transparent;
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
    padding: var(--space-xs) var(--space-sm);
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    transition: all var(--transition-base);
}

.reconfigure-button:hover {
    color: var(--text-primary);
    border-color: var(--primary);
}

.wizard-structure-row {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-bottom: var(--space-sm);
}

.wizard-structure-row label {
    min-width: 200px;
    margin-bottom: 0;
}

.wizard-structure-row input {
    width: 80px;
}

.wizard-structure-summary {
    margin-top: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-primary);
    border-radius: 8px;
    font-size: 0.9rem;
    color: var(--text-secondary);
}
```

- [ ] **Step 3: Add wizard JavaScript to lottery.js**

Insert the `showSetupWizard()` function after the config section, before the toast section. This is a large function — here is the full implementation:

```javascript
// ============================================
// SETUP WIZARD
// ============================================

function showSetupWizard(existingConfig) {
    const overlay = document.getElementById('setupWizard');
    if (!overlay) return;

    const config = existingConfig || {
        leagueName: '',
        teamCount: 10,
        teamNames: [],
        drawnPicks: 4,
        byRecordPicks: 2,
        combinations: [],
        rounds: 3
    };

    let currentStep = 0;
    const totalSteps = 6;

    overlay.style.display = 'flex';
    document.querySelector('.container').style.display = 'none';

    function render() {
        overlay.innerHTML = '';

        const card = document.createElement('div');
        card.className = 'wizard-card';

        // Progress dots
        const progress = document.createElement('div');
        progress.className = 'wizard-progress';
        for (let i = 0; i < totalSteps; i++) {
            const dot = document.createElement('div');
            dot.className = 'wizard-progress-dot';
            if (i < currentStep) dot.classList.add('completed');
            if (i === currentStep) dot.classList.add('active');
            progress.appendChild(dot);
        }
        card.appendChild(progress);

        const stepRenderers = [
            renderLeagueName,
            renderTeamCount,
            renderTeamNames,
            renderLotteryStructure,
            renderCombinations,
            renderDraftRounds
        ];

        stepRenderers[currentStep](card);

        // Navigation
        const nav = document.createElement('div');
        nav.className = 'wizard-nav';

        if (currentStep > 0) {
            const backBtn = document.createElement('button');
            backBtn.type = 'button';
            backBtn.className = 'wizard-btn-back';
            backBtn.textContent = 'Back';
            backBtn.addEventListener('click', () => { currentStep--; render(); });
            nav.appendChild(backBtn);
        } else {
            nav.appendChild(document.createElement('div')); // spacer
        }

        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'wizard-btn-next';
        nextBtn.textContent = currentStep === totalSteps - 1 ? 'Finish Setup' : 'Next';
        nextBtn.addEventListener('click', () => {
            if (validateStep()) {
                if (currentStep === totalSteps - 1) {
                    finishWizard();
                } else {
                    currentStep++;
                    render();
                }
            }
        });
        nav.appendChild(nextBtn);

        card.appendChild(nav);
        overlay.appendChild(card);

        // Focus first input
        const firstInput = card.querySelector('input');
        if (firstInput) firstInput.focus();
    }

    function renderLeagueName(card) {
        const title = document.createElement('h2');
        title.className = 'wizard-title';
        title.textContent = 'League Name';
        card.appendChild(title);

        const subtitle = document.createElement('p');
        subtitle.className = 'wizard-subtitle';
        subtitle.textContent = 'What is your fantasy league called?';
        card.appendChild(subtitle);

        const field = document.createElement('div');
        field.className = 'wizard-field';
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'wizLeagueName';
        input.placeholder = 'My Fantasy League';
        input.maxLength = 60;
        input.value = config.leagueName || '';
        field.appendChild(input);
        card.appendChild(field);
    }

    function renderTeamCount(card) {
        const title = document.createElement('h2');
        title.className = 'wizard-title';
        title.textContent = 'Number of Teams';
        card.appendChild(title);

        const subtitle = document.createElement('p');
        subtitle.className = 'wizard-subtitle';
        subtitle.textContent = 'How many teams are in your league?';
        card.appendChild(subtitle);

        const field = document.createElement('div');
        field.className = 'wizard-field';
        const input = document.createElement('input');
        input.type = 'number';
        input.id = 'wizTeamCount';
        input.min = 4;
        input.max = 20;
        input.value = config.teamCount || 10;
        field.appendChild(input);
        card.appendChild(field);
    }

    function renderTeamNames(card) {
        const title = document.createElement('h2');
        title.className = 'wizard-title';
        title.textContent = 'Team Names';
        card.appendChild(title);

        const subtitle = document.createElement('p');
        subtitle.className = 'wizard-subtitle';
        subtitle.textContent = 'Enter team names from worst record to best (standings order).';
        card.appendChild(subtitle);

        const labels = generateTeamLabels(config.teamCount);
        const list = document.createElement('div');
        list.className = 'wizard-team-list';

        for (let i = 0; i < config.teamCount; i++) {
            const item = document.createElement('div');
            item.className = 'wizard-team-item';

            const label = document.createElement('label');
            label.textContent = labels[i] + ':';

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'wiz-team-name';
            input.placeholder = `Team ${i + 1}`;
            input.value = config.teamNames[i] || '';
            input.dataset.index = i;

            item.appendChild(label);
            item.appendChild(input);
            list.appendChild(item);
        }

        card.appendChild(list);
    }

    function renderLotteryStructure(card) {
        const title = document.createElement('h2');
        title.className = 'wizard-title';
        title.textContent = 'Lottery Structure';
        card.appendChild(title);

        const subtitle = document.createElement('p');
        subtitle.className = 'wizard-subtitle';
        subtitle.textContent = 'Define how picks are determined.';
        card.appendChild(subtitle);

        const fields = [
            { id: 'wizDrawnPicks', label: 'Picks drawn by lottery:', value: config.drawnPicks, min: 1 },
            { id: 'wizByRecordPicks', label: 'Picks assigned by reverse record:', value: config.byRecordPicks, min: 0 }
        ];

        fields.forEach(f => {
            const row = document.createElement('div');
            row.className = 'wizard-structure-row';
            const label = document.createElement('label');
            label.textContent = f.label;
            label.setAttribute('for', f.id);
            const input = document.createElement('input');
            input.type = 'number';
            input.id = f.id;
            input.min = f.min;
            input.max = config.teamCount;
            input.value = f.value;
            input.addEventListener('input', updateStructureSummary);
            row.appendChild(label);
            row.appendChild(input);
            card.appendChild(row);
        });

        const summary = document.createElement('div');
        summary.className = 'wizard-structure-summary';
        summary.id = 'structureSummary';
        card.appendChild(summary);

        function updateStructureSummary() {
            const drawn = parseInt(document.getElementById('wizDrawnPicks')?.value) || 0;
            const byRecord = parseInt(document.getElementById('wizByRecordPicks')?.value) || 0;
            const locked = config.teamCount - drawn - byRecord;
            const s = document.getElementById('structureSummary');
            if (s) {
                if (locked < 0) {
                    s.textContent = `Error: drawn + by-record exceeds team count (${config.teamCount}).`;
                    s.style.color = 'var(--danger)';
                } else {
                    s.textContent = `${drawn} drawn by lottery, ${byRecord} by reverse record, ${locked} locked by standings.`;
                    s.style.color = 'var(--text-secondary)';
                }
            }
        }
        setTimeout(updateStructureSummary, 0);
    }

    function renderCombinations(card) {
        const title = document.createElement('h2');
        title.className = 'wizard-title';
        title.textContent = 'Lottery Combinations';
        card.appendChild(title);

        const subtitle = document.createElement('p');
        subtitle.className = 'wizard-subtitle';
        subtitle.textContent = 'Assign combination counts for each lottery-eligible team. Must sum to 1,000.';
        card.appendChild(subtitle);

        const helper = document.createElement('p');
        helper.className = 'wizard-field helper-text';
        helper.textContent = 'By-record teams need combinations because they participate in the lottery pool — if their number is drawn, they jump into a drawn pick slot.';
        card.appendChild(helper);

        const lotteryEligible = config.drawnPicks + config.byRecordPicks;
        const labels = generateTeamLabels(config.teamCount);
        const list = document.createElement('div');
        list.className = 'wizard-combo-list';

        for (let i = 0; i < lotteryEligible; i++) {
            const item = document.createElement('div');
            item.className = 'wizard-combo-item';

            const label = document.createElement('label');
            label.textContent = labels[i] + ':';

            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'wiz-combo';
            input.min = 1;
            input.max = 999;
            input.value = config.combinations[i] || '';
            input.dataset.index = i;
            input.addEventListener('input', updateComboTotal);

            item.appendChild(label);
            item.appendChild(input);
            list.appendChild(item);
        }
        card.appendChild(list);

        const totalDisplay = document.createElement('div');
        totalDisplay.className = 'wizard-combo-total';
        totalDisplay.id = 'comboTotal';
        card.appendChild(totalDisplay);

        function updateComboTotal() {
            const inputs = card.querySelectorAll('.wiz-combo');
            let sum = 0;
            inputs.forEach(inp => { sum += parseInt(inp.value) || 0; });
            const el = document.getElementById('comboTotal');
            if (el) {
                el.textContent = `Total: ${sum} / 1,000`;
                el.className = 'wizard-combo-total ' + (sum === 1000 ? 'valid' : 'invalid');
            }
        }
        setTimeout(updateComboTotal, 0);
    }

    function renderDraftRounds(card) {
        const title = document.createElement('h2');
        title.className = 'wizard-title';
        title.textContent = 'Draft Rounds';
        card.appendChild(title);

        const subtitle = document.createElement('p');
        subtitle.className = 'wizard-subtitle';
        subtitle.textContent = 'How many rounds in your draft?';
        card.appendChild(subtitle);

        const field = document.createElement('div');
        field.className = 'wizard-field';
        const input = document.createElement('input');
        input.type = 'number';
        input.id = 'wizRounds';
        input.min = 1;
        input.max = 10;
        input.value = config.rounds || 3;
        field.appendChild(input);
        card.appendChild(field);
    }

    function validateStep() {
        switch (currentStep) {
            case 0: {
                const name = document.getElementById('wizLeagueName')?.value.trim();
                if (!name) { showToast('Please enter a league name.'); return false; }
                config.leagueName = name;
                return true;
            }
            case 1: {
                const count = parseInt(document.getElementById('wizTeamCount')?.value);
                if (!count || count < 4 || count > 20) { showToast('Team count must be between 4 and 20.'); return false; }
                const oldCount = config.teamCount;
                config.teamCount = count;
                // Trim or expand team names array
                if (config.teamNames.length > count) config.teamNames = config.teamNames.slice(0, count);
                // Adjust drawn/byRecord if they exceed new count
                if (config.drawnPicks + config.byRecordPicks > count) {
                    config.drawnPicks = Math.min(config.drawnPicks, count);
                    config.byRecordPicks = Math.min(config.byRecordPicks, count - config.drawnPicks);
                }
                return true;
            }
            case 2: {
                const inputs = document.querySelectorAll('.wiz-team-name');
                const names = [];
                const seen = new Set();
                for (const inp of inputs) {
                    const val = inp.value.trim();
                    if (!val) { showToast('Please enter a name for every team.'); return false; }
                    if (seen.has(val.toLowerCase())) { showToast('Each team name must be unique.'); return false; }
                    seen.add(val.toLowerCase());
                    names.push(val);
                }
                config.teamNames = names;
                return true;
            }
            case 3: {
                const drawn = parseInt(document.getElementById('wizDrawnPicks')?.value);
                const byRecord = parseInt(document.getElementById('wizByRecordPicks')?.value);
                if (!drawn || drawn < 1) { showToast('At least 1 pick must be drawn by lottery.'); return false; }
                if (byRecord < 0 || isNaN(byRecord)) { showToast('By-record picks must be 0 or more.'); return false; }
                if (drawn + byRecord > config.teamCount) { showToast('Drawn + by-record cannot exceed team count.'); return false; }
                config.drawnPicks = drawn;
                config.byRecordPicks = byRecord;
                // Trim combinations if lottery-eligible count changed
                const eligible = drawn + byRecord;
                if (config.combinations.length > eligible) {
                    config.combinations = config.combinations.slice(0, eligible);
                }
                return true;
            }
            case 4: {
                const inputs = document.querySelectorAll('.wiz-combo');
                const combos = [];
                let sum = 0;
                for (const inp of inputs) {
                    const val = parseInt(inp.value);
                    if (!val || val < 1) { showToast('Each team must have at least 1 combination.'); return false; }
                    if (!Number.isInteger(val)) { showToast('Combinations must be whole numbers.'); return false; }
                    combos.push(val);
                    sum += val;
                }
                if (sum !== 1000) { showToast(`Combinations must sum to 1,000. Current total: ${sum}.`); return false; }
                config.combinations = combos;
                return true;
            }
            case 5: {
                const rounds = parseInt(document.getElementById('wizRounds')?.value);
                if (!rounds || rounds < 1 || rounds > 10) { showToast('Rounds must be between 1 and 10.'); return false; }
                config.rounds = rounds;
                return true;
            }
        }
        return true;
    }

    function finishWizard() {
        // Clear runtime state when (re)configuring
        localStorage.removeItem(LS_KEY_TEAM_NAMES);
        localStorage.removeItem(LS_KEY_TEAMS_LOCKED);
        localStorage.removeItem(LS_KEY_PICK_OWNERSHIP_LOCKED);
        localStorage.removeItem(LS_KEY_PICK_OWNERSHIP);

        saveLeagueConfig(config);
        overlay.style.display = 'none';
        document.querySelector('.container').style.display = '';
        initApp();
    }

    render();
}
```

- [ ] **Step 4: Commit**

```bash
git add js/lottery.js index.html styles/main.css
git commit -m "Add setup wizard with 6-step configuration flow"
```

---

## Task 5: Refactor localStorage Functions

**Files:**
- Modify: `c:\Users\lucas\dev\fantasy-draft-lottery-simulator\js\lottery.js`

Update the existing localStorage load/save functions to use dynamic team/round counts from `leagueConfig`.

- [ ] **Step 1: Update loadSavedPickOwnership and related functions**

Replace the hardcoded `3` and `10` values:

In `loadSavedPickOwnership()`:
- Replace `parsedOwnership.length !== 3` with `parsedOwnership.length !== leagueConfig.rounds`
- Replace `for (let round = 0; round < 3; round++)` with `for (let round = 0; round < leagueConfig.rounds; round++)`
- Replace `for (let pick = 0; pick < 10; pick++)` with `for (let pick = 0; pick < leagueConfig.teamCount; pick++)`
- Replace `val > 9` with `val > leagueConfig.teamCount - 1`

- [ ] **Step 2: Commit**

```bash
git add js/lottery.js
git commit -m "Make localStorage functions config-driven"
```

---

## Task 6: Refactor Team Inputs to Text Fields

**Files:**
- Modify: `c:\Users\lucas\dev\fantasy-draft-lottery-simulator\js\lottery.js`

- [ ] **Step 1: Replace createTeamInputs() with text input version**

Replace the existing `createTeamInputs()` function. Change `<select>` dropdowns to `<input type="text">` fields. Use `generateTeamLabels(leagueConfig.teamCount)` for labels. Pre-fill from config team names.

Key changes:
- Replace `select` element creation with `input type="text"`
- Remove `TEAM_NAME_OPTIONS` iteration
- Use `leagueConfig.teamCount` instead of hardcoded 10
- Labels from `generateTeamLabels()`

- [ ] **Step 2: Update validateTeamSelections()**

Change `document.querySelectorAll('.team-input-row select')` to `document.querySelectorAll('.team-input-row input')`.

- [ ] **Step 3: Update lockTeams()**

Change `select` references to `input` references. Update the selector.

- [ ] **Step 4: Update applyTeamLockState()**

Change `document.querySelectorAll('.team-input-row select')` to `document.querySelectorAll('.team-input-row input')`.

- [ ] **Step 5: Update runLottery() team name reading**

Line 769: change `document.querySelectorAll('.team-input-row select')` to `document.querySelectorAll('.team-input-row input')`.

- [ ] **Step 6: Commit**

```bash
git add js/lottery.js
git commit -m "Replace team select dropdowns with text inputs"
```

---

## Task 7: Refactor Odds Table

**Files:**
- Modify: `c:\Users\lucas\dev\fantasy-draft-lottery-simulator\js\lottery.js`
- Modify: `c:\Users\lucas\dev\fantasy-draft-lottery-simulator\index.html`

- [ ] **Step 1: Remove static thead from index.html**

Remove lines 32-41 (the static `<thead>` with Team/1st/2nd/.../6th headers). Replace the `<table>` block with:

```html
<table class="odds-table" id="oddsTable">
    <!-- thead and tbody generated by JavaScript -->
</table>
```

Update the caption text (line 29) to:

```html
<p class="odds-table-caption">Odds computed from your configured lottery combinations.</p>
```

- [ ] **Step 2: Rewrite refreshOddsTableBody()**

Replace the existing function to generate both thead and tbody dynamically:

```javascript
function refreshOddsTableBody() {
    const table = document.getElementById('oddsTable');
    if (!table || !leagueConfig) return;
    table.innerHTML = '';

    const lotteryEligible = leagueConfig.drawnPicks + leagueConfig.byRecordPicks;
    const labels = generateTeamLabels(leagueConfig.teamCount);

    // thead
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const teamTh = document.createElement('th');
    teamTh.textContent = 'Team';
    headerRow.appendChild(teamTh);
    for (let i = 0; i < lotteryEligible; i++) {
        const th = document.createElement('th');
        th.textContent = formatOrdinal(i + 1);
        headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // tbody
    const tbody = document.createElement('tbody');
    tbody.id = 'oddsTableBody';
    for (let t = 0; t < lotteryEligible; t++) {
        const row = document.createElement('tr');
        const teamCell = document.createElement('td');
        teamCell.textContent = labels[t];
        row.appendChild(teamCell);
        const teamOdds = leagueConfig.odds[t] || [];
        for (let p = 0; p < lotteryEligible; p++) {
            const cell = document.createElement('td');
            const val = teamOdds[p];
            cell.textContent = typeof val === 'number' ? `${val.toFixed(1)}%` : '0.0%';
            row.appendChild(cell);
        }
        tbody.appendChild(row);
    }
    table.appendChild(tbody);
}
```

- [ ] **Step 3: Commit**

```bash
git add js/lottery.js index.html
git commit -m "Make odds table fully dynamic from config"
```

---

## Task 8: Refactor Pick Ownership Table

**Files:**
- Modify: `c:\Users\lucas\dev\fantasy-draft-lottery-simulator\js\lottery.js`
- Modify: `c:\Users\lucas\dev\fantasy-draft-lottery-simulator\index.html`

- [ ] **Step 1: Update createPickOwnershipTable()**

Replace hardcoded `3` (rounds) with `leagueConfig.rounds` and `10` (teams) with `leagueConfig.teamCount`:
- `for (let round = 0; round < 3; round++)` → `for (let round = 0; round < leagueConfig.rounds; round++)`
- `for (let pick = 0; pick < 10; pick++)` → `for (let pick = 0; pick < leagueConfig.teamCount; pick++)`
- `round * 10 + pick + 1` → `round * leagueConfig.teamCount + pick + 1`

- [ ] **Step 2: Update the section description in index.html**

Change the pick ownership description from "all 3 rounds" to dynamic text. Replace line 52:

```html
<p class="section-description" id="pickOwnershipDesc">Specify which team owns each pick for each round of the draft.</p>
```

- [ ] **Step 3: Commit**

```bash
git add js/lottery.js index.html
git commit -m "Make pick ownership table dynamic for rounds and teams"
```

---

## Task 9: Refactor Lottery Engine

**Files:**
- Modify: `c:\Users\lucas\dev\fantasy-draft-lottery-simulator\js\lottery.js`

- [ ] **Step 1: Refactor runQuickLottery()**

Replace hardcoded values:
- `teams.slice(0, 6)` → `teams.slice(0, leagueConfig.drawnPicks + leagueConfig.byRecordPicks)`
- `new Array(10)` → `new Array(leagueConfig.teamCount)`
- `for (let pick = 0; pick < 4; pick++)` → `for (let pick = 0; pick < leagueConfig.drawnPicks; pick++)`
- `for (let i = 0; i < 6; i++)` → `for (let i = 0; i < lotteryEligible; i++)` where `lotteryEligible = leagueConfig.drawnPicks + leagueConfig.byRecordPicks`
- `for (let i = 6; i < 10; i++)` → `for (let i = lotteryEligible; i < leagueConfig.teamCount; i++)`

- [ ] **Step 2: Refactor analyzeLotteryJumps()**

Replace:
- `TOP_FOUR_SEED_MAX = 3` → `const drawnSeedMax = leagueConfig.drawnPicks - 1`
- `index < 4` → `index < leagueConfig.drawnPicks`
- `index === 4 || index === 5` → `index >= leagueConfig.drawnPicks && index < leagueConfig.drawnPicks + leagueConfig.byRecordPicks`
- Update text strings: "Top 4" → `Top ${leagueConfig.drawnPicks}`

- [ ] **Step 3: Commit**

```bash
git add js/lottery.js
git commit -m "Parameterize lottery engine for configurable structure"
```

---

## Task 10: Refactor Draft Order and Downloads

**Files:**
- Modify: `c:\Users\lucas\dev\fantasy-draft-lottery-simulator\js\lottery.js`

- [ ] **Step 1: Update getFullDraftOrderData()**

Replace:
- `for (let round = 0; round < 3; round++)` → `for (let round = 0; round < leagueConfig.rounds; round++)`
- `for (let pick = 0; pick < 10; pick++)` → `for (let pick = 0; pick < leagueConfig.teamCount; pick++)`

- [ ] **Step 2: Update updateFullDraftOrder()**

Same loop changes. Also update `round * 10 + pick + 1` → `round * leagueConfig.teamCount + pick + 1`.

- [ ] **Step 3: Update downloadFullDraftOrder()**

Replace `i % 10` with `i % leagueConfig.teamCount`. Update filename:
```javascript
a.download = `${sanitizeFilename(leagueConfig.leagueName)}-draft-order-full.txt`;
```

- [ ] **Step 4: Update downloadOriginalTop10()**

Replace `10` with `leagueConfig.teamCount` in the loop. Update header text and filename:
```javascript
const lines = [`Round 1 – original lottery order (before trades)`, ''];
for (let i = 0; i < leagueConfig.teamCount && i < lotteryResults.length; i++) {
```
```javascript
a.download = `${sanitizeFilename(leagueConfig.leagueName)}-lottery-results.txt`;
```

- [ ] **Step 5: Update updateResultsDiv()**

Replace `i >= 6` with `i >= leagueConfig.drawnPicks + leagueConfig.byRecordPicks`.

- [ ] **Step 6: Commit**

```bash
git add js/lottery.js
git commit -m "Make draft order, downloads, and results config-driven"
```

---

## Task 11: Refactor Reveal Animation

**Files:**
- Modify: `c:\Users\lucas\dev\fantasy-draft-lottery-simulator\js\lottery.js`

This is the most complex refactor — the reveal phases must scale dynamically.

- [ ] **Step 1: Update the modal title**

Line 821: Replace hardcoded league name:
```javascript
title.textContent = `${leagueConfig.leagueName} Draft Lottery (Magic Number: ${magicNumber})`;
```

- [ ] **Step 2: Update quick iterations podium**

Replace `[2, 1, 0].forEach(...)` with dynamic podium count:
```javascript
const quickPodiumCount = Math.min(leagueConfig.drawnPicks, 3);
const quickPositions = [];
// Build in display order: e.g., for 3: [2, 0, 1] (third, first, second) — standard podium order
if (quickPodiumCount >= 3) quickPositions.push(2);
if (quickPodiumCount >= 1) quickPositions.push(0);
if (quickPodiumCount >= 2) quickPositions.push(1);
```
Use `quickPositions` instead of `[2, 1, 0]`.

- [ ] **Step 3: Refactor revealAutomaticPicks()**

Replace hardcoded values:
- `'Picks 10 through 5'` → `` `Picks ${leagueConfig.teamCount} through ${leagueConfig.drawnPicks + 1}` ``
- `let currentIndex = 9` → `let currentIndex = leagueConfig.teamCount - 1`
- `currentIndex >= 4` → `currentIndex >= leagueConfig.drawnPicks`
- `currentIndex >= 6` → `currentIndex >= leagueConfig.drawnPicks + leagueConfig.byRecordPicks`
- `'Reveal Top 4 Picks'` → `` `Reveal Top ${Math.min(leagueConfig.drawnPicks, 6)} Picks` ``

Handle edge case: if `lockedPicks + byRecordPicks === 0`, skip directly to podium reveal.

- [ ] **Step 4: Refactor revealTopFour() → revealTopPicks()**

Rename function. Make it work for any `drawnPicks` count:

- Determine podium count: `const podiumCount = Math.min(leagueConfig.drawnPicks, 6)`
- If `drawnPicks > 6`: reveal picks 7..drawnPicks in automatic-picks style first, then podium for top 6
- Generate positions array dynamically instead of hardcoded 4 entries:
```javascript
const positions = [];
for (let i = podiumCount - 1; i >= 0; i--) {
    positions.push({ order: positions.length, position: i, cssClass: `pos-${i + 1}` });
}
// Swap last two so #1 is revealed second-to-last (penultimate drama)
if (positions.length >= 3) {
    const len = positions.length;
    [positions[len - 2], positions[len - 1]] = [positions[len - 1], positions[len - 2]];
}
```
- Generate podium placeholders dynamically
- Replace hardcoded `pickLabels` and `colorClasses` with dynamic generation
- Podium heights via inline styles: `height: calc(${baseHeight} * ${1 - 0.1 * position})` with a floor of 40%
- Update header text: `Top ${podiumCount} Draft Picks`

- [ ] **Step 5: Handle 1 drawn pick edge case**

If `drawnPicks === 1`: skip podium, just reveal as a single hero card with gold styling.

- [ ] **Step 6: Commit**

```bash
git add js/lottery.js
git commit -m "Scale reveal animation for dynamic drawn pick counts"
```

---

## Task 12: Refactor HTML and Update Branding

**Files:**
- Modify: `c:\Users\lucas\dev\fantasy-draft-lottery-simulator\index.html`

- [ ] **Step 1: Update header and title**

Replace:
```html
<title>The People's Dynasty League - Draft Lottery</title>
```
with:
```html
<title>Fantasy Draft Lottery Simulator</title>
```

Replace:
```html
<h1>The People's Dynasty League</h1>
<p class="subtitle">Fantasy NBA Draft Lottery Simulator</p>
```
with:
```html
<h1 id="leagueTitle">Fantasy Draft Lottery</h1>
<p class="subtitle" id="leagueSubtitle">Configure your league to get started</p>
```

- [ ] **Step 2: Update draft order section description**

Replace line 82:
```html
<p class="section-description">The complete 3-round draft order appears here after running the lottery. Download the full order (with trades) or the original top 10 (lottery result only).</p>
```
with:
```html
<p class="section-description" id="draftOrderDesc">The complete draft order appears here after running the lottery.</p>
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Update HTML to generic branding with dynamic elements"
```

---

## Task 13: Update Initialization and App Flow

**Files:**
- Modify: `c:\Users\lucas\dev\fantasy-draft-lottery-simulator\js\lottery.js`
- Modify: `c:\Users\lucas\dev\fantasy-draft-lottery-simulator\index.html`

- [ ] **Step 1: Create initApp() function**

Replace the existing `DOMContentLoaded` listener at the bottom of lottery.js:

```javascript
function initApp() {
    if (!leagueConfig) return;
    initStateFromConfig();
    applyChancesToTeams();
    loadTeamLockState();
    loadPickOwnershipLockState();
    loadSavedTeamNames();

    // Update dynamic header elements
    const titleEl = document.getElementById('leagueTitle');
    if (titleEl) titleEl.textContent = leagueConfig.leagueName;
    const subtitleEl = document.getElementById('leagueSubtitle');
    if (subtitleEl) subtitleEl.textContent = 'Draft Lottery Simulator';
    document.title = `${leagueConfig.leagueName} - Draft Lottery`;

    createTeamInputs();
    applyTeamLockState();
    refreshOddsTableBody();
    loadSavedPickOwnership();
    createPickOwnershipTable();
    applyLotteryButtonState();

    const draftOrderSection = document.querySelector('.draft-order-section');
    if (draftOrderSection) draftOrderSection.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', function() {
    leagueConfig = loadLeagueConfig();

    if (!leagueConfig) {
        showSetupWizard(null);
    } else {
        document.getElementById('setupWizard').style.display = 'none';
        initApp();
    }
});

window.runLottery = runLottery;
```

- [ ] **Step 2: Update the inline script in index.html**

Update the reset button handler and add reconfigure button handler:

```html
<script>
    document.addEventListener('DOMContentLoaded', function() {
        const button = document.getElementById('lotteryButton');
        if (button) button.addEventListener('click', runLottery);

        const resetBtn = document.getElementById('resetButton');
        if (resetBtn) resetBtn.addEventListener('click', function() {
            if (confirm('This will clear all saved data and league configuration. Continue?')) {
                localStorage.clear();
                location.reload();
            }
        });

        const reconfigBtn = document.getElementById('reconfigureBtn');
        if (reconfigBtn) reconfigBtn.addEventListener('click', function() {
            const currentConfig = loadLeagueConfig();
            showSetupWizard(currentConfig);
        });
    });
</script>
```

- [ ] **Step 3: Commit**

```bash
git add js/lottery.js index.html
git commit -m "Wire up initialization flow with config check and wizard"
```

---

## Task 14: Add Dynamic CSS for Variable Layouts

**Files:**
- Modify: `c:\Users\lucas\dev\fantasy-draft-lottery-simulator\styles\main.css`

- [ ] **Step 1: Update team inputs grid**

Find the `.team-inputs` grid CSS and replace fixed 4-column layout with:
```css
.team-inputs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: var(--space-md);
}
```

- [ ] **Step 2: Update draft round grid**

Find `.full-draft-order` grid and make it dynamic. Instead of hardcoded 3-column, use auto-fill based on round count.

- [ ] **Step 3: Add podium dynamic height support**

Add CSS custom property support for podium heights that can be set by JS:
```css
.top-podium-place {
    height: var(--podium-height, 200px);
}
```

- [ ] **Step 4: Commit**

```bash
git add styles/main.css
git commit -m "Add dynamic CSS grids and podium scaling"
```

---

## Task 15: Create GitHub Repo and Deploy

**Files:**
- All files in `c:\Users\lucas\dev\fantasy-draft-lottery-simulator\`

- [ ] **Step 1: Create GitHub repo**

```bash
cd c:/Users/lucas/dev/fantasy-draft-lottery-simulator
gh repo create fantasy-draft-lottery-simulator --public --source=. --push
```

- [ ] **Step 2: Verify deployment**

Check that GitHub Pages is set up and the site is deployed:
```bash
gh repo view fantasy-draft-lottery-simulator --web
```

- [ ] **Step 3: Commit any final fixes**

If deployment needs adjustments, fix and push.

---

## Task 16: End-to-End Verification

- [ ] **Step 1: Test wizard flow** — Open in browser with empty localStorage. Complete all 6 wizard steps. Verify main page loads.

- [ ] **Step 2: Verify odds accuracy** — Configure with original 10-team setup (combinations [224,224,224,224,60,45], 4 drawn, 2 by-record). Compare computed odds against original hardcoded table. Must match within 0.1%.

- [ ] **Step 3: Test various configs** — Test with 4, 6, 8, 12, and 20 teams. Verify correct pick counts.

- [ ] **Step 4: Test edge cases** — Single drawn pick. All picks drawn (drawnPicks = teamCount). Zero by-record picks. Equal combinations (4×250 for a 4-team league).

- [ ] **Step 5: Test pick ownership** — Verify table renders correct rounds × teams. Make trades, verify they persist.

- [ ] **Step 6: Test exports** — Download draft order. Verify filename includes league name. Verify format is correct.

- [ ] **Step 7: Test reconfigure** — Click reconfigure. Verify wizard pre-fills. Change config. Save. Verify main page updates.

- [ ] **Step 8: Test lottery reveal** — Run lottery with various drawn pick counts. Verify podium scales. Verify automatic picks phase adapts.

- [ ] **Step 9: Test responsive** — Check mobile viewport sizes with various team counts.

- [ ] **Step 10: Test accessibility** — Tab through wizard and main page. Verify focus management in modal.
