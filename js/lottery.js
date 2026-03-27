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
const LS_KEY_HISTORY = 'lotteryHistory';

// ============================================
// NBA WEIGHT PRESETS (for auto-generate)
// ============================================

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

// ============================================
// LEAGUE PRESETS
// ============================================

const LEAGUE_PRESETS = [
    {
        id: 'fantasy_football',
        icon: '🏈',
        sport: 'Fantasy Football',
        tagline: '12 teams · 15 rounds · Snake draft',
        config: {
            leagueName: 'Fantasy Football League',
            teamCount: 12,
            teamNames: [
                'Hail Marys', 'Fumble Bros', 'Gridiron Gods', 'Blitz Brigade',
                'End Zone Elites', 'Pocket Rockets', 'First & Ten', 'Pigskin Posse',
                'Touchdown Tyrants', 'Fantasy Phenoms', 'The Destroyers', 'Smash FC',
            ],
            drawnPicks: 4,
            byRecordPicks: 8,
            combinations: generateWeights(12),
            rounds: 15,
            draftFormat: 'snake',
            floorPicks: 2,
        }
    },
    {
        id: 'fantasy_basketball',
        icon: '🏀',
        sport: 'Fantasy Basketball',
        tagline: '10 teams · 13 rounds · Snake draft',
        config: {
            leagueName: 'Fantasy Basketball League',
            teamCount: 10,
            teamNames: [
                'Hoop Dreams', 'Rim Wreckers', 'Splash Zone', 'Dunk Dynasty',
                'Full Court Press', 'Paint Monsters', 'Fast Break Kings',
                '3-Point Assassins', 'The Buckets', 'Bball Ballers',
            ],
            drawnPicks: 3,
            byRecordPicks: 7,
            combinations: generateWeights(10),
            rounds: 13,
            draftFormat: 'snake',
            floorPicks: 0,
        }
    },
    {
        id: 'fantasy_hockey',
        icon: '🏒',
        sport: 'Fantasy Hockey',
        tagline: '10 teams · 20 rounds · Snake draft',
        config: {
            leagueName: 'Fantasy Hockey League',
            teamCount: 10,
            teamNames: [
                'Ice Cold', 'Puck Wizards', 'Hat Trick Heroes', 'Chirp Kings',
                'Power Plays', 'Tendy Gang', 'The Snipes', 'Penalty Box',
                'Blue Liners', 'Biscuit Boys',
            ],
            drawnPicks: 3,
            byRecordPicks: 7,
            combinations: generateWeights(10),
            rounds: 20,
            draftFormat: 'snake',
            floorPicks: 0,
        }
    },
    {
        id: 'fantasy_baseball',
        icon: '⚾',
        sport: 'Fantasy Baseball',
        tagline: '12 teams · 23 rounds · Snake draft',
        config: {
            leagueName: 'Fantasy Baseball League',
            teamCount: 12,
            teamNames: [
                'Diamond Dogs', 'Bat Boys', 'Home Run Heroes', 'Curveball Kings',
                'Clutch Hitters', 'Grand Slammers', 'Bullpen Bombers', 'Extra Innings',
                'Ace Pitchers', 'Southpaw City', 'Walks & Balks', 'The Mudcats',
            ],
            drawnPicks: 4,
            byRecordPicks: 8,
            combinations: generateWeights(12),
            rounds: 23,
            draftFormat: 'snake',
            floorPicks: 0,
        }
    },
];

function showQuickStart() {
    const overlay = document.getElementById('setupWizard');
    if (!overlay) return;
    overlay.style.display = 'flex';
    document.querySelector('.container').style.display = 'none';
    overlay.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'wizard-card quickstart-card';

    const badge = document.createElement('div');
    badge.className = 'quickstart-badge';
    badge.textContent = 'Quick Start';
    card.appendChild(badge);

    const title = document.createElement('h1');
    title.className = 'quickstart-title';
    title.textContent = 'Try the Lottery Simulator';
    card.appendChild(title);

    const sub = document.createElement('p');
    sub.className = 'quickstart-sub';
    sub.textContent = 'Pick a fantasy sport to instantly load a demo league and run the lottery — no setup required.';
    card.appendChild(sub);

    const grid = document.createElement('div');
    grid.className = 'quickstart-grid';

    LEAGUE_PRESETS.forEach(preset => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'quickstart-preset-btn';

        const iconEl = document.createElement('span');
        iconEl.className = 'quickstart-icon';
        iconEl.textContent = preset.icon;

        const sportEl = document.createElement('strong');
        sportEl.textContent = preset.sport;

        const tagEl = document.createElement('span');
        tagEl.className = 'quickstart-tag';
        tagEl.textContent = preset.tagline;

        btn.appendChild(iconEl);
        btn.appendChild(sportEl);
        btn.appendChild(tagEl);

        btn.addEventListener('click', () => {
            const cfg = { ...preset.config };
            cfg.lockedPicks = cfg.teamCount - cfg.drawnPicks - cfg.byRecordPicks;
            cfg.odds = computeOdds(cfg.combinations, cfg.drawnPicks);
            safeSetItem(LS_KEY_LEAGUE_CONFIG, JSON.stringify(cfg));
            leagueConfig = cfg;
            // Clear any stale state
            localStorage.removeItem(LS_KEY_TEAM_NAMES);
            localStorage.removeItem(LS_KEY_TEAMS_LOCKED);
            localStorage.removeItem(LS_KEY_PICK_OWNERSHIP_LOCKED);
            localStorage.removeItem(LS_KEY_PICK_OWNERSHIP);
            overlay.style.display = 'none';
            document.querySelector('.container').style.display = '';
            initApp();
            showToast(`${preset.sport} demo loaded! Confirm teams to continue.`, 'success');
        });

        grid.appendChild(btn);
    });

    card.appendChild(grid);

    const divider = document.createElement('div');
    divider.className = 'quickstart-divider';
    divider.innerHTML = '<span>or</span>';
    card.appendChild(divider);

    const customBtn = document.createElement('button');
    customBtn.type = 'button';
    customBtn.className = 'quickstart-custom-btn';
    customBtn.textContent = 'Set Up My Own League →';
    customBtn.addEventListener('click', () => showSetupWizard(null));
    card.appendChild(customBtn);

    overlay.appendChild(card);
}

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
        if (!config.draftFormat) config.draftFormat = 'snake';
        if (config.floorPicks == null) config.floorPicks = 0;
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
    pickOwnership = Array(leagueConfig.rounds).fill(null).map(() =>
        Array(leagueConfig.teamCount).fill(null).map(() => null)
    );
}

