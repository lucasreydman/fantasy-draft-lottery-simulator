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
}

function unlockTeams() {
    teamsLocked = false;
    pickOwnershipLocked = false;
    saveTeamLockState();
    savePickOwnershipLockState();
    applyTeamLockState();
    createPickOwnershipTable();
}

function lockPickOwnership() {
    pickOwnershipLocked = true;
    savePickOwnershipLockState();
    createPickOwnershipTable();
    applyTeamLockState();
}

function unlockPickOwnership() {
    pickOwnershipLocked = false;
    savePickOwnershipLockState();
    createPickOwnershipTable();
    applyTeamLockState();
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
    const tableBody = document.getElementById('oddsTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    odds.forEach((teamOdds, index) => {
        const row = document.createElement('tr');
        const teamCell = document.createElement('td');
        teamCell.textContent = `Team ${index + 1}`;
        row.appendChild(teamCell);
        teamOdds.forEach(odd => {
            const cell = document.createElement('td');
            cell.textContent = typeof odd === 'number' ? `${odd.toFixed(1)}%` : '0.0%';
            row.appendChild(cell);
        });
        tableBody.appendChild(row);
    });
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

    for (let round = 0; round < 3; round++) {
        const roundHeaderRow = document.createElement('tr');
        roundHeaderRow.className = 'round-header';
        const roundHeaderCell = document.createElement('td');
        roundHeaderCell.colSpan = 3;
        roundHeaderCell.textContent = `Round ${round + 1}`;
        roundHeaderRow.appendChild(roundHeaderCell);
        tbody.appendChild(roundHeaderRow);

        for (let pick = 0; pick < 10; pick++) {
            const row = document.createElement('tr');

            const pickCell = document.createElement('td');
            pickCell.textContent = round * 10 + pick + 1;
            row.appendChild(pickCell);

            const originalTeamCell = document.createElement('td');
            originalTeamCell.textContent = teams[pick].name;
            originalTeamCell.dataset.teamIndex = pick;
            originalTeamCell.className = 'original-team-cell';
            row.appendChild(originalTeamCell);

            const ownerCell = document.createElement('td');
            const ownerSelect = document.createElement('select');
            ownerSelect.setAttribute('aria-label', `Owner of pick ${round * 10 + pick + 1}`);

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

function runQuickLottery() {
    const lotteryTeams = teams.slice(0, 6).map((team, index) => ({
        ...team,
        originalIndex: index
    }));
    const results = new Array(10);
    const drawnIndices = new Set();
    const drawnTeams = [];
    let discardedRedraws = 0;

    for (let pick = 0; pick < 4; pick++) {
        while (true) {
            const r = Math.random() * TOTAL_POOL;
            if (r >= ASSIGNED) { discardedRedraws++; continue; }

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

    const remaining = lotteryTeams.filter(t => !drawnIndices.has(t.originalIndex));
    remaining.sort((a, b) => a.originalIndex - b.originalIndex);

    const top6Picks = [...drawnTeams, ...remaining];
    for (let i = 0; i < 6; i++) results[i] = top6Picks[i];
    for (let i = 6; i < 10; i++) results[i] = teams[i];

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
    const TOP_FOUR_SEED_MAX = 3;

    results.forEach((team, index) => {
        if (!team || typeof team.originalIndex !== 'number') return;

        if (index < 4 && team.originalIndex > TOP_FOUR_SEED_MAX) {
            jumpers.push({ team, pick: index + 1, fromSeed: team.originalIndex + 1 });
        }
        if ((index === 4 || index === 5) && team.originalIndex <= TOP_FOUR_SEED_MAX) {
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
    for (let round = 0; round < 3; round++) {
        for (let pick = 0; pick < 10; pick++) {
            const originalTeamIndex = lotteryResults[pick].name === teams[pick].name ? pick : teams.findIndex(t => t.name === lotteryResults[pick].name);
            const ownerTeamIndex = pickOwnership[round][originalTeamIndex] !== null ? pickOwnership[round][originalTeamIndex] : originalTeamIndex;
            const pickNumber = round * 10 + pick + 1;
            const teamName = teams[ownerTeamIndex].name;
            const viaName = ownerTeamIndex !== originalTeamIndex ? teams[originalTeamIndex].name : null;
            rows.push({ pickNumber, teamName, viaName });
        }
    }
    return rows;
}

function updateFullDraftOrder(lotteryResults) {
    const fullDraftOrderDiv = document.getElementById('fullDraftOrder');
    if (!fullDraftOrderDiv) return;

    fullDraftOrderDiv.innerHTML = '';

    for (let round = 0; round < 3; round++) {
        const roundDiv = document.createElement('div');
        roundDiv.className = 'draft-round';

        const roundTitle = document.createElement('h3');
        roundTitle.className = 'draft-round-title';
        roundTitle.textContent = `Round ${round + 1}`;
        roundDiv.appendChild(roundTitle);

        for (let pick = 0; pick < 10; pick++) {
            const originalTeamIndex = lotteryResults[pick].name === teams[pick].name ? pick : teams.findIndex(team => team.name === lotteryResults[pick].name);
            const ownerTeamIndex = pickOwnership[round][originalTeamIndex] !== null ? pickOwnership[round][originalTeamIndex] : originalTeamIndex;

            const pickDiv = document.createElement('div');
            pickDiv.className = 'draft-pick';

            const pickNumber = document.createElement('span');
            pickNumber.className = 'draft-pick-number';
            pickNumber.textContent = `${round * 10 + pick + 1}.`;

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
    const lines = [];
    let round = 1;
    for (let i = 0; i < rows.length; i++) {
        if (i % 10 === 0) {
            if (i > 0) lines.push('');
            lines.push(`Round ${round}`);
            round++;
        }
        const r = rows[i];
        lines.push(`${r.pickNumber}. ${r.teamName}${r.viaName ? ` (via ${r.viaName})` : ''}`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'draft-order-full.txt';
    a.click();
    URL.revokeObjectURL(a.href);
}

function downloadOriginalTop10(lotteryResults) {
    const lines = ['Round 1 – original lottery order (before trades)', ''];
    for (let i = 0; i < 10 && i < lotteryResults.length; i++) {
        lines.push(`${i + 1}. ${lotteryResults[i].name}`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'draft-order-original-top10.txt';
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
    title.textContent = `The People's Dynasty League Draft Lottery (Magic Number: ${magicNumber})`;
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

            [2, 1, 0].forEach((place) => {
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

        // Step 1: Reveal picks 10-5
        function revealAutomaticPicks() {
            animationContainer.innerHTML = '';

            const batchHeader = document.createElement('div');
            batchHeader.className = 'batch-header';
            batchHeader.textContent = 'Picks 10 through 5';
            animationContainer.appendChild(batchHeader);

            const picksWrapper = document.createElement('div');
            picksWrapper.className = 'automatic-picks-wrapper';
            animationContainer.appendChild(picksWrapper);

            let currentIndex = 9;

            function showNextPick() {
                if (currentIndex >= 4) {
                    const resultItem = document.createElement('div');
                    resultItem.className = 'fullscreen-result-item';
                    const pickNumber = currentIndex + 1;
                    resultItem.textContent = `Pick ${pickNumber}: ${results[currentIndex].name}`;

                    if (currentIndex >= 6) {
                        resultItem.classList.add('pick-auto');
                    } else {
                        resultItem.classList.add('pick-lottery');
                    }

                    const fallInfo = jumpAnalysis.fallersByPick.get(pickNumber);
                    if (fallInfo) {
                        resultItem.classList.add('has-faller');

                        const chaosNote = document.createElement('div');
                        chaosNote.className = 'chaos-note';
                        chaosNote.textContent = `\u2B07 Shock drop! ${fallInfo.team.name} fell out of the Top 4.`;
                        chaosNote.setAttribute('aria-label', `Shock drop: ${fallInfo.team.name} fell out of the Top 4`);
                        resultItem.appendChild(chaosNote);
                    }

                    if (picksWrapper.firstChild) {
                        picksWrapper.insertBefore(resultItem, picksWrapper.firstChild);
                    } else {
                        picksWrapper.appendChild(resultItem);
                    }

                    currentIndex--;

                    if (currentIndex >= 4) {
                        setTimeout(showNextPick, PICK_DELAY_MS);
                    } else {
                        setTimeout(() => {
                            const nextButton = document.createElement('button');
                            nextButton.type = 'button';
                            nextButton.textContent = 'Reveal Top 4 Picks';
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

        // Step 2: Reveal top 4 picks
        function revealTopFour() {
            animationContainer.innerHTML = '';
            animationContainer.classList.add('top-four-stage');

            const batchHeader = document.createElement('div');
            batchHeader.className = 'batch-header batch-header-lg';
            batchHeader.textContent = 'Top 4 Draft Picks';
            animationContainer.appendChild(batchHeader);

            const drumrollArea = document.createElement('div');
            drumrollArea.className = 'drumroll-area';
            animationContainer.appendChild(drumrollArea);

            const podiumContainer = document.createElement('div');
            podiumContainer.className = 'top-four-podium';
            podiumContainer.setAttribute('role', 'list');
            podiumContainer.setAttribute('aria-label', 'Top 4 draft picks');
            animationContainer.appendChild(podiumContainer);

            const positions = [
                { order: 0, position: 3, cssClass: 'pos-4' },
                { order: 1, position: 2, cssClass: 'pos-3' },
                { order: 2, position: 0, cssClass: 'pos-1' },
                { order: 3, position: 1, cssClass: 'pos-2' }
            ];

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

                const pickLabels = ['1st', '2nd', '3rd', '4th'];
                const colorClasses = ['pick-gold', 'pick-silver', 'pick-bronze', 'pick-fourth'];
                drumroll.classList.add(colorClasses[position]);
                drumroll.textContent = `The team picking ${pickLabels[position]} in this years draft will be...`;

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
                    const placeClasses = ['place-1', 'place-2', 'place-3', 'place-4'];
                    podiumPlace.className = `top-podium-place ${placeClasses[position]}`;
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
                        chaosBadge.setAttribute('aria-label', `Upset: ${results[position].name} jumped into the top 4`);
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
                    timestamp: new Date().toISOString()
                };

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
                animationContainer.appendChild(btnWrap);
                viewResultsBtn.focus();
                btnWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            setTimeout(() => {
                revealPodiumPlace(0);
            }, REVEAL_START_DELAY_MS);
        }
    }

    if (magicNumber > 1) {
        runQuickIterations(0);
    } else {
        runFinalLottery(precomputedResults[0]);
    }
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
        } else if (i >= 6) {
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
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    applyChancesToTeams();
    loadTeamLockState();
    loadPickOwnershipLockState();
    createTeamInputs();
    applyTeamLockState();
    createOddsTable();
    loadSavedPickOwnership();
    createPickOwnershipTable();
    applyLotteryButtonState();

    const draftOrderSection = document.querySelector('.draft-order-section');
    if (draftOrderSection) draftOrderSection.style.display = 'none';
});

window.runLottery = runLottery;