function applyChancesToTeams() {
    currentChances.forEach((c, i) => { teams[i].chances = c; });
}

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
        rounds: 3,
        draftFormat: 'snake',
        floorPicks: 0
    };
    if (!config.draftFormat) config.draftFormat = 'snake';
    if (config.floorPicks == null) config.floorPicks = 0;

    // Snapshot structural values BEFORE any wizard mutations
    const oldTeamCount = config.teamCount;
    const oldDrawnPicks = config.drawnPicks;

    let currentStep = 0;
    const totalSteps = 7;

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
            renderLeagueName,       // 0
            renderTeamCount,        // 1
            renderTeamNames,        // 2
            renderLotteryStructure, // 3
            renderCombinations,     // 4
            renderDraftFormat,      // 5 (new)
            renderDraftRounds,      // 6 (was 5)
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

        // Floor picks field
        const floorField = document.createElement('div');
        floorField.className = 'wizard-field';
        floorField.style.marginTop = 'var(--space-md)';
        const floorLabel = document.createElement('label');
        floorLabel.setAttribute('for', 'wizFloor');
        floorLabel.innerHTML = 'Guaranteed Top-N Floor <span style="color:var(--text-secondary);font-size:0.8rem">(optional)</span>';
        const floorInput = document.createElement('input');
        floorInput.type = 'number';
        floorInput.id = 'wizFloor';
        floorInput.min = 0;
        floorInput.max = config.drawnPicks || 4;
        floorInput.value = config.floorPicks || 0;
        floorInput.style.width = '100%';
        const floorNote = document.createElement('p');
        floorNote.style.cssText = 'font-size:0.8rem;color:var(--text-secondary);margin-top:0.25rem;';
        floorNote.textContent = 'Worst N teams guaranteed to land in top N picks. Set 0 to disable.';
        floorField.appendChild(floorLabel);
        floorField.appendChild(floorInput);
        floorField.appendChild(floorNote);
        card.appendChild(floorField);

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
        const autoBtn = document.createElement('button');
        autoBtn.type = 'button';
        autoBtn.className = 'wizard-auto-btn';
        autoBtn.textContent = 'Auto-generate (NBA-style weights)';
        autoBtn.addEventListener('click', () => {
            const weights = generateWeights(lotteryEligible);
            const inputs = card.querySelectorAll('.wiz-combo');
            inputs.forEach((inp, i) => { inp.value = weights[i] || 0; });
            updateComboTotal();
        });
        card.appendChild(autoBtn);
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

    function renderDraftFormat(card) {
        const title = document.createElement('h2');
        title.className = 'wizard-title';
        title.textContent = 'Draft Format';
        card.appendChild(title);

        const subtitle = document.createElement('p');
        subtitle.className = 'wizard-subtitle';
        subtitle.textContent = 'How should pick order work after the lottery round?';
        card.appendChild(subtitle);

        const options = [
            { value: 'snake', label: 'Snake Draft', desc: 'Odd rounds go 1→N, even rounds go N→1. Most common format.' },
            { value: 'linear', label: 'Linear Draft', desc: 'Every round goes 1→N. Same order each round.' },
        ];

        const group = document.createElement('div');
        group.className = 'wizard-format-group';
        options.forEach(opt => {
            const label = document.createElement('label');
            label.className = 'wizard-format-card' + (config.draftFormat === opt.value ? ' selected' : '');
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'draftFormat';
            radio.value = opt.value;
            radio.checked = config.draftFormat === opt.value;
            radio.style.display = 'none';
            const labelText = document.createElement('strong');
            labelText.textContent = opt.label;
            const descText = document.createElement('p');
            descText.textContent = opt.desc;
            descText.style.margin = '0.25rem 0 0';
            descText.style.fontSize = '0.85rem';
            descText.style.color = 'var(--text-secondary)';
            label.appendChild(radio);
            label.appendChild(labelText);
            label.appendChild(descText);
            label.addEventListener('click', () => {
                card.querySelectorAll('.wizard-format-card').forEach(c => c.classList.remove('selected'));
                label.classList.add('selected');
                radio.checked = true;
            });
            group.appendChild(label);
        });
        card.appendChild(group);
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
                config.teamCount = count;
                if (config.teamNames.length > count) config.teamNames = config.teamNames.slice(0, count);
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
                const floor = parseInt(document.getElementById('wizFloor')?.value) || 0;
                config.floorPicks = Math.min(floor, drawn);
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
                const selected = document.querySelector('input[name="draftFormat"]:checked');
                if (!selected) { showToast('Please select a draft format.'); return false; }
                config.draftFormat = selected.value;
                return true;
            }
            case 6: {
                const rounds = parseInt(document.getElementById('wizRounds')?.value);
                if (!rounds || rounds < 1 || rounds > 10) { showToast('Rounds must be between 1 and 10.'); return false; }
                config.rounds = rounds;
                return true;
            }
        }
        return true;
    }

    function finishWizard() {
        const structureChanged = config.teamCount !== oldTeamCount || config.drawnPicks !== oldDrawnPicks;
        if (structureChanged) {
            localStorage.removeItem(LS_KEY_TEAM_NAMES);
            localStorage.removeItem(LS_KEY_TEAMS_LOCKED);
            localStorage.removeItem(LS_KEY_PICK_OWNERSHIP_LOCKED);
            localStorage.removeItem(LS_KEY_PICK_OWNERSHIP);
        }

        saveLeagueConfig(config);
        overlay.style.display = 'none';
        document.querySelector('.container').style.display = '';
        initApp();
    }

    render();
}

// ============================================
// TOAST NOTIFICATIONS (replaces alert())
// ============================================

function showToast(message, type = 'error') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        container.setAttribute('role', 'alert');
        container.setAttribute('aria-live', 'polite');
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3200);
}

// ============================================
// LOCAL STORAGE
// ============================================

function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        showToast('Unable to save — storage quota exceeded.', 'warning');
    }
}

function loadSavedTeamNames() {
    try {
        const savedTeams = localStorage.getItem(LS_KEY_TEAM_NAMES);
        if (!savedTeams) return;
        const teamNames = JSON.parse(savedTeams);
        if (!Array.isArray(teamNames)) return;
        teamNames.forEach((name, index) => {
            if (index < teams.length && name) {
                teams[index].name = name;
            }
        });
    } catch (e) {
        console.warn('Failed to load saved team names', e);
    }
}

function saveTeamNames() {
    const teamNames = teams.map(team => team.name);
    safeSetItem(LS_KEY_TEAM_NAMES, JSON.stringify(teamNames));
}

function loadTeamLockState() {
    try {
        teamsLocked = localStorage.getItem(LS_KEY_TEAMS_LOCKED) === 'true';
    } catch (error) {
        teamsLocked = false;
    }
}

function saveTeamLockState() {
    try {
        safeSetItem(LS_KEY_TEAMS_LOCKED, teamsLocked);
    } catch (error) {
        console.warn('Unable to save team lock state', error);
    }
}

function loadPickOwnershipLockState() {
    try {
        pickOwnershipLocked = localStorage.getItem(LS_KEY_PICK_OWNERSHIP_LOCKED) === 'true';
    } catch (error) {
        pickOwnershipLocked = false;
    }
}

function savePickOwnershipLockState() {
    try {
        safeSetItem(LS_KEY_PICK_OWNERSHIP_LOCKED, pickOwnershipLocked);
    } catch (error) {
        console.warn('Unable to save pick ownership lock state', error);
    }
}

function loadSavedPickOwnership() {
    try {
        const savedOwnership = localStorage.getItem(LS_KEY_PICK_OWNERSHIP);
        if (!savedOwnership) return;
        const parsedOwnership = JSON.parse(savedOwnership);
        if (!Array.isArray(parsedOwnership) || parsedOwnership.length !== leagueConfig.rounds) return;
        for (let round = 0; round < leagueConfig.rounds; round++) {
            if (!Array.isArray(parsedOwnership[round])) continue;
            for (let pick = 0; pick < leagueConfig.teamCount; pick++) {
                const val = parsedOwnership[round][pick];
                if (val !== null && (typeof val !== 'number' || val < 0 || val > leagueConfig.teamCount - 1)) continue;
                pickOwnership[round][pick] = val;
            }
        }
    } catch (e) {
        console.warn('Failed to load saved pick ownership', e);
    }
}

function savePickOwnership() {
    safeSetItem(LS_KEY_PICK_OWNERSHIP, JSON.stringify(pickOwnership));
}

// ============================================
// TEAM INPUTS
// ============================================

function createTeamInputs() {
    const teamInputsDiv = document.getElementById('teamInputs');
    if (!teamInputsDiv) return;

    loadSavedTeamNames();
    teamInputsDiv.innerHTML = '';

    const labels = generateTeamLabels(leagueConfig.teamCount);

    teams.forEach((team, index) => {
        const row = document.createElement('div');
        row.className = 'team-input-row';

        const label = document.createElement('label');
        label.textContent = `${labels[index] || `Team ${index + 1}`}:`;
        label.setAttribute('for', `team-input-${index}`);

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'team-name-input';
        input.id = `team-input-${index}`;
        input.setAttribute('aria-label', `Team name for ${labels[index]}`);
        input.value = team.name || leagueConfig.teamNames[index] || '';
        input.placeholder = leagueConfig.teamNames[index] || `Team ${index + 1}`;

        row.appendChild(label);
        row.appendChild(input);
        teamInputsDiv.appendChild(row);
    });

    addTeamConfirmControls(teamInputsDiv);
}

function addTeamConfirmControls(teamInputsDiv) {
    if (!teamInputsDiv) return;
    const parentSection = teamInputsDiv.parentElement;
    if (!parentSection || document.getElementById('confirmTeamOrder')) return;

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'team-input-actions';

    confirmTeamButton = document.createElement('button');
    confirmTeamButton.type = 'button';
    confirmTeamButton.id = 'confirmTeamOrder';
    confirmTeamButton.className = 'team-confirm-button';
    confirmTeamButton.addEventListener('click', handleConfirmTeamOrder);
    actionsDiv.appendChild(confirmTeamButton);

    const statusText = document.createElement('p');
    statusText.id = 'teamConfirmStatus';
    statusText.className = 'team-confirm-status';
    statusText.setAttribute('aria-live', 'polite');
    actionsDiv.appendChild(statusText);

    parentSection.appendChild(actionsDiv);
}

function applyTeamLockState() {
    const selects = document.querySelectorAll('.team-input-row input');
    selects.forEach(select => {
        select.disabled = teamsLocked;
    });

    if (confirmTeamButton) {
        confirmTeamButton.textContent = teamsLocked ? 'Edit Team Order' : 'Confirm Team Order';
        confirmTeamButton.classList.toggle('locked', teamsLocked);
    }

    const statusText = document.getElementById('teamConfirmStatus');
    if (statusText) {
        statusText.textContent = teamsLocked
            ? (pickOwnershipLocked
                ? 'Team order and pick ownership locked. You can run the lottery.'
                : 'Team order locked. Set pick ownership and confirm to run the lottery.')
            : 'Confirm the team order to manage pick ownership.';
        statusText.classList.toggle('locked', teamsLocked);
    }
    applyLotteryButtonState();
}

function handleConfirmTeamOrder() {
    if (teamsLocked) {
        unlockTeams();
        return;
    }
    if (!validateTeamSelections()) return;
    lockTeams();
}

function validateTeamSelections() {
    const selects = document.querySelectorAll('.team-input-row input');
    if (!selects.length) {
        showToast('No team inputs found.');
        return false;
    }

    const chosen = new Set();
    for (let i = 0; i < selects.length; i++) {
        const value = selects[i].value.trim();
        if (!value) {
            showToast('Please enter a name for every slot before confirming.');
            return false;
        }
        if (chosen.has(value.toLowerCase())) {
            showToast('Each team name can only be used once. Please ensure all names are unique.');
            return false;
        }
        chosen.add(value.toLowerCase());
    }
    return true;
}

// ============================================
// PROGRESS TRACKER & SECTION BADGES
// ============================================

function setBadge(sectionEl, text, cls) {
    if (!sectionEl) return;
    let badge = sectionEl.querySelector('.section-badge');
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'section-badge';
        const heading = sectionEl.querySelector('h2');
        if (heading) heading.appendChild(badge);
    }
    badge.textContent = text;
    badge.className = `section-badge ${cls}`;
}

function updateProgressTracker() {
    const tracker = document.getElementById('progressTracker');
    if (!tracker) return;
    tracker.innerHTML = '';

    const steps = [
        { label: 'Team Names', done: teamsLocked },
        { label: 'Pick Ownership', done: pickOwnershipLocked },
        { label: 'Run Lottery', done: !!lastLotteryResult },
    ];

    steps.forEach((step, i) => {
        const item = document.createElement('div');
        item.className = 'progress-step' + (step.done ? ' done' : '') + (i === steps.findIndex(s => !s.done) ? ' active' : '');
        const dot = document.createElement('span');
        dot.className = 'progress-dot';
        dot.textContent = step.done ? '✓' : (i + 1);
        const label = document.createElement('span');
        label.className = 'progress-label';
        label.textContent = step.label;
        item.appendChild(dot);
        item.appendChild(label);
        tracker.appendChild(item);

        if (i < steps.length - 1) {
            const line = document.createElement('div');
            line.className = 'progress-line' + (step.done ? ' done' : '');
            tracker.appendChild(line);
        }
    });
}

function updateSectionBadges() {
    const teamSection = document.querySelector('.team-inputs-section');
    const ownerSection = document.querySelector('.pick-ownership-section');

    if (teamsLocked) {
        setBadge(teamSection, 'Confirmed', 'badge-success');
    } else {
        setBadge(teamSection, 'Pending', 'badge-pending');
    }

    if (pickOwnershipLocked) {
        setBadge(ownerSection, 'Confirmed', 'badge-success');
    } else if (teamsLocked) {
        setBadge(ownerSection, 'Pending', 'badge-pending');
    } else {
        setBadge(ownerSection, 'Locked', 'badge-locked');
    }
}

function lockTeams() {
    const selects = document.querySelectorAll('.team-input-row input');
    selects.forEach((select, index) => {
        teams[index].name = select.value.trim() || leagueConfig.teamNames[index] || `Team ${index + 1}`;
    });

    saveTeamNames();
    teamsLocked = true;
    saveTeamLockState();
    applyTeamLockState();
    createPickOwnershipTable();
    updateProgressTracker();
    updateSectionBadges();
}

function unlockTeams() {
    teamsLocked = false;
    pickOwnershipLocked = false;
    saveTeamLockState();
    savePickOwnershipLockState();
    // Clear stale pick ownership data so indices don't mismatch after team rename
    localStorage.removeItem(LS_KEY_PICK_OWNERSHIP);
    pickOwnership = Array(leagueConfig.rounds).fill(null).map(() =>
        Array(leagueConfig.teamCount).fill(null).map(() => null)
    );
    applyTeamLockState();
    createPickOwnershipTable();
    updateProgressTracker();
    updateSectionBadges();
}

function lockPickOwnership() {
    // Validate all picks are assigned before locking
    for (let r = 0; r < pickOwnership.length; r++) {
        for (let p = 0; p < pickOwnership[r].length; p++) {
            if (pickOwnership[r][p] == null) {
                showToast('All picks must be assigned before locking.', 'error');
                return;
            }
        }
    }
    pickOwnershipLocked = true;
    savePickOwnershipLockState();
    createPickOwnershipTable();
    applyTeamLockState();
    updateProgressTracker();
    updateSectionBadges();
}

function unlockPickOwnership() {
    pickOwnershipLocked = false;
    savePickOwnershipLockState();
    createPickOwnershipTable();
    applyTeamLockState();
    updateProgressTracker();
    updateSectionBadges();
}

function applyLotteryButtonState() {
    const btn = document.getElementById('lotteryButton');
    if (!btn) return;
    const canRun = teamsLocked && pickOwnershipLocked;
    btn.disabled = !canRun;
    btn.title = canRun ? '' : (teamsLocked ? 'Confirm pick ownership to run the lottery.' : 'Confirm team order and pick ownership first.');
}

// ============================================
// ODDS TABLE
// ============================================

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

    // Build flat array of all odds values for heatmap scaling
    const allVals = [];
    for (let t = 0; t < lotteryEligible; t++) {
        const teamOdds = leagueConfig.odds[t] || [];
        for (let p = 0; p < lotteryEligible; p++) {
            const v = teamOdds[p];
            if (typeof v === 'number' && v > 0) allVals.push(v);
        }
    }
    const maxVal = allVals.length ? Math.max(...allVals) : 100;

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
            if (typeof val === 'number' && val > 0) {
                const intensity = Math.round((val / maxVal) * 100);
                cell.style.background = `rgba(59,130,246,${(intensity * 0.008).toFixed(3)})`;
                if (intensity > 60) cell.style.color = '#fff';
            }
            row.appendChild(cell);
        }
        tbody.appendChild(row);
    }
    table.appendChild(tbody);
}

function createOddsTable() {
    refreshOddsTableBody();
}

// ============================================
// PICK OWNERSHIP TABLE
// ============================================

function createPickOwnershipTable() {
    const tableContainer = document.getElementById('pickOwnershipTable');
    if (!tableContainer) return;

    tableContainer.innerHTML = '';

    if (!teamsLocked) {
        const placeholder = document.createElement('div');
        placeholder.className = 'pick-ownership-placeholder';
        placeholder.textContent = 'Confirm the team order to manage pick ownership.';
        tableContainer.appendChild(placeholder);
        const actionsContainer = document.getElementById('pickOwnershipActions');
        if (actionsContainer) {
            actionsContainer.innerHTML = '';
            actionsContainer.style.display = 'none';
        }
        return;
    }

    const table = document.createElement('table');
    table.className = 'pick-ownership-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    ['Pick', 'Original Team', 'Owned By'].forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        th.setAttribute('scope', 'col');
        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    for (let round = 0; round < leagueConfig.rounds; round++) {
        const roundHeaderRow = document.createElement('tr');
        roundHeaderRow.className = 'round-header';
        const roundHeaderCell = document.createElement('td');
        roundHeaderCell.colSpan = 3;
        roundHeaderCell.textContent = `Round ${round + 1}`;
        roundHeaderRow.appendChild(roundHeaderCell);
        tbody.appendChild(roundHeaderRow);

        for (let pick = 0; pick < leagueConfig.teamCount; pick++) {
            const row = document.createElement('tr');

            const pickCell = document.createElement('td');
            pickCell.textContent = round * leagueConfig.teamCount + pick + 1;
            row.appendChild(pickCell);

            const originalTeamCell = document.createElement('td');
            originalTeamCell.textContent = teams[pick].name;
            originalTeamCell.dataset.teamIndex = pick;
            originalTeamCell.className = 'original-team-cell';
            row.appendChild(originalTeamCell);

            const ownerCell = document.createElement('td');
            const ownerSelect = document.createElement('select');
            ownerSelect.setAttribute('aria-label', `Owner of pick ${round * leagueConfig.teamCount + pick + 1}`);

            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = 'Select Team';
            ownerSelect.appendChild(defaultOption);

            teams.forEach((team, teamIndex) => {
                const option = document.createElement('option');
                option.value = teamIndex;
                option.textContent = team.name;
                if (pickOwnership[round][pick] === teamIndex) {
                    option.selected = true;
                }
                ownerSelect.appendChild(option);
            });

            ownerSelect.disabled = pickOwnershipLocked;
            ownerSelect.addEventListener('change', function() {
                const selectedTeamIndex = this.value === '' ? null : parseInt(this.value, 10);
                pickOwnership[round][pick] = selectedTeamIndex;
                savePickOwnership();
            });

            ownerCell.appendChild(ownerSelect);
            row.appendChild(ownerCell);
            tbody.appendChild(row);
        }
    }

    table.appendChild(tbody);
    tableContainer.appendChild(table);

    // Confirm / Edit Pick Ownership button
    const actionsContainer = document.getElementById('pickOwnershipActions');
    if (actionsContainer) {
        actionsContainer.style.display = '';
        actionsContainer.innerHTML = '';

        confirmPickOwnershipButton = document.createElement('button');
        confirmPickOwnershipButton.type = 'button';
        confirmPickOwnershipButton.id = 'confirmPickOwnership';
        confirmPickOwnershipButton.className = 'team-confirm-button';
        confirmPickOwnershipButton.textContent = pickOwnershipLocked ? 'Edit Pick Ownership' : 'Confirm Pick Ownership';
        confirmPickOwnershipButton.classList.toggle('locked', pickOwnershipLocked);
        confirmPickOwnershipButton.addEventListener('click', () => {
            if (pickOwnershipLocked) unlockPickOwnership();
            else lockPickOwnership();
        });

        const statusText = document.createElement('p');
        statusText.id = 'pickOwnershipStatus';
        statusText.className = 'team-confirm-status';
        statusText.setAttribute('aria-live', 'polite');
        statusText.classList.toggle('locked', pickOwnershipLocked);
        statusText.textContent = pickOwnershipLocked
            ? 'Pick ownership locked. You can run the lottery.'
            : 'Confirm pick ownership to run the lottery.';

        actionsContainer.appendChild(confirmPickOwnershipButton);
        actionsContainer.appendChild(statusText);
    }
}

// ============================================
// LOTTERY LOGIC
// ============================================

function floorSatisfied(drawnTeams) {
    const floor = leagueConfig.floorPicks || 0;
    if (!floor) return true;
    // Each of the worst `floor` teams must land in the top `floor` picks
    for (let i = 0; i < floor; i++) {
        if (!drawnTeams.slice(0, floor).some(t => t.originalIndex === i)) return false;
    }
    return true;
}

function runQuickLottery() {
    const lotteryEligible = leagueConfig.drawnPicks + leagueConfig.byRecordPicks;
    const lotteryTeams = teams.slice(0, lotteryEligible).map((team, index) => ({
        ...team,
        originalIndex: index
    }));

    const MAX_ATTEMPTS = 500;
    let attempt = 0;
    let drawnTeams;
    let discardedRedraws = 0;

    do {
        const drawnIndices = new Set();
        drawnTeams = [];
        let redraws = 0;

        for (let pick = 0; pick < leagueConfig.drawnPicks; pick++) {
            while (true) {
                const r = Math.random() * TOTAL_POOL;
                if (r >= ASSIGNED) { redraws++; continue; }

                let cumulative = 0;
                let hitTeam = null;
                for (let i = 0; i < lotteryTeams.length; i++) {
                    cumulative += lotteryTeams[i].chances;
                    if (r < cumulative) { hitTeam = lotteryTeams[i]; break; }
                }

                if (drawnIndices.has(hitTeam.originalIndex)) { continue; }

                drawnIndices.add(hitTeam.originalIndex);
                drawnTeams.push(hitTeam);
                break;
            }
        }

        discardedRedraws = redraws;
        attempt++;
    } while (!floorSatisfied(drawnTeams) && attempt < MAX_ATTEMPTS);

    const drawnIndices = new Set(drawnTeams.map(t => t.originalIndex));
    const remaining = lotteryTeams.filter(t => !drawnIndices.has(t.originalIndex));
    remaining.sort((a, b) => a.originalIndex - b.originalIndex);

    const results = new Array(leagueConfig.teamCount);
    const lotteryPicks = [...drawnTeams, ...remaining];
    for (let i = 0; i < lotteryEligible; i++) results[i] = lotteryPicks[i];
    for (let i = lotteryEligible; i < leagueConfig.teamCount; i++) results[i] = teams[i];

    const mapped = results.map(team => {
        const teamIndex = typeof team.originalIndex === 'number'
            ? team.originalIndex
            : teams.findIndex(t => t.name === team.name);
        return { name: team.name, chances: team.chances, originalIndex: teamIndex };
    });
    mapped.redraws = discardedRedraws;
    return mapped;
}

function analyzeLotteryJumps(results) {
    const jumpers = [];
    const fallers = [];
    const drawnSeedMax = leagueConfig.drawnPicks - 1;

    results.forEach((team, index) => {
        if (!team || typeof team.originalIndex !== 'number') return;

        if (index < leagueConfig.drawnPicks && team.originalIndex > drawnSeedMax) {
            jumpers.push({ team, pick: index + 1, fromSeed: team.originalIndex + 1 });
        }
        if (index >= leagueConfig.drawnPicks && index < leagueConfig.drawnPicks + leagueConfig.byRecordPicks && team.originalIndex <= drawnSeedMax) {
            fallers.push({ team, pick: index + 1, fromSeed: team.originalIndex + 1 });
        }
    });

    return {
        jumpers,
        fallers,
        jumpersByPick: new Map(jumpers.map(e => [e.pick, e])),
        fallersByPick: new Map(fallers.map(e => [e.pick, e])),
        hasChaos: jumpers.length > 0 || fallers.length > 0
    };
}

// ============================================
// DRAFT ORDER
// ============================================

function getFullDraftOrderData(lotteryResults) {
    const rows = [];
    const isSnake = leagueConfig.draftFormat !== 'linear';
    let overallPick = 1;
    for (let round = 0; round < leagueConfig.rounds; round++) {
        const reversed = isSnake && round % 2 === 1;
        for (let slot = 0; slot < leagueConfig.teamCount; slot++) {
            const pick = reversed ? leagueConfig.teamCount - 1 - slot : slot;
            const originalTeamIndex = lotteryResults[pick].name === teams[pick].name ? pick : teams.findIndex(t => t.name === lotteryResults[pick].name);
            const ownerTeamIndex = pickOwnership[round][originalTeamIndex] !== null ? pickOwnership[round][originalTeamIndex] : originalTeamIndex;
            const teamName = teams[ownerTeamIndex].name;
            const viaName = ownerTeamIndex !== originalTeamIndex ? teams[originalTeamIndex].name : null;
            rows.push({ pickNumber: overallPick++, teamName, viaName });
        }
    }
    return rows;
}

function updateFullDraftOrder(lotteryResults) {
    const fullDraftOrderDiv = document.getElementById('fullDraftOrder');
    if (!fullDraftOrderDiv) return;

    fullDraftOrderDiv.innerHTML = '';

    const isSnake = leagueConfig.draftFormat !== 'linear';
    const formatLabel = document.createElement('p');
    formatLabel.className = 'section-description';
    formatLabel.textContent = isSnake ? 'Format: Snake Draft' : 'Format: Linear Draft';
    fullDraftOrderDiv.appendChild(formatLabel);

    let overallPick = 1;
    for (let round = 0; round < leagueConfig.rounds; round++) {
        const roundDiv = document.createElement('div');
        roundDiv.className = 'draft-round';

        const reversed = isSnake && round % 2 === 1;
        const roundTitle = document.createElement('h3');
        roundTitle.className = 'draft-round-title';
        roundTitle.textContent = `Round ${round + 1}${reversed ? ' (reversed)' : ''}`;
        roundDiv.appendChild(roundTitle);

        for (let slot = 0; slot < leagueConfig.teamCount; slot++) {
            const pick = reversed ? leagueConfig.teamCount - 1 - slot : slot;
            const originalTeamIndex = lotteryResults[pick].name === teams[pick].name ? pick : teams.findIndex(team => team.name === lotteryResults[pick].name);
            const ownerTeamIndex = pickOwnership[round][originalTeamIndex] !== null ? pickOwnership[round][originalTeamIndex] : originalTeamIndex;

            const pickDiv = document.createElement('div');
            pickDiv.className = 'draft-pick';

            const pickNumber = document.createElement('span');
            pickNumber.className = 'draft-pick-number';
            pickNumber.textContent = `${overallPick++}.`;

            const pickTeam = document.createElement('span');
            pickTeam.className = 'draft-pick-team';
            pickTeam.textContent = teams[ownerTeamIndex].name;

            pickDiv.appendChild(pickNumber);
            pickDiv.appendChild(pickTeam);

            if (ownerTeamIndex !== originalTeamIndex) {
                const originalTeam = document.createElement('span');
                originalTeam.className = 'draft-pick-original';
                originalTeam.textContent = `(via ${teams[originalTeamIndex].name})`;
                pickDiv.appendChild(originalTeam);
            }

            roundDiv.appendChild(pickDiv);
        }

        fullDraftOrderDiv.appendChild(roundDiv);
    }

    // Download buttons
    const downloadWrap = document.createElement('div');
    downloadWrap.className = 'draft-order-downloads';

    const fullBtn = document.createElement('button');
    fullBtn.type = 'button';
    fullBtn.className = 'lottery-button';
    fullBtn.textContent = 'Download full draft order';
    fullBtn.addEventListener('click', () => downloadFullDraftOrder(lotteryResults));

    const top10Btn = document.createElement('button');
    top10Btn.type = 'button';
    top10Btn.className = 'lottery-button';
    top10Btn.textContent = 'Download lottery results';
    top10Btn.title = 'Original top 10 (before pick trades)';

    top10Btn.addEventListener('click', () => downloadOriginalTop10(lotteryResults));

    downloadWrap.appendChild(fullBtn);
    downloadWrap.appendChild(top10Btn);
    fullDraftOrderDiv.appendChild(downloadWrap);

    const draftOrderSection = document.querySelector('.draft-order-section');
    if (draftOrderSection) draftOrderSection.style.display = 'block';
}

function downloadFullDraftOrder(lotteryResults) {
    const rows = getFullDraftOrderData(lotteryResults);
    const isSnake = leagueConfig.draftFormat !== 'linear';
    const lines = [`Format: ${isSnake ? 'Snake Draft' : 'Linear Draft'}`, ''];
    let round = 1;
    for (let i = 0; i < rows.length; i++) {
        if (i % leagueConfig.teamCount === 0) {
            if (i > 0) lines.push('');
            const reversed = isSnake && (round - 1) % 2 === 1;
            lines.push(`Round ${round}${reversed ? ' (reversed)' : ''}`);
            round++;
        }
        const r = rows[i];
        lines.push(`${r.pickNumber}. ${r.teamName}${r.viaName ? ` (via ${r.viaName})` : ''}`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${sanitizeFilename(leagueConfig.leagueName)}-draft-order-full.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
}

function downloadOriginalTop10(lotteryResults) {
    const lines = ['Round 1 – original lottery order (before trades)', ''];
    for (let i = 0; i < leagueConfig.teamCount && i < lotteryResults.length; i++) {
        lines.push(`${i + 1}. ${lotteryResults[i].name}`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${sanitizeFilename(leagueConfig.leagueName)}-lottery-results.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
}

// ============================================
// LOTTERY UI — MAIN ENTRY
// ============================================

function runLottery() {
    if (!teamsLocked) {
        showToast('Please confirm the team order before running the lottery.');
        return;
    }
    if (!pickOwnershipLocked) {
        showToast('Please confirm pick ownership before running the lottery.');
        return;
    }

    const magicNumberInput = document.getElementById('magicNumber');
    const magicNumber = parseInt(magicNumberInput.value, 10) || 1;
    if (magicNumber < 1 || magicNumber > 99) {
        showToast('Magic number must be between 1 and 99', 'warning');
        return;
    }

    const inputs = document.querySelectorAll('.team-input-row input');
    inputs.forEach((input, index) => {
        if (input.value.trim()) {
            teams[index].name = input.value.trim();
        } else {
            teams[index].name = `Team ${index + 1}`;
        }
    });
    saveTeamNames();

    const precomputedResults = [];
    for (let i = 0; i < magicNumber; i++) {
        precomputedResults.push(runQuickLottery());
    }

    // Create fullscreen modal
    const fullscreenView = document.createElement('div');
    fullscreenView.className = 'lottery-fullscreen';
    fullscreenView.setAttribute('role', 'dialog');
    fullscreenView.setAttribute('aria-modal', 'true');
    fullscreenView.setAttribute('aria-label', 'Draft Lottery Results');
    document.body.appendChild(fullscreenView);

    const contentContainer = document.createElement('div');
    contentContainer.className = 'lottery-content';
    fullscreenView.appendChild(contentContainer);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'close-button';
    closeButton.innerHTML = '&times;';
    closeButton.setAttribute('aria-label', 'Close lottery results');
    function closeModal() {
        if (fullscreenView.parentNode) {
            document.body.removeChild(fullscreenView);
            document.querySelector('.draft-order-section')?.scrollIntoView({ behavior: 'smooth' });
        }
        document.removeEventListener('keydown', handleEsc);
        removeTrap();
    }

    closeButton.addEventListener('click', closeModal);
    contentContainer.appendChild(closeButton);

    // ESC key to close
    function handleEsc(e) {
        if (e.key === 'Escape') closeModal();
    }
    document.addEventListener('keydown', handleEsc);

    const title = document.createElement('h2');
    title.className = 'lottery-title';
    title.textContent = `${leagueConfig.leagueName} Draft Lottery (Magic Number: ${magicNumber})`;
    contentContainer.appendChild(title);

    const animationContainer = document.createElement('div');
    animationContainer.className = 'lottery-animation-container';
    contentContainer.appendChild(animationContainer);

    // Accessibility: focus close button and trap focus within modal
    closeButton.focus();
    const removeTrap = trapFocus(fullscreenView);

    // ---- Quick Iterations ----
    function runQuickIterations(currentIteration) {
        if (currentIteration < magicNumber - 1) {
            const iterationMsg = document.createElement('div');
            iterationMsg.className = 'iteration-number';
            iterationMsg.textContent = `Lottery Results ${currentIteration + 1} of ${magicNumber - 1}`;
            animationContainer.innerHTML = '';
            animationContainer.appendChild(iterationMsg);

            const quickResults = precomputedResults[currentIteration];
            const podiumContainer = document.createElement('div');
            podiumContainer.className = 'quick-iteration-podium';
            podiumContainer.setAttribute('role', 'list');
            podiumContainer.setAttribute('aria-label', `Quick lottery results ${currentIteration + 1} of ${magicNumber - 1}`);

            const quickPodiumCount = Math.min(leagueConfig.drawnPicks, 3);
            const quickPositions = [];
            if (quickPodiumCount >= 3) quickPositions.push(2);
            if (quickPodiumCount >= 1) quickPositions.push(0);
            if (quickPodiumCount >= 2) quickPositions.push(1);
            quickPositions.forEach((place) => {
                const podiumPlace = document.createElement('div');
                podiumPlace.className = `podium-place ${place === 0 ? 'first' : place === 1 ? 'second' : 'third'}`;
                podiumPlace.setAttribute('role', 'listitem');
                podiumPlace.setAttribute('aria-label', `${formatOrdinal(place + 1)} pick: ${quickResults[place].name}`);

                const podiumBlock = document.createElement('div');
                podiumBlock.className = 'podium-block';

                const teamName = document.createElement('div');
                teamName.className = 'podium-team-name';
                teamName.textContent = quickResults[place].name;

                const placeNumber = document.createElement('div');
                placeNumber.textContent = `${place + 1}${place === 0 ? 'st' : place === 1 ? 'nd' : 'rd'}`;

                podiumBlock.appendChild(teamName);
                podiumBlock.appendChild(placeNumber);
                podiumPlace.appendChild(podiumBlock);
                podiumContainer.appendChild(podiumPlace);
            });

            animationContainer.appendChild(podiumContainer);

            setTimeout(() => {
                runQuickIterations(currentIteration + 1);
            }, ITERATION_DELAY_MS);
        } else {
            runFinalLottery(precomputedResults[magicNumber - 1]);
        }
    }

    // ---- Final Lottery Reveal ----
    function runFinalLottery(officialResult) {
        animationContainer.innerHTML = '';

        const calculatingMsg = document.createElement('div');
        calculatingMsg.className = 'fullscreen-calculating';
        calculatingMsg.textContent = 'Calculating the FINAL draft order...';
        animationContainer.appendChild(calculatingMsg);

        const results = officialResult;
        const jumpAnalysis = analyzeLotteryJumps(results);

        setTimeout(() => {
            animationContainer.removeChild(calculatingMsg);
            revealAutomaticPicks();
        }, CALCULATING_DELAY_MS);

        // Step 1: Reveal picks teamCount down to drawnPicks+1 (locked + by-record)
        function revealAutomaticPicks() {
            const autoCount = leagueConfig.lockedPicks + leagueConfig.byRecordPicks;
            // If nothing to reveal automatically, go straight to podium
            if (autoCount === 0) {
                revealTopFour();
                return;
            }

            animationContainer.innerHTML = '';

            const batchHeader = document.createElement('div');
            batchHeader.className = 'batch-header';
            batchHeader.textContent = `Picks ${leagueConfig.teamCount} through ${leagueConfig.drawnPicks + 1}`;
            animationContainer.appendChild(batchHeader);

            const picksWrapper = document.createElement('div');
            picksWrapper.className = 'automatic-picks-wrapper';
            animationContainer.appendChild(picksWrapper);

            let currentIndex = leagueConfig.teamCount - 1;

            function showNextPick() {
                if (currentIndex >= leagueConfig.drawnPicks) {
                    const resultItem = document.createElement('div');
                    resultItem.className = 'fullscreen-result-item';
                    const pickNumber = currentIndex + 1;
                    resultItem.textContent = `Pick ${pickNumber}: ${results[currentIndex].name}`;

                    if (currentIndex >= leagueConfig.drawnPicks + leagueConfig.byRecordPicks) {
                        resultItem.classList.add('pick-auto');
                    } else {
                        resultItem.classList.add('pick-lottery');
                    }

                    const fallInfo = jumpAnalysis.fallersByPick.get(pickNumber);
                    if (fallInfo) {
                        resultItem.classList.add('has-faller');

                        const chaosNote = document.createElement('div');
                        chaosNote.className = 'chaos-note';
                        chaosNote.textContent = `\u2B07 Shock drop! ${fallInfo.team.name} fell out of the Top ${leagueConfig.drawnPicks}.`;
                        chaosNote.setAttribute('aria-label', `Shock drop: ${fallInfo.team.name} fell out of the Top ${leagueConfig.drawnPicks}`);
                        resultItem.appendChild(chaosNote);
                    }

                    if (picksWrapper.firstChild) {
                        picksWrapper.insertBefore(resultItem, picksWrapper.firstChild);
                    } else {
                        picksWrapper.appendChild(resultItem);
                    }

                    currentIndex--;

                    if (currentIndex >= leagueConfig.drawnPicks) {
                        setTimeout(showNextPick, PICK_DELAY_MS);
                    } else {
                        setTimeout(() => {
                            const nextButton = document.createElement('button');
                            nextButton.type = 'button';
                            nextButton.textContent = `Reveal Top ${Math.min(leagueConfig.drawnPicks, 6)} Picks`;
                            nextButton.className = 'lottery-button reveal-top4-btn';
                            nextButton.addEventListener('click', () => {
                                animationContainer.innerHTML = '';
                                revealTopFour();
                            });
                            animationContainer.appendChild(nextButton);
                            nextButton.focus();
                        }, NEXT_BUTTON_DELAY_MS);
                    }
                }
            }

            showNextPick();
        }

        // Step 2: Reveal top drawn picks (podium)
        function revealTopFour() {
            animationContainer.innerHTML = '';
            animationContainer.classList.add('top-four-stage');

            const podiumCount = Math.min(leagueConfig.drawnPicks, 6);
            // If drawnPicks > 6, first reveal picks 7..drawnPicks in auto style
            if (leagueConfig.drawnPicks > 6) {
                revealExtraDrawnPicks(() => revealPodium(podiumCount));
                return;
            }
            revealPodium(podiumCount);

            function revealExtraDrawnPicks(callback) {
                const extraHeader = document.createElement('div');
                extraHeader.className = 'batch-header';
                extraHeader.textContent = `Picks ${leagueConfig.drawnPicks} through 7`;
                animationContainer.appendChild(extraHeader);

                const extraWrapper = document.createElement('div');
                extraWrapper.className = 'automatic-picks-wrapper';
                animationContainer.appendChild(extraWrapper);

                let idx = leagueConfig.drawnPicks - 1;
                function showExtra() {
                    if (idx >= 6) {
                        const item = document.createElement('div');
                        item.className = 'fullscreen-result-item pick-lottery';
                        item.textContent = `Pick ${idx + 1}: ${results[idx].name}`;
                        if (extraWrapper.firstChild) extraWrapper.insertBefore(item, extraWrapper.firstChild);
                        else extraWrapper.appendChild(item);
                        idx--;
                        if (idx >= 6) setTimeout(showExtra, PICK_DELAY_MS);
                        else setTimeout(() => { animationContainer.innerHTML = ''; callback(); }, NEXT_BUTTON_DELAY_MS);
                    }
                }
                showExtra();
            }

            function revealPodium(podiumCount) {
            animationContainer.innerHTML = '';
            animationContainer.classList.add('top-four-stage');

            const batchHeader = document.createElement('div');
            batchHeader.className = 'batch-header batch-header-lg';
            batchHeader.textContent = `Top ${podiumCount} Draft Picks`;
            animationContainer.appendChild(batchHeader);

            const drumrollArea = document.createElement('div');
            drumrollArea.className = 'drumroll-area';
            animationContainer.appendChild(drumrollArea);

            const podiumContainer = document.createElement('div');
            podiumContainer.className = 'top-four-podium';
            podiumContainer.setAttribute('role', 'list');
            podiumContainer.setAttribute('aria-label', `Top ${podiumCount} draft picks`);
            animationContainer.appendChild(podiumContainer);

            // Build positions array: reveal worst-to-best, swap last two for drama
            const positions = [];
            for (let i = podiumCount - 1; i >= 0; i--) {
                positions.push({ position: i, cssClass: `pos-${i + 1}` });
            }
            // Swap last two so #1 is revealed last (more drama)
            if (positions.length >= 2) {
                const len = positions.length;
                [positions[len - 2], positions[len - 1]] = [positions[len - 1], positions[len - 2]];
            }

            positions.forEach(pos => {
                const placeholder = document.createElement('div');
                placeholder.className = `podium-placeholder ${pos.cssClass}`;
                podiumContainer.appendChild(placeholder);
            });

            function revealPodiumPlace(index) {
                if (index >= positions.length) {
                    finishReveal();
                    return;
                }

                const position = positions[index].position;
                const pickNumber = position + 1;
                const jumperInfo = jumpAnalysis.jumpersByPick.get(pickNumber);

                // Drumroll message
                const drumroll = document.createElement('div');
                drumroll.className = 'fullscreen-drumroll';

                const colorClasses = ['pick-gold', 'pick-silver', 'pick-bronze', 'pick-fourth'];
                drumroll.classList.add(colorClasses[Math.min(position, 3)]);
                drumroll.textContent = `The team picking ${formatOrdinal(position + 1)} in this year's draft will be...`;

                if (jumperInfo) {
                    const chaosLine = document.createElement('div');
                    chaosLine.className = 'upset-alert';
                    chaosLine.textContent = `\u26A0 UPSET ALERT: ${jumperInfo.team.name} jumps from the ${formatOrdinal(jumperInfo.fromSeed)} seed!`;
                    drumroll.appendChild(chaosLine);
                }

                drumrollArea.innerHTML = '';
                drumrollArea.appendChild(drumroll);

                showPickTimer(PICK_DELAY_SECONDS, () => {
                    revealPodiumPosition(position);
                });

                function revealPodiumPosition(position) {
                    const jumperHighlight = jumpAnalysis.jumpersByPick.get(position + 1);
                    const placeholder = podiumContainer.querySelector(`.podium-placeholder.pos-${position + 1}`);

                    const podiumPlace = document.createElement('div');
                    podiumPlace.className = `top-podium-place place-${position + 1}`;
                    podiumPlace.setAttribute('role', 'listitem');
                    podiumPlace.setAttribute('aria-label', `${formatOrdinal(position + 1)} pick: ${results[position].name}${jumperHighlight ? ' — Lucky Leap upset!' : ''}`);

                    if (jumperHighlight) {
                        podiumPlace.classList.add('has-jumper');
                    }

                    // Position it based on placeholder
                    podiumPlace.style.left = placeholder.offsetLeft + 'px';
                    podiumPlace.style.width = placeholder.offsetWidth + 'px';

                    const positionNumber = document.createElement('div');
                    positionNumber.className = 'podium-position-number';
                    positionNumber.textContent = `${position + 1}`;
                    podiumPlace.appendChild(positionNumber);

                    const teamName = document.createElement('div');
                    teamName.className = 'podium-team-label';
                    teamName.textContent = results[position].name;
                    podiumPlace.appendChild(teamName);

                    if (jumperHighlight) {
                        const chaosBadge = document.createElement('div');
                        chaosBadge.className = 'lucky-leap-badge';
                        chaosBadge.textContent = '\u2B06 Lucky Leap!';
                        chaosBadge.setAttribute('aria-label', `Upset: ${results[position].name} jumped into the top ${leagueConfig.drawnPicks}`);
                        podiumPlace.appendChild(chaosBadge);
                    }

                    podiumContainer.appendChild(podiumPlace);

                    setTimeout(() => {
                        revealPodiumPlace(index + 1);
                    }, 0);
                }
            }

            function finishReveal() {
                drumrollArea.innerHTML = '';

                lastLotteryResult = {
                    results,
                    magicNumber,
                    timestamp: new Date().toISOString(),
                    jumpers: jumpAnalysis.jumpers,
                    fallers: jumpAnalysis.fallers
                };
                saveToHistory(lastLotteryResult);
                updateProgressTracker();

                const completeMsg = document.createElement('div');
                completeMsg.className = 'fullscreen-complete';
                completeMsg.textContent = 'Draft lottery complete!';
                animationContainer.appendChild(completeMsg);

                if (results.redraws > 0) {
                    const redrawMsg = document.createElement('div');
                    redrawMsg.className = 'redraw-notice';
                    redrawMsg.textContent = `Discarded combination was drawn ${results.redraws} time${results.redraws > 1 ? 's' : ''} — redraw triggered (NBA rule).`;
                    animationContainer.appendChild(redrawMsg);
                }

                updateResultsDiv(results);
                updateFullDraftOrder(results);

                const btnWrap = document.createElement('div');
                btnWrap.className = 'modal-btn-wrap';

                const viewResultsBtn = document.createElement('button');
                viewResultsBtn.type = 'button';
                viewResultsBtn.textContent = 'View Full Draft Order';
                viewResultsBtn.className = 'lottery-button';
                viewResultsBtn.addEventListener('click', closeModal);
                btnWrap.appendChild(viewResultsBtn);

                const copyBtn = document.createElement('button');
                copyBtn.type = 'button';
                copyBtn.textContent = 'Copy Results';
                copyBtn.className = 'lottery-button';
                copyBtn.style.background = 'var(--bg-secondary)';
                copyBtn.style.border = '1px solid var(--border-color)';
                copyBtn.addEventListener('click', () => copyResults(results));
                btnWrap.appendChild(copyBtn);

                animationContainer.appendChild(btnWrap);
                viewResultsBtn.focus();
                btnWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
                launchConfetti();
            }

            setTimeout(() => {
                revealPodiumPlace(0);
            }, REVEAL_START_DELAY_MS);
            } // end revealPodium
        }
    }

    if (magicNumber > 1) {
        runQuickIterations(0);
    } else {
        runFinalLottery(precomputedResults[0]);
    }
}

// ============================================
// COPY RESULTS
// ============================================

function copyResults(results) {
    const lines = [`${leagueConfig.leagueName} – Lottery Results`, ''];
    for (let i = 0; i < results.length; i++) {
        lines.push(`${i + 1}. ${results[i].name}`);
    }
    const text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => showToast('Results copied!', 'success')).catch(() => {
            fallbackCopy(text);
        });
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast('Results copied!', 'success'); } catch (e) { showToast('Copy failed — please copy manually.', 'error'); }
    document.body.removeChild(ta);
}

// ============================================
// CONFETTI
// ============================================

function launchConfetti() {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#3B82F6','#22C55E','#F59E0B','#EF4444','#A855F7','#06B6D4'];
    const pieces = Array.from({ length: 120 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * -canvas.height,
        w: 8 + Math.random() * 6,
        h: 4 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 0.15,
        vx: (Math.random() - 0.5) * 3,
        vy: 3 + Math.random() * 4,
    }));

    let frame;
    const duration = 3500;
    const start = performance.now();
    function draw(now) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const elapsed = now - start;
        pieces.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.rot += p.rotV;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
        });
        if (elapsed < duration) {
            frame = requestAnimationFrame(draw);
        } else {
            canvas.remove();
        }
    }
    frame = requestAnimationFrame(draw);
    setTimeout(() => { cancelAnimationFrame(frame); canvas.remove(); }, duration + 200);
}

// ============================================
// RESULTS DIV (below modal)
// ============================================

function updateResultsDiv(results) {
    const resultsDiv = document.getElementById('results');
    if (!resultsDiv) return;

    resultsDiv.innerHTML = '';
    resultsDiv.style.display = 'block';

    const container = document.createElement('div');
    container.className = 'results-container';

    const pickClasses = ['pick-1st', 'pick-2nd', 'pick-3rd'];

    for (let i = 0; i < results.length; i++) {
        const resultItem = document.createElement('div');
        resultItem.className = 'result-item';

        if (i < 3) {
            resultItem.classList.add(pickClasses[i]);
        } else if (i >= leagueConfig.drawnPicks + leagueConfig.byRecordPicks) {
            resultItem.classList.add('pick-auto');
        }

        resultItem.textContent = `Pick ${i + 1}: ${results[i].name}`;
        container.appendChild(resultItem);
    }

    resultsDiv.appendChild(container);

    const completeMsg = document.createElement('div');
    completeMsg.className = 'complete-message';
    completeMsg.textContent = 'Draft lottery complete!';
    resultsDiv.appendChild(completeMsg);
}

// ============================================
// PICK TIMER
// ============================================

function showPickTimer(seconds, callback) {
    const timerContainer = document.createElement('div');
    timerContainer.className = 'pick-timer-container';

    const timerLabel = document.createElement('div');
    timerLabel.className = 'pick-timer-label';
    timerLabel.textContent = 'Revealing in';
    timerContainer.appendChild(timerLabel);

    const timerDisplay = document.createElement('div');
    timerDisplay.className = 'pick-timer-display';
    timerDisplay.textContent = seconds.toString();
    timerContainer.appendChild(timerDisplay);

    const fullscreenView = document.querySelector('.lottery-fullscreen');
    if (!fullscreenView) return;
    fullscreenView.appendChild(timerContainer);

    let remainingSeconds = seconds;

    const interval = setInterval(() => {
        remainingSeconds--;

        if (remainingSeconds > 0) {
            timerDisplay.textContent = remainingSeconds.toString();
            if (remainingSeconds <= 1) {
                timerDisplay.classList.add('urgent');
                timerContainer.classList.add('urgent');
            }
        } else {
            clearInterval(interval);
            if (timerContainer.parentNode) {
                timerContainer.parentNode.removeChild(timerContainer);
            }
            callback();
        }
    }, 1000);
}

// ============================================
// UTILITIES
// ============================================

function trapFocus(container) {
    function handler(e) {
        if (e.key !== 'Tab') return;
        const focusable = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
            if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
            if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    }
    container.addEventListener('keydown', handler);
    return () => container.removeEventListener('keydown', handler);
}

function formatOrdinal(num) {
    const remainder10 = num % 10;
    const remainder100 = num % 100;

    if (remainder10 === 1 && remainder100 !== 11) return `${num}st`;
    if (remainder10 === 2 && remainder100 !== 12) return `${num}nd`;
    if (remainder10 === 3 && remainder100 !== 13) return `${num}rd`;
    return `${num}th`;
}

// ============================================
// LOTTERY HISTORY
// ============================================

function saveToHistory(entry) {
    try {
        const raw = localStorage.getItem(LS_KEY_HISTORY);
        const history = raw ? JSON.parse(raw) : [];
        history.unshift({
            timestamp: entry.timestamp,
            magicNumber: entry.magicNumber,
            picks: entry.results.map((r, i) => ({ pick: i + 1, name: r.name })),
            jumpers: (entry.jumpers || []).map(j => ({ name: j.team.name, pick: j.pick, fromSeed: j.fromSeed })),
        });
        // Keep last 20 runs
        if (history.length > 20) history.splice(20);
        safeSetItem(LS_KEY_HISTORY, JSON.stringify(history));
    } catch (e) {
        console.warn('Failed to save lottery history', e);
    }
    renderHistory();
}

function renderHistory() {
    const section = document.getElementById('historySection');
    if (!section) return;

    let history = [];
    try {
        const raw = localStorage.getItem(LS_KEY_HISTORY);
        if (raw) history = JSON.parse(raw);
    } catch (e) { /* ignore */ }

    if (!history.length) { section.style.display = 'none'; return; }

    section.style.display = '';
    section.innerHTML = '';

    const h2 = document.createElement('h2');
    h2.textContent = 'Lottery History';
    section.appendChild(h2);

    history.forEach((run, idx) => {
        const entry = document.createElement('details');
        entry.className = 'history-entry';
        if (idx === 0) entry.open = true;

        const summary = document.createElement('summary');
        const date = new Date(run.timestamp).toLocaleString();
        summary.textContent = `Run #${history.length - idx} — ${date} (magic #${run.magicNumber})`;
        entry.appendChild(summary);

        const pickList = document.createElement('ol');
        pickList.className = 'history-picks';
        run.picks.forEach(p => {
            const li = document.createElement('li');
            li.textContent = p.name;
            pickList.appendChild(li);
        });
        entry.appendChild(pickList);

        if (run.jumpers && run.jumpers.length) {
            const chaos = document.createElement('p');
            chaos.className = 'history-chaos';
            chaos.textContent = 'Jumpers: ' + run.jumpers.map(j => `${j.name} (seed ${j.fromSeed} → pick ${j.pick})`).join(', ');
            entry.appendChild(chaos);
        }

        section.appendChild(entry);
    });
}

// ============================================
// CONFIG EXPORT / IMPORT
// ============================================

function exportConfig() {
    if (!leagueConfig) { showToast('No config to export.'); return; }
    const payload = JSON.stringify(leagueConfig, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${sanitizeFilename(leagueConfig.leagueName)}-config.json`;
    a.click();
    URL.revokeObjectURL(a.href);
}

function importConfig() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                if (!parsed || typeof parsed.teamCount !== 'number') {
                    showToast('Invalid config file.', 'error');
                    return;
                }
                if (!Array.isArray(parsed.combinations) || parsed.combinations.reduce((a, b) => a + b, 0) !== 1000) {
                    showToast('Config combinations must sum to 1,000.', 'error');
                    return;
                }
                // Clear existing state
                localStorage.removeItem(LS_KEY_TEAM_NAMES);
                localStorage.removeItem(LS_KEY_TEAMS_LOCKED);
                localStorage.removeItem(LS_KEY_PICK_OWNERSHIP_LOCKED);
                localStorage.removeItem(LS_KEY_PICK_OWNERSHIP);
                saveLeagueConfig(parsed);
                showToast('Config imported successfully.', 'success');
                initApp();
            } catch (err) {
                showToast('Failed to parse config file.', 'error');
            }
        };
        reader.readAsText(file);
    });
    input.click();
}

// ============================================
// INITIALIZATION
// ============================================

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
    updateProgressTracker();
    updateSectionBadges();

    const draftOrderSection = document.querySelector('.draft-order-section');
    if (draftOrderSection) draftOrderSection.style.display = 'none';

    renderHistory();

    // Config export / import
    const exportBtn = document.getElementById('exportConfigBtn');
    if (exportBtn) { exportBtn.replaceWith(exportBtn.cloneNode(true)); }
    const freshExport = document.getElementById('exportConfigBtn');
    if (freshExport) freshExport.addEventListener('click', exportConfig);

    const importBtn = document.getElementById('importConfigBtn');
    if (importBtn) { importBtn.replaceWith(importBtn.cloneNode(true)); }
    const freshImport = document.getElementById('importConfigBtn');
    if (freshImport) freshImport.addEventListener('click', importConfig);

    // Reset button — double-tap guard
    const resetBtn = document.getElementById('resetButton');
    if (resetBtn) {
        const freshReset = resetBtn.cloneNode(true);
        resetBtn.replaceWith(freshReset);
        let resetPending = false;
        freshReset.addEventListener('click', () => {
            if (!resetPending) {
                resetPending = true;
                freshReset.textContent = 'Tap again to confirm reset';
                freshReset.style.background = 'var(--danger)';
                setTimeout(() => {
                    resetPending = false;
                    freshReset.textContent = 'Reset All Data';
                    freshReset.style.background = '';
                }, 3000);
            } else {
                [LS_KEY_LEAGUE_CONFIG, LS_KEY_TEAM_NAMES, LS_KEY_TEAMS_LOCKED,
                 LS_KEY_PICK_OWNERSHIP_LOCKED, LS_KEY_PICK_OWNERSHIP, LS_KEY_HISTORY].forEach(k => localStorage.removeItem(k));
                location.reload();
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', function() {
    leagueConfig = loadLeagueConfig();

    if (!leagueConfig) {
        showQuickStart();
    } else {
        const wizard = document.getElementById('setupWizard');
        if (wizard) wizard.style.display = 'none';
        initApp();
    }
});

window.runLottery = runLottery;
