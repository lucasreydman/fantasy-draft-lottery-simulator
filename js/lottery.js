// ============================================
// Fantasy Draft Lottery Simulator
// Zero-dependency vanilla JS. State persists in localStorage.
// ============================================

'use strict';

// ---- Constants ----
const TOTAL_POOL = 1001;      // NBA-style: 1000 assigned combinations + 1 discarded
const ASSIGNED = 1000;
const MIN_TEAMS = 4;
const MAX_TEAMS = 20;
const MAX_ROUNDS = 10;
const ODDS_EXACT_THRESHOLD = 120000; // DP-state budget; above this, estimate odds via Monte Carlo
const ODDS_MC_TRIALS = 200000;

const LS_KEY_LEAGUE_CONFIG = 'lotteryLeagueConfig';
const LS_KEY_PICK_OWNERSHIP = 'lotteryPickOwnership';
const LS_KEY_HISTORY = 'lotteryHistory';
// Legacy keys cleared on reset (from earlier versions)
const LEGACY_KEYS = ['lotteryTeamNames', 'lotteryTeamsLocked', 'lotteryPickOwnershipLocked'];

// ---- Small helpers ----
const toInt = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function prefersReducedMotion() {
    return typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function formatOrdinal(num) {
    const r10 = num % 10, r100 = num % 100;
    if (r10 === 1 && r100 !== 11) return `${num}st`;
    if (r10 === 2 && r100 !== 12) return `${num}nd`;
    if (r10 === 3 && r100 !== 13) return `${num}rd`;
    return `${num}th`;
}

function sanitizeFilename(name) {
    return (name || 'league').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'league';
}

function ensureUniqueNames(names) {
    const seen = new Map();
    return names.map((raw) => {
        let name = raw;
        let n = 2;
        while (seen.has(name.toLowerCase())) { name = `${raw} ${n++}`; }
        seen.set(name.toLowerCase(), true);
        return name;
    });
}

function normalizeToThousand(arr) {
    const sum = arr.reduce((a, b) => a + b, 0);
    if (sum <= 0) return generateWeights(arr.length);
    let scaled = arr.map((v) => Math.max(1, Math.round((v / sum) * 1000)));
    let diff = 1000 - scaled.reduce((a, b) => a + b, 0);
    scaled[0] = Math.max(1, scaled[0] + diff);
    // Re-balance if the +diff on index 0 wasn't enough (very rare)
    let drift = 1000 - scaled.reduce((a, b) => a + b, 0);
    for (let i = 1; i < scaled.length && drift !== 0; i++) {
        const step = drift > 0 ? 1 : -1;
        if (scaled[i] + step >= 1) { scaled[i] += step; drift -= step; }
    }
    return scaled;
}

// ============================================
// LOTTERY WEIGHT PRESETS (NBA-style, descending)
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
    n = Math.max(1, Math.floor(n) || 1);
    if (n === 1) return [1000];
    if (NBA_WEIGHT_PRESETS[n]) return [...NBA_WEIGHT_PRESETS[n]];
    // For counts beyond the preset table, build a smooth quadratic decline
    // (worst team weighted highest) and normalize to exactly 1000.
    const raw = Array.from({ length: n }, (_, i) => (n - i) * (n - i));
    return normalizeToThousand(raw);
}

// ============================================
// ODDS — analytical enumeration + Monte Carlo fallback
// ============================================
// Approximate the exact DP cost: number of drawn-set states visited across
// all picks ≈ sum_{k=0..drawnPicks} C(n, k). Capped so it never overflows.
function oddsExactCost(n, drawnPicks) {
    let sum = 0, c = 1;
    for (let k = 0; k <= drawnPicks && k <= n; k++) {
        sum += c;
        if (sum > ODDS_EXACT_THRESHOLD) return sum;
        c = (c * (n - k)) / (k + 1);
    }
    return sum;
}

function computeOdds(combinations, drawnPicks) {
    const n = combinations.length;
    if (n === 0) return [];
    // Bail to Monte Carlo when exact enumeration would stall the main thread.
    if (oddsExactCost(n, drawnPicks) > ODDS_EXACT_THRESHOLD) {
        return computeOddsMonteCarlo(combinations, drawnPicks, ODDS_MC_TRIALS);
    }

    const total = combinations.reduce((a, b) => a + b, 0);
    const odds = Array.from({ length: n }, () => new Array(n).fill(0));
    let states = [{ drawnSet: new Set(), prob: 1.0 }];

    for (let pick = 0; pick < drawnPicks; pick++) {
        const next = new Map();
        for (const state of states) {
            let remainingPool = total;
            state.drawnSet.forEach((i) => { remainingPool -= combinations[i]; });
            if (remainingPool <= 0) continue;
            for (let team = 0; team < n; team++) {
                if (state.drawnSet.has(team) || combinations[team] <= 0) continue;
                const p = state.prob * (combinations[team] / remainingPool);
                odds[team][pick] += p;
                const newDrawn = new Set(state.drawnSet); newDrawn.add(team);
                const key = [...newDrawn].sort((a, b) => a - b).join(',');
                if (next.has(key)) next.get(key).prob += p;
                else next.set(key, { drawnSet: newDrawn, prob: p });
            }
        }
        states = [...next.values()];
    }
    // Remaining (undrawn) teams fill the by-record / locked positions in standings order.
    for (const state of states) {
        const remaining = [];
        for (let i = 0; i < n; i++) if (!state.drawnSet.has(i)) remaining.push(i);
        remaining.sort((a, b) => a - b);
        remaining.forEach((team, idx) => { odds[team][drawnPicks + idx] += state.prob; });
    }
    return odds.map((row) => row.map((p) => Math.round(p * 1000) / 10));
}

function computeOddsMonteCarlo(combinations, drawnPicks, trials) {
    const n = combinations.length;
    const total = combinations.reduce((a, b) => a + b, 0);
    const counts = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let t = 0; t < trials; t++) {
        const used = new Set();
        let poolTotal = total;
        for (let pick = 0; pick < drawnPicks; pick++) {
            if (poolTotal <= 0) break;
            const r = Math.random() * poolTotal;
            let cum = 0, hit = -1;
            for (let i = 0; i < n; i++) {
                if (used.has(i) || combinations[i] <= 0) continue;
                cum += combinations[i];
                if (r < cum) { hit = i; break; }
            }
            if (hit === -1) break;
            used.add(hit); poolTotal -= combinations[hit];
            counts[hit][pick]++;
        }
        const remaining = [];
        for (let i = 0; i < n; i++) if (!used.has(i)) remaining.push(i);
        remaining.sort((a, b) => a - b);
        remaining.forEach((team, idx) => { counts[team][drawnPicks + idx]++; });
    }
    return counts.map((row) => row.map((c) => Math.round((c / trials) * 1000) / 10));
}

// ============================================
// CONFIG — validation & persistence
// ============================================
let leagueConfig = null;

// Returns { config, adjusted } or null when fundamentally unusable.
function sanitizeConfig(raw) {
    if (!raw || typeof raw !== 'object') return null;
    let adjusted = false;

    const teamCount = toInt(raw.teamCount);
    if (teamCount == null || teamCount < MIN_TEAMS || teamCount > MAX_TEAMS) return null;

    let drawnPicks = toInt(raw.drawnPicks);
    if (drawnPicks == null) { drawnPicks = Math.min(4, teamCount); adjusted = true; }
    drawnPicks = clamp(drawnPicks, 1, teamCount);

    let byRecordPicks = toInt(raw.byRecordPicks);
    if (byRecordPicks == null) { byRecordPicks = teamCount - drawnPicks; adjusted = true; }
    byRecordPicks = clamp(byRecordPicks, 0, teamCount - drawnPicks);

    const eligible = drawnPicks + byRecordPicks;
    const lockedPicks = teamCount - eligible; // guaranteed >= 0

    // Team names
    let names = Array.isArray(raw.teamNames) ? raw.teamNames.slice(0, teamCount) : [];
    for (let i = 0; i < teamCount; i++) {
        const v = typeof names[i] === 'string' ? names[i].trim() : '';
        names[i] = v || `Team ${i + 1}`;
    }
    names = ensureUniqueNames(names);

    // Combinations — must be length `eligible`, each >= 1, summing to 1000
    let combos = Array.isArray(raw.combinations) ? raw.combinations.map(toInt) : [];
    const combosValid = combos.length === eligible && combos.every((v) => v != null && v >= 1);
    if (!combosValid) { combos = generateWeights(eligible); adjusted = true; }
    else if (combos.reduce((a, b) => a + b, 0) !== 1000) { combos = normalizeToThousand(combos); adjusted = true; }

    let rounds = toInt(raw.rounds);
    if (rounds == null) { rounds = 3; adjusted = true; }
    rounds = clamp(rounds, 1, MAX_ROUNDS);

    const draftFormat = raw.draftFormat === 'linear' ? 'linear' : 'snake';
    const leagueName = (typeof raw.leagueName === 'string' && raw.leagueName.trim())
        ? raw.leagueName.trim().slice(0, 60) : 'My Fantasy League';

    const config = {
        leagueName, teamCount, teamNames: names,
        drawnPicks, byRecordPicks, lockedPicks,
        combinations: combos, rounds, draftFormat,
        odds: computeOdds(combos, drawnPicks),
    };
    return { config, adjusted };
}

function loadLeagueConfig() {
    try {
        const saved = localStorage.getItem(LS_KEY_LEAGUE_CONFIG);
        if (!saved) return null;
        const result = sanitizeConfig(JSON.parse(saved));
        if (!result) return null;
        // Re-persist a repaired config so the app self-heals a corrupt entry.
        if (result.adjusted) safeSetItem(LS_KEY_LEAGUE_CONFIG, JSON.stringify(result.config));
        return result.config;
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

function safeSetItem(key, value) {
    try { localStorage.setItem(key, value); }
    catch (e) { showToast('Unable to save — browser storage is full or blocked.', 'warning'); }
}

// ============================================
// STATE
// ============================================
let teams = [];
let pickOwnership = [];          // pickOwnership[round][originalTeamIndex] = ownerIndex | null(self)
let lastLotteryResult = null;
let activeCeremony = null;

function generateTeamLabels(teamCount) {
    const labels = new Array(teamCount);
    if (teamCount >= 1) labels[teamCount - 1] = 'Champion';
    if (teamCount >= 2) labels[teamCount - 2] = 'Runner-up';
    if (teamCount >= 3) labels[teamCount - 3] = '3rd place';
    for (let i = teamCount - 4; i >= 0; i--) labels[i] = `${formatOrdinal(teamCount - i)} seed`;
    return labels;
}

function initStateFromConfig() {
    const combos = leagueConfig.combinations;
    const chances = [...combos, ...new Array(leagueConfig.lockedPicks).fill(0)];
    teams = chances.map((c, i) => ({ name: leagueConfig.teamNames[i] || `Team ${i + 1}`, chances: c }));
    pickOwnership = Array.from({ length: leagueConfig.rounds }, () =>
        new Array(leagueConfig.teamCount).fill(null));
}

function clearTransientKeys() {
    localStorage.removeItem(LS_KEY_PICK_OWNERSHIP);
    localStorage.removeItem(LS_KEY_HISTORY);
    LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
    lastLotteryResult = null;
}

// ============================================
// LOTTERY SIMULATION (official draw)
// ============================================
function runLotterySimulation() {
    const eligible = leagueConfig.drawnPicks + leagueConfig.byRecordPicks;
    const lotteryTeams = teams.slice(0, eligible).map((t, i) => ({ ...t, originalIndex: i }));
    const drawnIndices = new Set();
    const drawnTeams = [];
    let redraws = 0;

    for (let pick = 0; pick < leagueConfig.drawnPicks; pick++) {
        let guard = 0;
        while (guard++ < 200000) {
            const r = Math.random() * TOTAL_POOL;
            if (r >= ASSIGNED) { redraws++; continue; } // discarded combination → redraw (NBA rule)
            let cum = 0, hit = null;
            for (let i = 0; i < lotteryTeams.length; i++) {
                cum += lotteryTeams[i].chances;
                if (r < cum) { hit = lotteryTeams[i]; break; }
            }
            if (!hit || drawnIndices.has(hit.originalIndex)) continue;
            drawnIndices.add(hit.originalIndex);
            drawnTeams.push(hit);
            break;
        }
    }

    const remaining = lotteryTeams
        .filter((t) => !drawnIndices.has(t.originalIndex))
        .sort((a, b) => a.originalIndex - b.originalIndex);
    const ordered = [...drawnTeams, ...remaining];

    const results = new Array(leagueConfig.teamCount);
    for (let i = 0; i < eligible; i++) results[i] = ordered[i];
    for (let i = eligible; i < leagueConfig.teamCount; i++) results[i] = { ...teams[i], originalIndex: i };

    const mapped = results.map((t) => ({ name: t.name, chances: t.chances, originalIndex: t.originalIndex }));
    mapped.redraws = redraws;
    return mapped;
}

function analyzeLotteryJumps(results) {
    const jumpers = [], fallers = [];
    const drawnSeedMax = leagueConfig.drawnPicks - 1;
    results.forEach((team, index) => {
        if (!team || typeof team.originalIndex !== 'number') return;
        if (index < leagueConfig.drawnPicks && team.originalIndex > drawnSeedMax) {
            jumpers.push({ team, pick: index + 1, fromSeed: team.originalIndex + 1 });
        }
        if (index >= leagueConfig.drawnPicks &&
            index < leagueConfig.drawnPicks + leagueConfig.byRecordPicks &&
            team.originalIndex <= drawnSeedMax) {
            fallers.push({ team, pick: index + 1, fromSeed: team.originalIndex + 1 });
        }
    });
    return {
        jumpers, fallers,
        jumpersByPick: new Map(jumpers.map((e) => [e.pick, e])),
        fallersByPick: new Map(fallers.map((e) => [e.pick, e])),
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
            const pos = reversed ? leagueConfig.teamCount - 1 - slot : slot;
            const originalTeamIndex = lotteryResults[pos].originalIndex;
            const ownerIndex = pickOwnership[round][originalTeamIndex] ?? originalTeamIndex;
            rows.push({
                pickNumber: overallPick++,
                teamName: teams[ownerIndex].name,
                viaName: ownerIndex !== originalTeamIndex ? teams[originalTeamIndex].name : null,
            });
        }
    }
    return rows;
}

// ============================================
// UI — league summary + teams
// ============================================
function renderLeagueSummary() {
    const el = document.getElementById('leagueSummary');
    if (!el) return;
    const c = leagueConfig;
    const chips = [
        ['Teams', c.teamCount],
        ['Drawn picks', c.drawnPicks],
        ['By record', c.byRecordPicks],
        ['Rounds', c.rounds],
        ['Format', c.draftFormat === 'linear' ? 'Linear' : 'Snake'],
    ];
    el.innerHTML = '';
    chips.forEach(([label, value]) => {
        const chip = document.createElement('span');
        chip.className = 'summary-chip';
        chip.innerHTML = `${label} <strong></strong>`;
        chip.querySelector('strong').textContent = value;
        el.appendChild(chip);
    });
}

function createTeamInputs() {
    const wrap = document.getElementById('teamInputs');
    if (!wrap) return;
    wrap.innerHTML = '';
    const labels = generateTeamLabels(leagueConfig.teamCount);

    teams.forEach((team, index) => {
        const row = document.createElement('div');
        row.className = 'team-input-row';

        const label = document.createElement('label');
        label.textContent = labels[index] || `Team ${index + 1}`;
        label.setAttribute('for', `team-input-${index}`);

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'team-name-input';
        input.id = `team-input-${index}`;
        input.maxLength = 40;
        input.value = team.name;
        input.setAttribute('aria-label', `Name for ${labels[index]}`);

        input.addEventListener('input', () => {
            const val = input.value.trim();
            team.name = val || `Team ${index + 1}`;
            leagueConfig.teamNames[index] = team.name;
            const dup = teams.some((t, i) => i !== index && t.name.toLowerCase() === team.name.toLowerCase());
            input.classList.toggle('input-error', dup);
            refreshOwnershipOptionLabels();
        });
        input.addEventListener('change', () => {
            saveLeagueConfig(leagueConfig);
            renderOwnershipSummary();
        });

        row.appendChild(label);
        row.appendChild(input);
        wrap.appendChild(row);
    });
}

// ============================================
// ODDS TABLE
// ============================================
function refreshOddsTableBody() {
    const table = document.getElementById('oddsTable');
    if (!table || !leagueConfig) return;
    table.innerHTML = '';
    const eligible = leagueConfig.drawnPicks + leagueConfig.byRecordPicks;
    const labels = generateTeamLabels(leagueConfig.teamCount);

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const th0 = document.createElement('th'); th0.textContent = 'Team'; th0.scope = 'col';
    headRow.appendChild(th0);
    for (let i = 0; i < eligible; i++) {
        const th = document.createElement('th'); th.textContent = formatOrdinal(i + 1); th.scope = 'col';
        headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    let maxVal = 0;
    for (let t = 0; t < eligible; t++) for (let p = 0; p < eligible; p++) {
        const v = leagueConfig.odds[t]?.[p]; if (typeof v === 'number' && v > maxVal) maxVal = v;
    }
    if (maxVal <= 0) maxVal = 100;

    const tbody = document.createElement('tbody');
    for (let t = 0; t < eligible; t++) {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td'); nameCell.textContent = labels[t];
        row.appendChild(nameCell);
        const teamOdds = leagueConfig.odds[t] || [];
        for (let p = 0; p < eligible; p++) {
            const cell = document.createElement('td');
            const v = teamOdds[p];
            if (typeof v === 'number' && v > 0) {
                cell.textContent = `${v.toFixed(1)}%`;
                const alpha = 0.08 + (v / maxVal) * 0.42; // subtle blue heat on the dark surface
                cell.style.background = `rgba(59, 130, 246, ${alpha.toFixed(3)})`;
            } else {
                cell.textContent = '0.0%';
                cell.className = 'odds-cell-dim';
            }
            row.appendChild(cell);
        }
        tbody.appendChild(row);
    }
    table.appendChild(tbody);
}

// ============================================
// PICK OWNERSHIP (defaults to self-owned)
// ============================================
function countTrades() {
    let count = 0;
    for (let r = 0; r < pickOwnership.length; r++)
        for (let i = 0; i < pickOwnership[r].length; i++) {
            const v = pickOwnership[r][i];
            if (v != null && v !== i) count++;
        }
    return count;
}

function renderOwnershipSummary() {
    const el = document.getElementById('ownershipSummary');
    if (!el) return;
    const trades = countTrades();
    el.innerHTML = trades === 0
        ? 'Every team owns its own picks in every round.'
        : `<span class="badge-count">${trades}</span> traded ${trades === 1 ? 'pick' : 'picks'} reassigned to another team.`;
}

function refreshOwnershipOptionLabels() {
    document.querySelectorAll('#pickOwnershipTable select').forEach((select) => {
        Array.from(select.options).forEach((opt) => {
            const idx = parseInt(opt.value, 10);
            if (Number.isInteger(idx) && teams[idx]) opt.textContent = teams[idx].name;
        });
        const origIdx = parseInt(select.dataset.original, 10);
        const cell = select.closest('tr')?.querySelector('.original-team-cell');
        if (cell && teams[origIdx]) cell.textContent = teams[origIdx].name;
    });
}

function createPickOwnershipTable() {
    const container = document.getElementById('pickOwnershipTable');
    if (!container) return;
    container.innerHTML = '';

    const table = document.createElement('table');
    table.className = 'pick-ownership-table';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['Round · team', 'Drafted by'].forEach((text) => {
        const th = document.createElement('th'); th.textContent = text; th.scope = 'col';
        headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let round = 0; round < leagueConfig.rounds; round++) {
        const rh = document.createElement('tr'); rh.className = 'round-header';
        const rhCell = document.createElement('td'); rhCell.colSpan = 2; rhCell.textContent = `Round ${round + 1}`;
        rh.appendChild(rhCell); tbody.appendChild(rh);

        for (let i = 0; i < leagueConfig.teamCount; i++) {
            const row = document.createElement('tr');

            const origCell = document.createElement('td');
            origCell.className = 'original-team-cell';
            origCell.textContent = teams[i].name;
            row.appendChild(origCell);

            const ownerCell = document.createElement('td');
            const select = document.createElement('select');
            select.dataset.original = i;
            select.setAttribute('aria-label', `Round ${round + 1}: who drafts ${teams[i].name}'s pick`);
            teams.forEach((team, teamIndex) => {
                const opt = document.createElement('option');
                opt.value = teamIndex; opt.textContent = team.name;
                const current = pickOwnership[round][i] ?? i;
                if (current === teamIndex) opt.selected = true;
                select.appendChild(opt);
            });
            if ((pickOwnership[round][i] ?? i) !== i) select.classList.add('traded');

            select.addEventListener('change', function () {
                const chosen = parseInt(this.value, 10);
                pickOwnership[round][i] = chosen === i ? null : chosen;
                this.classList.toggle('traded', chosen !== i);
                savePickOwnership();
                renderOwnershipSummary();
            });

            ownerCell.appendChild(select);
            row.appendChild(ownerCell);
            tbody.appendChild(row);
        }
    }
    table.appendChild(tbody);
    container.appendChild(table);
}

function savePickOwnership() {
    safeSetItem(LS_KEY_PICK_OWNERSHIP, JSON.stringify(pickOwnership));
}

function loadSavedPickOwnership() {
    try {
        const saved = localStorage.getItem(LS_KEY_PICK_OWNERSHIP);
        if (!saved) return;
        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed) || parsed.length !== leagueConfig.rounds) return;
        for (let r = 0; r < leagueConfig.rounds; r++) {
            if (!Array.isArray(parsed[r]) || parsed[r].length !== leagueConfig.teamCount) return;
            for (let i = 0; i < leagueConfig.teamCount; i++) {
                const v = parsed[r][i];
                if (v === null || (Number.isInteger(v) && v >= 0 && v < leagueConfig.teamCount)) {
                    pickOwnership[r][i] = v;
                }
            }
        }
    } catch (e) { console.warn('Failed to load pick ownership', e); }
}

function resetOwnership() {
    pickOwnership = Array.from({ length: leagueConfig.rounds }, () => new Array(leagueConfig.teamCount).fill(null));
    savePickOwnership();
    createPickOwnershipTable();
    renderOwnershipSummary();
    showToast('Pick ownership reset — every team owns its own picks.', 'success');
}

// ============================================
// TOASTS
// ============================================
function ensureToastContainer() {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        container.setAttribute('role', 'status');
        container.setAttribute('aria-live', 'polite');
        document.body.appendChild(container);
    }
    return container;
}

function showToast(message, type = 'error', duration) {
    const container = ensureToastContainer();
    if (duration == null) duration = type === 'error' ? 6000 : 3400;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const msg = document.createElement('span');
    msg.className = 'toast-message';
    msg.textContent = message;
    toast.appendChild(msg);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.innerHTML = '&times;';
    close.setAttribute('aria-label', 'Dismiss notification');
    toast.appendChild(close);

    container.appendChild(toast);

    let timer = null;
    const remove = () => {
        if (!toast.parentNode) return;
        toast.classList.add('leaving');
        setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    };
    const start = () => { timer = setTimeout(remove, duration); };
    const pause = () => { if (timer) { clearTimeout(timer); timer = null; } };

    close.addEventListener('click', () => { pause(); remove(); });
    toast.addEventListener('mouseenter', pause);
    toast.addEventListener('mouseleave', start);
    toast.addEventListener('focusin', pause);
    toast.addEventListener('focusout', start);
    start();
}

// ============================================
// CONFIRM DIALOG (with focus restoration)
// ============================================
function showConfirm(message, onConfirm, onCancel) {
    const invoker = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const card = document.createElement('div');
    card.className = 'confirm-card';
    card.innerHTML = `<h3 class="confirm-title">Are you sure?</h3><p class="confirm-message"></p>`;
    card.querySelector('.confirm-message').textContent = message;

    const actions = document.createElement('div');
    actions.className = 'confirm-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'confirm-btn-cancel'; cancelBtn.textContent = 'Cancel';
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'confirm-btn-confirm'; confirmBtn.textContent = 'Yes, continue';
    actions.appendChild(cancelBtn); actions.appendChild(confirmBtn);
    card.appendChild(actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const removeTrap = trapFocus(overlay);
    const dismiss = () => {
        removeTrap();
        document.removeEventListener('keydown', onKey);
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (invoker && typeof invoker.focus === 'function') invoker.focus();
    };
    function onKey(e) { if (e.key === 'Escape') { dismiss(); onCancel?.(); } }
    document.addEventListener('keydown', onKey);
    cancelBtn.addEventListener('click', () => { dismiss(); onCancel?.(); });
    confirmBtn.addEventListener('click', () => { dismiss(); onConfirm(); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { dismiss(); onCancel?.(); } });
    confirmBtn.focus();
}

function trapFocus(container) {
    function handler(e) {
        if (e.key !== 'Tab') return;
        const focusable = container.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    container.addEventListener('keydown', handler);
    return () => container.removeEventListener('keydown', handler);
}

// ============================================
// QUICK START
// ============================================
const LEAGUE_PRESETS = [
    { id: 'football', icon: '🏈', sport: 'Fantasy Football', tagline: '12 teams · 5 rounds · snake',
      config: { leagueName: 'Fantasy Football League', teamCount: 12,
        teamNames: ['Hail Marys', 'Fumble Bros', 'Gridiron Gods', 'Blitz Brigade', 'End Zone Elites', 'Pocket Rockets', 'First & Ten', 'Pigskin Posse', 'Touchdown Tyrants', 'Fantasy Phenoms', 'The Destroyers', 'Smash FC'],
        drawnPicks: 4, byRecordPicks: 8, combinations: generateWeights(12), rounds: 5, draftFormat: 'snake' } },
    { id: 'basketball', icon: '🏀', sport: 'Fantasy Basketball', tagline: '10 teams · 3 rounds · snake',
      config: { leagueName: 'Fantasy Basketball League', teamCount: 10,
        teamNames: ['Hoop Dreams', 'Rim Wreckers', 'Splash Zone', 'Dunk Dynasty', 'Full Court Press', 'Paint Monsters', 'Fast Break Kings', '3-Point Assassins', 'The Buckets', 'Bball Ballers'],
        drawnPicks: 3, byRecordPicks: 7, combinations: generateWeights(10), rounds: 3, draftFormat: 'snake' } },
    { id: 'hockey', icon: '🏒', sport: 'Fantasy Hockey', tagline: '10 teams · 3 rounds · snake',
      config: { leagueName: 'Fantasy Hockey League', teamCount: 10,
        teamNames: ['Ice Cold', 'Puck Wizards', 'Hat Trick Heroes', 'Chirp Kings', 'Power Plays', 'Tendy Gang', 'The Snipes', 'Penalty Box', 'Blue Liners', 'Biscuit Boys'],
        drawnPicks: 3, byRecordPicks: 7, combinations: generateWeights(10), rounds: 3, draftFormat: 'snake' } },
    { id: 'baseball', icon: '⚾', sport: 'Fantasy Baseball', tagline: '12 teams · 5 rounds · snake',
      config: { leagueName: 'Fantasy Baseball League', teamCount: 12,
        teamNames: ['Diamond Dogs', 'Bat Boys', 'Home Run Heroes', 'Curveball Kings', 'Clutch Hitters', 'Grand Slammers', 'Bullpen Bombers', 'Extra Innings', 'Ace Pitchers', 'Southpaw City', 'Walks & Balks', 'The Mudcats'],
        drawnPicks: 4, byRecordPicks: 8, combinations: generateWeights(12), rounds: 5, draftFormat: 'snake' } },
];

function showQuickStart() {
    const overlay = document.getElementById('setupWizard');
    if (!overlay) return;
    overlay.style.display = 'flex';
    document.getElementById('appContainer').style.display = 'none';
    overlay.setAttribute('aria-label', 'Quick start');
    overlay.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'wizard-card quickstart-card';
    card.innerHTML = `
        <p class="quickstart-kicker">Draft Lottery Simulator</p>
        <h1 class="quickstart-title">Run your league's draft lottery</h1>
        <p class="quickstart-sub">Pick a sport to load a demo league and run the lottery instantly — or build your own from scratch.</p>
        <div class="quickstart-grid"></div>
        <div class="quickstart-divider"><span>or</span></div>
        <button type="button" class="quickstart-custom-btn">Set up my own league →</button>`;

    const grid = card.querySelector('.quickstart-grid');
    LEAGUE_PRESETS.forEach((preset) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'quickstart-preset-btn';
        btn.innerHTML = `<span class="quickstart-icon" aria-hidden="true">${preset.icon}</span>
            <strong></strong><span class="quickstart-tag"></span>`;
        btn.querySelector('strong').textContent = preset.sport;
        btn.querySelector('.quickstart-tag').textContent = preset.tagline;
        btn.addEventListener('click', () => loadPreset(preset));
        grid.appendChild(btn);
    });

    card.querySelector('.quickstart-custom-btn').addEventListener('click', () => showSetupWizard(null));
    overlay.appendChild(card);
    grid.querySelector('button')?.focus();
}

function loadPreset(preset) {
    const result = sanitizeConfig(preset.config);
    if (!result) { showToast('Could not load that preset.', 'error'); return; }
    clearTransientKeys();
    saveLeagueConfig(result.config);
    hideWizard();
    safeInitApp();
    showToast(`${preset.sport} demo loaded — edit names or run the lottery.`, 'success');
}

function hideWizard() {
    const overlay = document.getElementById('setupWizard');
    if (overlay) { overlay.style.display = 'none'; overlay.innerHTML = ''; }
    document.getElementById('appContainer').style.display = '';
}

// ============================================
// SETUP WIZARD
// ============================================
function showSetupWizard(existingConfig) {
    const overlay = document.getElementById('setupWizard');
    if (!overlay) return;
    overlay.setAttribute('aria-label', existingConfig ? 'Reconfigure league' : 'Set up league');

    const isEdit = !!existingConfig;
    const config = existingConfig ? JSON.parse(JSON.stringify(existingConfig)) : {
        leagueName: 'My Fantasy League', teamCount: 10,
        teamNames: Array.from({ length: 10 }, (_, i) => `Team ${i + 1}`),
        drawnPicks: 4, byRecordPicks: 6, combinations: generateWeights(10),
        rounds: 3, draftFormat: 'snake',
    };
    const oldTeamCount = config.teamCount;
    const oldStructureKey = `${config.teamCount}|${config.drawnPicks}|${config.byRecordPicks}|${config.rounds}`;

    let currentStep = 0;
    const totalSteps = 7;
    const stepRenderers = [renderLeagueName, renderTeamCount, renderTeamNames,
        renderLotteryStructure, renderCombinations, renderDraftFormat, renderDraftRounds];

    overlay.style.display = 'flex';
    document.getElementById('appContainer').style.display = 'none';

    function render() {
        overlay.innerHTML = '';
        const card = document.createElement('div');
        card.className = 'wizard-card';

        const progress = document.createElement('div');
        progress.className = 'wizard-progress';
        for (let i = 0; i < totalSteps; i++) {
            const dot = document.createElement('div');
            dot.className = 'wizard-progress-dot' +
                (i < currentStep ? ' completed' : '') + (i === currentStep ? ' active' : '');
            progress.appendChild(dot);
        }
        card.appendChild(progress);

        stepRenderers[currentStep](card);

        const errEl = document.createElement('p');
        errEl.className = 'wizard-inline-error';
        errEl.id = 'wizardError';
        errEl.setAttribute('aria-live', 'polite');
        card.appendChild(errEl);

        const nav = document.createElement('div');
        nav.className = 'wizard-nav';
        const left = document.createElement('div');
        left.className = 'wizard-nav-left';

        if (currentStep > 0) {
            const back = document.createElement('button');
            back.type = 'button'; back.className = 'wizard-btn-back'; back.textContent = 'Back';
            back.addEventListener('click', () => { captureStep(); currentStep--; render(); });
            left.appendChild(back);
        }
        const escape = document.createElement('button');
        escape.type = 'button'; escape.className = 'wizard-btn-back';
        escape.textContent = isEdit ? 'Cancel' : '← Quick Start';
        escape.addEventListener('click', () => {
            if (isEdit) { hideWizard(); }
            else { showConfirm('Discard this setup and go back to the sport picker?', () => showQuickStart()); }
        });
        left.appendChild(escape);
        nav.appendChild(left);

        const next = document.createElement('button');
        next.type = 'button'; next.className = 'wizard-btn-next';
        next.textContent = currentStep === totalSteps - 1 ? 'Finish setup' : 'Next';
        next.addEventListener('click', () => {
            if (!validateStep()) return;
            if (currentStep === totalSteps - 1) finishWizard();
            else { currentStep++; render(); }
        });
        nav.appendChild(next);

        card.appendChild(nav);
        overlay.appendChild(card);
        card.querySelector('input:not([type=radio]), input[type=text], input[type=number]')?.focus();
    }

    function wizError(msg) { const e = document.getElementById('wizardError'); if (e) e.textContent = msg || ''; }

    function renderLeagueName(card) {
        card.insertAdjacentHTML('beforeend',
            `<h2 class="wizard-title">League name</h2>
             <p class="wizard-subtitle">What's your fantasy league called?</p>
             <div class="wizard-field"><input type="text" id="wizLeagueName" maxlength="60" placeholder="My Fantasy League"></div>`);
        card.querySelector('#wizLeagueName').value = config.leagueName || '';
    }
    function renderTeamCount(card) {
        card.insertAdjacentHTML('beforeend',
            `<h2 class="wizard-title">Number of teams</h2>
             <p class="wizard-subtitle">How many teams are in your league? (${MIN_TEAMS}–${MAX_TEAMS})</p>
             <div class="wizard-field"><input type="number" id="wizTeamCount" min="${MIN_TEAMS}" max="${MAX_TEAMS}"></div>`);
        card.querySelector('#wizTeamCount').value = config.teamCount || 10;
    }
    function renderTeamNames(card) {
        card.insertAdjacentHTML('beforeend',
            `<h2 class="wizard-title">Team names</h2>
             <p class="wizard-subtitle">Enter names from worst record to best (standings order).</p>`);
        const labels = generateTeamLabels(config.teamCount);
        const list = document.createElement('div'); list.className = 'wizard-team-list';
        for (let i = 0; i < config.teamCount; i++) {
            const item = document.createElement('div'); item.className = 'wizard-team-item';
            const label = document.createElement('label'); label.textContent = labels[i];
            const input = document.createElement('input'); input.type = 'text'; input.className = 'wiz-team-name';
            input.maxLength = 40; input.placeholder = `Team ${i + 1}`; input.value = config.teamNames[i] || '';
            input.dataset.index = i;
            item.appendChild(label); item.appendChild(input); list.appendChild(item);
        }
        card.appendChild(list);
    }
    function renderLotteryStructure(card) {
        card.insertAdjacentHTML('beforeend',
            `<h2 class="wizard-title">Lottery structure</h2>
             <p class="wizard-subtitle">How are picks decided?</p>`);
        [['wizDrawnPicks', 'Picks drawn by lottery', config.drawnPicks, 1],
         ['wizByRecordPicks', 'Picks by reverse record', config.byRecordPicks, 0]].forEach(([id, label, val, min]) => {
            const row = document.createElement('div'); row.className = 'wizard-structure-row';
            const l = document.createElement('label'); l.textContent = label; l.setAttribute('for', id);
            const input = document.createElement('input'); input.type = 'number'; input.id = id;
            input.min = min; input.max = config.teamCount; input.value = val;
            input.addEventListener('input', updateSummary);
            row.appendChild(l); row.appendChild(input); card.appendChild(row);
        });
        const summary = document.createElement('div'); summary.className = 'wizard-structure-summary';
        summary.id = 'structureSummary'; card.appendChild(summary);
        function updateSummary() {
            const drawn = toInt(document.getElementById('wizDrawnPicks')?.value) || 0;
            const byRec = toInt(document.getElementById('wizByRecordPicks')?.value) || 0;
            const locked = config.teamCount - drawn - byRec;
            const s = document.getElementById('structureSummary');
            if (!s) return;
            if (locked < 0) { s.textContent = `Drawn + by-record exceeds ${config.teamCount} teams.`; s.style.color = 'var(--color-danger)'; }
            else { s.textContent = `${drawn} drawn · ${byRec} by record · ${locked} locked by standings.`; s.style.color = 'var(--color-text-muted)'; }
        }
        setTimeout(updateSummary, 0);
    }
    function renderCombinations(card) {
        card.insertAdjacentHTML('beforeend',
            `<h2 class="wizard-title">Lottery combinations</h2>
             <p class="wizard-subtitle">Assign combinations to each lottery-eligible team. Must total 1,000.</p>
             <p class="helper-text">By-record teams get combinations too — if their number is drawn, they jump into a drawn pick.</p>`);
        const eligible = config.drawnPicks + config.byRecordPicks;
        const labels = generateTeamLabels(config.teamCount);
        const auto = document.createElement('button');
        auto.type = 'button'; auto.className = 'wizard-auto-btn';
        auto.textContent = 'Auto-generate NBA-style weights';
        card.appendChild(auto);
        const list = document.createElement('div'); list.className = 'wizard-combo-list';
        for (let i = 0; i < eligible; i++) {
            const item = document.createElement('div'); item.className = 'wizard-combo-item';
            const label = document.createElement('label'); label.textContent = labels[i];
            const input = document.createElement('input'); input.type = 'number'; input.className = 'wiz-combo';
            input.min = 1; input.max = 999; input.dataset.index = i;
            input.value = config.combinations[i] || '';
            input.addEventListener('input', updateTotal);
            item.appendChild(label); item.appendChild(input); list.appendChild(item);
        }
        card.appendChild(list);
        const total = document.createElement('div'); total.className = 'wizard-combo-total'; total.id = 'comboTotal';
        card.appendChild(total);
        auto.addEventListener('click', () => {
            const w = generateWeights(eligible);
            card.querySelectorAll('.wiz-combo').forEach((inp, i) => { inp.value = w[i] || 0; });
            updateTotal();
        });
        function updateTotal() {
            let sum = 0; card.querySelectorAll('.wiz-combo').forEach((inp) => { sum += toInt(inp.value) || 0; });
            const el = document.getElementById('comboTotal');
            if (el) { el.textContent = `Total: ${sum.toLocaleString()} / 1,000`; el.className = 'wizard-combo-total ' + (sum === 1000 ? 'valid' : 'invalid'); }
        }
        setTimeout(updateTotal, 0);
    }
    function renderDraftFormat(card) {
        card.insertAdjacentHTML('beforeend',
            `<h2 class="wizard-title">Draft format</h2>
             <p class="wizard-subtitle">How does pick order work in later rounds?</p>`);
        const group = document.createElement('div'); group.className = 'wizard-format-group';
        group.setAttribute('role', 'radiogroup'); group.setAttribute('aria-label', 'Draft format');
        [['snake', 'Snake draft', 'Odd rounds 1→N, even rounds N→1. Most common.'],
         ['linear', 'Linear draft', 'Every round runs 1→N in the same order.']].forEach(([value, title, desc]) => {
            const label = document.createElement('label');
            label.className = 'wizard-format-card' + (config.draftFormat === value ? ' selected' : '');
            const radio = document.createElement('input');
            radio.type = 'radio'; radio.name = 'draftFormat'; radio.value = value;
            radio.className = 'wizard-format-radio';
            radio.checked = config.draftFormat === value;
            const strong = document.createElement('strong'); strong.textContent = title;
            const p = document.createElement('p'); p.textContent = desc;
            label.appendChild(radio); label.appendChild(strong); label.appendChild(p);
            radio.addEventListener('change', () => {
                group.querySelectorAll('.wizard-format-card').forEach((c) => c.classList.remove('selected'));
                label.classList.add('selected');
            });
            group.appendChild(label);
        });
        card.appendChild(group);
    }
    function renderDraftRounds(card) {
        card.insertAdjacentHTML('beforeend',
            `<h2 class="wizard-title">Draft rounds</h2>
             <p class="wizard-subtitle">How many rounds? (1–${MAX_ROUNDS})</p>
             <div class="wizard-field"><input type="number" id="wizRounds" min="1" max="${MAX_ROUNDS}"></div>`);
        card.querySelector('#wizRounds').value = config.rounds || 3;
    }

    // Lenient capture (no validation) so Back never loses typed values.
    function captureStep() {
        switch (currentStep) {
            case 0: { const v = document.getElementById('wizLeagueName')?.value; if (v != null) config.leagueName = v.trim() || config.leagueName; break; }
            case 1: { const c = toInt(document.getElementById('wizTeamCount')?.value); if (c) config.teamCount = clamp(c, MIN_TEAMS, MAX_TEAMS); break; }
            case 2: { const names = [...document.querySelectorAll('.wiz-team-name')].map((i) => i.value.trim()); if (names.length) config.teamNames = names.map((n, i) => n || `Team ${i + 1}`); break; }
            case 3: { const d = toInt(document.getElementById('wizDrawnPicks')?.value); const b = toInt(document.getElementById('wizByRecordPicks')?.value); if (d != null) config.drawnPicks = d; if (b != null) config.byRecordPicks = b; break; }
            case 4: { const combos = [...document.querySelectorAll('.wiz-combo')].map((i) => toInt(i.value)); if (combos.length) config.combinations = combos.map((v) => v || 0); break; }
            case 5: { const sel = document.querySelector('input[name="draftFormat"]:checked'); if (sel) config.draftFormat = sel.value; break; }
            case 6: { const r = toInt(document.getElementById('wizRounds')?.value); if (r) config.rounds = r; break; }
        }
    }

    function validateStep() {
        wizError('');
        switch (currentStep) {
            case 0: {
                const name = document.getElementById('wizLeagueName').value.trim();
                if (!name) { wizError('Please enter a league name.'); return false; }
                config.leagueName = name; return true;
            }
            case 1: {
                const count = toInt(document.getElementById('wizTeamCount').value);
                if (!count || count < MIN_TEAMS || count > MAX_TEAMS) { wizError(`Team count must be ${MIN_TEAMS}–${MAX_TEAMS}.`); return false; }
                config.teamCount = count;
                if (config.teamNames.length > count) config.teamNames = config.teamNames.slice(0, count);
                while (config.teamNames.length < count) config.teamNames.push(`Team ${config.teamNames.length + 1}`);
                if (config.drawnPicks + config.byRecordPicks > count) {
                    config.drawnPicks = Math.min(config.drawnPicks, count);
                    config.byRecordPicks = Math.min(config.byRecordPicks, count - config.drawnPicks);
                }
                return true;
            }
            case 2: {
                const inputs = document.querySelectorAll('.wiz-team-name');
                const names = [], seen = new Set();
                for (const inp of inputs) {
                    const v = inp.value.trim();
                    if (!v) { wizError('Please name every team.'); return false; }
                    if (seen.has(v.toLowerCase())) { wizError(`Duplicate name: "${v}". Names must be unique.`); return false; }
                    seen.add(v.toLowerCase()); names.push(v);
                }
                config.teamNames = names; return true;
            }
            case 3: {
                const drawn = toInt(document.getElementById('wizDrawnPicks').value);
                const byRec = toInt(document.getElementById('wizByRecordPicks').value);
                if (!drawn || drawn < 1) { wizError('At least 1 pick must be drawn by lottery.'); return false; }
                if (byRec == null || byRec < 0) { wizError('By-record picks must be 0 or more.'); return false; }
                if (drawn + byRec > config.teamCount) { wizError(`Drawn + by-record can't exceed ${config.teamCount} teams.`); return false; }
                const eligible = drawn + byRec;
                if (config.drawnPicks + config.byRecordPicks !== eligible) config.combinations = generateWeights(eligible);
                config.drawnPicks = drawn; config.byRecordPicks = byRec;
                return true;
            }
            case 4: {
                const inputs = document.querySelectorAll('.wiz-combo');
                const combos = []; let sum = 0;
                for (const inp of inputs) {
                    const v = toInt(inp.value);
                    if (!v || v < 1) { wizError('Each team needs at least 1 combination.'); return false; }
                    combos.push(v); sum += v;
                }
                if (sum !== 1000) { wizError(`Combinations must total 1,000 (currently ${sum.toLocaleString()}).`); return false; }
                config.combinations = combos; return true;
            }
            case 5: {
                const sel = document.querySelector('input[name="draftFormat"]:checked');
                if (!sel) { wizError('Please choose a draft format.'); return false; }
                config.draftFormat = sel.value; return true;
            }
            case 6: {
                const rounds = toInt(document.getElementById('wizRounds').value);
                if (!rounds || rounds < 1 || rounds > MAX_ROUNDS) { wizError(`Rounds must be 1–${MAX_ROUNDS}.`); return false; }
                config.rounds = rounds; return true;
            }
        }
        return true;
    }

    function finishWizard() {
        const result = sanitizeConfig(config);
        if (!result) { wizError('Something went wrong with the configuration.'); return; }
        const newStructureKey = `${result.config.teamCount}|${result.config.drawnPicks}|${result.config.byRecordPicks}|${result.config.rounds}`;
        // Any structural change (or a brand-new league) invalidates saved pick ownership.
        if (!isEdit || newStructureKey !== oldStructureKey || result.config.teamCount !== oldTeamCount) {
            localStorage.removeItem(LS_KEY_PICK_OWNERSHIP);
        }
        if (!isEdit) clearTransientKeys();
        saveLeagueConfig(result.config);
        hideWizard();
        safeInitApp();
        showToast(isEdit ? 'League updated.' : 'League ready — run the lottery when you are.', 'success');
    }

    render();
}

// ============================================
// REVEAL CEREMONY
// ============================================
function runLottery() {
    if (!leagueConfig) return;
    if (activeCeremony) return; // re-entry guard: one ceremony at a time

    const input = document.getElementById('magicNumber');
    const rawMagic = (input?.value || '').trim();
    const magicNumber = toInt(rawMagic);
    if (magicNumber == null || magicNumber < 1 || magicNumber > 99) {
        showToast('Enter a magic number between 1 and 99 before running.', 'warning');
        input?.focus();
        return;
    }

    // Team names are already live in `teams`; make sure config is persisted.
    saveLeagueConfig(leagueConfig);

    const precomputed = [];
    for (let i = 0; i < magicNumber; i++) precomputed.push(runLotterySimulation());

    activeCeremony = createCeremony(precomputed, magicNumber);
    activeCeremony.start();
}

function createCeremony(precomputed, magicNumber) {
    const RM = prefersReducedMotion();
    const T = {
        iteration: RM ? 220 : 750,
        calculating: RM ? 400 : 3200,
        pick: RM ? 200 : 2100,
        nextBtn: RM ? 120 : 700,
        countdown: RM ? 1 : 3,
        start: RM ? 120 : 700,
    };
    const official = precomputed[magicNumber - 1];
    const jumpAnalysis = analyzeLotteryJumps(official);
    const invoker = document.activeElement;
    let cancelled = false;
    let committed = false;
    const timers = new Set();

    const schedule = (fn, ms) => {
        const id = setTimeout(() => { timers.delete(id); if (!cancelled) fn(); }, ms);
        timers.add(id);
        return id;
    };
    const clearAll = () => { timers.forEach((id) => clearTimeout(id)); timers.clear(); };

    // ---- Build modal ----
    const overlay = document.createElement('div');
    overlay.className = 'lottery-fullscreen';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Draft lottery reveal');

    const content = document.createElement('div');
    content.className = 'lottery-content';
    overlay.appendChild(content);

    const topBar = document.createElement('div');
    topBar.className = 'modal-top-bar';
    const skipBtn = document.createElement('button');
    skipBtn.type = 'button'; skipBtn.className = 'skip-button'; skipBtn.textContent = 'Skip to results';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button'; closeBtn.className = 'close-button'; closeBtn.innerHTML = '&times;';
    closeBtn.setAttribute('aria-label', 'Close without saving this run');
    topBar.appendChild(skipBtn); topBar.appendChild(closeBtn);
    content.appendChild(topBar);

    const title = document.createElement('h2');
    title.className = 'lottery-title';
    title.textContent = magicNumber > 1
        ? `${leagueConfig.leagueName} — simulation ${magicNumber} is official`
        : `${leagueConfig.leagueName} draft lottery`;
    content.appendChild(title);

    const stage = document.createElement('div');
    stage.className = 'lottery-animation-container';
    content.appendChild(stage);

    document.body.appendChild(overlay);
    document.getElementById('appContainer').setAttribute('inert', '');
    document.querySelector('.site-footer')?.setAttribute('inert', '');

    const removeTrap = trapFocus(overlay);
    const onKey = (e) => { if (e.key === 'Escape') teardown(false); };
    document.addEventListener('keydown', onKey);
    skipBtn.focus();

    function focusSafe() {
        if (!overlay.contains(document.activeElement)) skipBtn.focus();
    }

    function teardown(finalize) {
        if (cancelled) return;
        cancelled = true;
        clearAll();
        if (finalize && !committed) finish(official, true);
        removeTrap();
        document.removeEventListener('keydown', onKey);
        document.getElementById('appContainer').removeAttribute('inert');
        document.querySelector('.site-footer')?.removeAttribute('inert');
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        activeCeremony = null;
        if (invoker && typeof invoker.focus === 'function') invoker.focus();
        else document.getElementById('resultsSection')?.scrollIntoView({ behavior: 'smooth' });
    }

    closeBtn.addEventListener('click', () => teardown(false));
    skipBtn.addEventListener('click', () => {
        // Stop the animation but commit the official result and close.
        clearAll();
        cancelled = false; // allow finish to run once
        finish(official, false);
        teardownAfterSkip();
    });

    function teardownAfterSkip() {
        cancelled = true;
        clearAll();
        removeTrap();
        document.removeEventListener('keydown', onKey);
        document.getElementById('appContainer').removeAttribute('inert');
        document.querySelector('.site-footer')?.removeAttribute('inert');
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        activeCeremony = null;
        document.getElementById('resultsSection')?.scrollIntoView({ behavior: 'smooth' });
    }

    // ---- Pick timer (countdown) ----
    function showPickTimer(seconds, done) {
        if (seconds <= 1) { schedule(done, T.pick / 2); return; }
        const box = document.createElement('div');
        box.className = 'pick-timer-container';
        box.innerHTML = `<div class="pick-timer-label">Revealing in</div><div class="pick-timer-display">${seconds}</div>`;
        overlay.appendChild(box);
        const display = box.querySelector('.pick-timer-display');
        let remaining = seconds;
        const tick = () => {
            remaining--;
            if (remaining > 0) {
                display.textContent = remaining;
                if (remaining <= 1) { display.classList.add('urgent'); box.classList.add('urgent'); }
                schedule(tick, 1000);
            } else {
                if (box.parentNode) box.parentNode.removeChild(box);
                done();
            }
        };
        schedule(tick, 1000);
    }

    // ---- Stages ----
    function start() {
        if (magicNumber > 1) runQuickIterations();
        else runFinal();
    }

    // Slot-machine pacing: settle in, spin fast, brake hard before the official sim.
    function iterationDelay(i, total) {
        if (RM) return T.iteration;
        if (total <= 6) return 620;
        if (i >= total - 3) return [520, 800, 1150][i - (total - 3)];
        return Math.max(90, Math.round(500 * Math.pow(0.55, i)));
    }

    // FLIP: let existing children glide (not jump) when an insert shifts them.
    function flipShift(container, mutate) {
        if (RM) { mutate(); return; }
        const kids = Array.from(container.children);
        const tops = kids.map((el) => el.getBoundingClientRect().top);
        mutate();
        kids.forEach((el, k) => {
            const d = tops[k] - el.getBoundingClientRect().top;
            if (d) el.animate(
                [{ transform: `translateY(${d}px)` }, { transform: 'translateY(0)' }],
                { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
            );
        });
    }

    function runQuickIterations() {
        const total = magicNumber - 1;
        stage.innerHTML = '';
        const header = document.createElement('div');
        header.className = 'iteration-number';
        stage.appendChild(header);

        const list = document.createElement('div');
        list.className = 'quick-iteration-list';
        const show = Math.min(leagueConfig.drawnPicks, 3);
        const nameEls = [];
        for (let p = 0; p < show; p++) {
            const row = document.createElement('div');
            row.className = 'quick-row' + (p === 0 ? ' qr-top' : '');
            row.innerHTML = `<span class="qr-rank">${formatOrdinal(p + 1)}</span><span class="qr-name"></span>`;
            list.appendChild(row);
            nameEls.push(row.querySelector('.qr-name'));
        }
        stage.appendChild(list);
        focusSafe();

        // The rows persist; only the names roll over — no stage wipe, no strobe.
        const step = (i) => {
            if (i >= total) { runFinal(); return; }
            header.textContent = `Simulation ${i + 1} of ${total}`;
            const res = precomputed[i];
            nameEls.forEach((el, p) => {
                el.textContent = res[p].name;
                if (!RM) { el.classList.remove('roll'); void el.offsetWidth; el.classList.add('roll'); }
            });
            schedule(() => step(i + 1), iterationDelay(i, total));
        };
        step(0);
    }

    function runFinal() {
        stage.innerHTML = '';
        const calc = document.createElement('div');
        calc.className = 'fullscreen-calculating';
        calc.textContent = 'Calculating the official draft order…';
        stage.appendChild(calc);
        focusSafe();
        schedule(revealAutoPicks, T.calculating);
    }

    function revealAutoPicks() {
        const autoCount = leagueConfig.lockedPicks + leagueConfig.byRecordPicks;
        if (autoCount === 0) { revealExtraThenPodium(); return; }
        stage.innerHTML = '';
        const header = document.createElement('div');
        header.className = 'batch-header';
        header.textContent = `Picks ${leagueConfig.teamCount} down to ${leagueConfig.drawnPicks + 1}`;
        stage.appendChild(header);
        const wrapper = document.createElement('div');
        wrapper.className = 'automatic-picks-wrapper';
        stage.appendChild(wrapper);
        focusSafe();

        let idx = leagueConfig.teamCount - 1;
        const showNext = () => {
            if (idx < leagueConfig.drawnPicks) {
                schedule(() => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'lottery-button';
                    btn.textContent = `Reveal the top ${leagueConfig.drawnPicks} picks`;
                    btn.addEventListener('click', () => { stage.innerHTML = ''; revealExtraThenPodium(); });
                    stage.appendChild(btn);
                    btn.focus();
                }, T.nextBtn);
                return;
            }
            const item = document.createElement('div');
            item.className = 'fullscreen-result-item';
            const pickNo = idx + 1;
            item.textContent = `Pick ${pickNo}: ${official[idx].name}`;
            item.classList.add(idx >= leagueConfig.drawnPicks + leagueConfig.byRecordPicks ? 'pick-auto' : 'pick-lottery');
            const fall = jumpAnalysis.fallersByPick.get(pickNo);
            if (fall) {
                item.classList.add('has-faller');
                const note = document.createElement('div');
                note.className = 'chaos-note';
                note.textContent = `⬇ Shock drop! ${fall.team.name} fell out of the top ${leagueConfig.drawnPicks}.`;
                item.appendChild(note);
            }
            flipShift(wrapper, () => wrapper.insertBefore(item, wrapper.firstChild));
            idx--;
            schedule(showNext, T.pick);
        };
        showNext();
    }

    function revealExtraThenPodium() {
        const podiumCount = Math.min(leagueConfig.drawnPicks, 3);
        // Picks 4..drawnPicks (above the podium) revealed as chips first.
        if (leagueConfig.drawnPicks > 3) {
            stage.innerHTML = '';
            const header = document.createElement('div');
            header.className = 'batch-header';
            header.textContent = `Picks ${leagueConfig.drawnPicks} down to 4`;
            stage.appendChild(header);
            const wrap = document.createElement('div');
            wrap.className = 'extra-drawn-wrapper';
            stage.appendChild(wrap);
            focusSafe();
            let idx = leagueConfig.drawnPicks - 1;
            const showExtra = () => {
                if (idx < 3) { schedule(() => { stage.innerHTML = ''; revealPodium(podiumCount); }, T.nextBtn); return; }
                const chip = document.createElement('div');
                chip.className = 'extra-drawn-item';
                chip.textContent = `${formatOrdinal(idx + 1)}: ${official[idx].name}`;
                flipShift(wrap, () => wrap.insertBefore(chip, wrap.firstChild));
                idx--;
                schedule(showExtra, T.pick);
            };
            showExtra();
        } else {
            revealPodium(podiumCount);
        }
    }

    function revealPodium(podiumCount) {
        stage.innerHTML = '';
        const header = document.createElement('div');
        header.className = 'batch-header';
        header.textContent = `Top ${podiumCount} draft ${podiumCount === 1 ? 'pick' : 'picks'}`;
        stage.appendChild(header);

        const drumroll = document.createElement('div');
        drumroll.className = 'drumroll-area';
        stage.appendChild(drumroll);

        const podium = document.createElement('div');
        podium.className = 'top-podium';
        podium.setAttribute('role', 'list');
        stage.appendChild(podium);

        // Pending slots (rank 1 centered via CSS order)
        const slots = {};
        for (let rank = 1; rank <= podiumCount; rank++) {
            const slot = document.createElement('div');
            slot.className = `podium-slot rank-${rank} pending`;
            slot.setAttribute('role', 'listitem');
            slot.innerHTML = `<div class="podium-block"><div class="podium-rank">${rank}</div></div>`;
            podium.appendChild(slot);
            slots[rank] = slot;
        }
        focusSafe();

        // Reveal order: 3rd, 2nd, 1st (build to #1)
        const order = [];
        for (let rank = podiumCount; rank >= 1; rank--) order.push(rank);

        const revealAt = (i) => {
            if (i >= order.length) { schedule(finishReveal, T.nextBtn); return; }
            const rank = order[i];
            const pos = rank - 1;
            const jumper = jumpAnalysis.jumpersByPick.get(rank);
            drumroll.innerHTML = '';
            const dr = document.createElement('div');
            dr.className = 'fullscreen-drumroll ' + (rank === 1 ? 'pick-gold' : rank === 2 ? 'pick-silver' : 'pick-bronze');
            dr.textContent = `Picking ${formatOrdinal(rank)}…`;
            if (jumper) {
                const alert = document.createElement('div');
                alert.className = 'upset-alert';
                alert.textContent = `⚠ Upset! ${jumper.team.name} leaps from the ${formatOrdinal(jumper.fromSeed)} seed!`;
                dr.appendChild(alert);
            }
            drumroll.appendChild(dr);
            showPickTimer(T.countdown, () => {
                const slot = slots[rank];
                slot.classList.remove('pending');
                slot.classList.add('revealed');
                const block = slot.querySelector('.podium-block');
                block.innerHTML = `<div class="podium-rank">${rank}</div>`;
                const name = document.createElement('div');
                name.className = 'podium-name';
                name.textContent = official[pos].name;
                block.appendChild(name);
                slot.setAttribute('aria-label', `${formatOrdinal(rank)} pick: ${official[pos].name}`);
                if (jumper) {
                    block.classList.add('has-jumper');
                    const badge = document.createElement('div');
                    badge.className = 'lucky-leap-badge';
                    badge.textContent = '⬆ Lucky leap!';
                    block.appendChild(badge);
                }
                focusSafe();
                schedule(() => revealAt(i + 1), T.nextBtn);
            });
        };
        schedule(() => revealAt(0), T.start);
    }

    function finishReveal() {
        finish(official, false);
        const drumroll = stage.querySelector('.drumroll-area');
        if (drumroll) drumroll.remove();

        const complete = document.createElement('div');
        complete.className = 'fullscreen-complete';
        complete.textContent = 'Draft lottery complete! 🎉';
        stage.appendChild(complete);

        if (official.redraws > 0) {
            const note = document.createElement('div');
            note.className = 'redraw-notice';
            note.textContent = `The discarded combination came up ${official.redraws} time${official.redraws > 1 ? 's' : ''} — redrawn per NBA rules.`;
            stage.appendChild(note);
        }

        const btnWrap = document.createElement('div');
        btnWrap.className = 'modal-btn-wrap';
        const viewBtn = document.createElement('button');
        viewBtn.type = 'button'; viewBtn.className = 'lottery-button';
        viewBtn.textContent = 'View full draft order';
        viewBtn.addEventListener('click', () => teardownAfterSkip());
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button'; copyBtn.className = 'lottery-button secondary-button';
        copyBtn.textContent = 'Copy results';
        copyBtn.addEventListener('click', () => copyResults(official));
        btnWrap.appendChild(viewBtn); btnWrap.appendChild(copyBtn);
        stage.appendChild(btnWrap);
        viewBtn.focus();
        if (!RM) launchConfetti();
    }

    function finish(result, silent) {
        if (committed) return;
        committed = true;
        lastLotteryResult = {
            results: result, magicNumber,
            timestamp: new Date().toISOString(),
            jumpers: jumpAnalysis.jumpers, fallers: jumpAnalysis.fallers,
        };
        saveToHistory(lastLotteryResult);
        updateResultsDiv(result);
        updateFullDraftOrder(result);
        if (silent) showToast('Lottery result saved.', 'success');
    }

    return { start, cancel: () => teardown(false) };
}

// ============================================
// RESULTS + FULL DRAFT ORDER (main page)
// ============================================
function clearResultsDOM() {
    const results = document.getElementById('results');
    if (results) results.innerHTML = '';
    const full = document.getElementById('fullDraftOrder');
    if (full) full.innerHTML = '';
    const section = document.getElementById('resultsSection');
    if (section) section.style.display = 'none';
}

function updateResultsDiv(results) {
    const el = document.getElementById('results');
    const section = document.getElementById('resultsSection');
    if (!el || !section) return;
    section.style.display = '';
    el.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'results-container';
    const pickClasses = ['pick-1st', 'pick-2nd', 'pick-3rd'];
    for (let i = 0; i < results.length; i++) {
        const item = document.createElement('div');
        item.className = 'result-item';
        if (i < 3) item.classList.add(pickClasses[i]);
        else if (i >= leagueConfig.drawnPicks + leagueConfig.byRecordPicks) item.classList.add('pick-auto');
        const no = document.createElement('span'); no.className = 'result-pick-no'; no.textContent = `${i + 1}.`;
        const name = document.createElement('span'); name.textContent = results[i].name;
        item.appendChild(no); item.appendChild(name);
        container.appendChild(item);
    }
    el.appendChild(container);
    const desc = document.getElementById('draftOrderDesc');
    if (desc) desc.textContent = `Lottery order above · full ${leagueConfig.draftFormat === 'linear' ? 'linear' : 'snake'} draft order below.`;
}

function updateFullDraftOrder(lotteryResults) {
    const full = document.getElementById('fullDraftOrder');
    if (!full) return;
    full.innerHTML = '';
    const isSnake = leagueConfig.draftFormat !== 'linear';
    let overall = 1;

    for (let round = 0; round < leagueConfig.rounds; round++) {
        const roundDiv = document.createElement('div');
        roundDiv.className = 'draft-round';
        const reversed = isSnake && round % 2 === 1;
        const rt = document.createElement('h3');
        rt.className = 'draft-round-title';
        rt.textContent = `Round ${round + 1}${reversed ? ' ↩' : ''}`;
        roundDiv.appendChild(rt);

        for (let slot = 0; slot < leagueConfig.teamCount; slot++) {
            const pos = reversed ? leagueConfig.teamCount - 1 - slot : slot;
            const originalTeamIndex = lotteryResults[pos].originalIndex;
            const ownerIndex = pickOwnership[round][originalTeamIndex] ?? originalTeamIndex;
            const pick = document.createElement('div');
            pick.className = 'draft-pick';
            const no = document.createElement('span'); no.className = 'draft-pick-number'; no.textContent = `${overall++}.`;
            const team = document.createElement('span'); team.className = 'draft-pick-team'; team.textContent = teams[ownerIndex].name;
            pick.appendChild(no); pick.appendChild(team);
            if (ownerIndex !== originalTeamIndex) {
                const via = document.createElement('span');
                via.className = 'draft-pick-original';
                via.textContent = `via ${teams[originalTeamIndex].name}`;
                pick.appendChild(via);
            }
            roundDiv.appendChild(pick);
        }
        full.appendChild(roundDiv);
    }

    const dl = document.createElement('div');
    dl.className = 'draft-order-downloads';
    const fullBtn = document.createElement('button');
    fullBtn.type = 'button'; fullBtn.className = 'lottery-button';
    fullBtn.textContent = 'Download full draft order';
    fullBtn.addEventListener('click', () => downloadFullDraftOrder(lotteryResults));
    const lotBtn = document.createElement('button');
    lotBtn.type = 'button'; lotBtn.className = 'lottery-button secondary-button';
    lotBtn.textContent = 'Download lottery results';
    lotBtn.addEventListener('click', () => downloadLotteryResults(lotteryResults));
    dl.appendChild(fullBtn); dl.appendChild(lotBtn);
    full.appendChild(dl);
}

function triggerDownload(text, filename) {
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    URL.revokeObjectURL(a.href);
}

function downloadFullDraftOrder(lotteryResults) {
    const rows = getFullDraftOrderData(lotteryResults);
    const isSnake = leagueConfig.draftFormat !== 'linear';
    const lines = [`${leagueConfig.leagueName} — Full Draft Order`, `Format: ${isSnake ? 'Snake' : 'Linear'}`, ''];
    let round = 0;
    for (let i = 0; i < rows.length; i++) {
        if (i % leagueConfig.teamCount === 0) {
            if (i > 0) lines.push('');
            round++;
            const reversed = isSnake && (round - 1) % 2 === 1;
            lines.push(`Round ${round}${reversed ? ' (reversed)' : ''}`);
        }
        const r = rows[i];
        lines.push(`${r.pickNumber}. ${r.teamName}${r.viaName ? ` (via ${r.viaName})` : ''}`);
    }
    triggerDownload(lines.join('\n'), `${sanitizeFilename(leagueConfig.leagueName)}-draft-order.txt`);
}

function downloadLotteryResults(lotteryResults) {
    const lines = [`${leagueConfig.leagueName} — Lottery Results (round 1 order, before trades)`, ''];
    for (let i = 0; i < leagueConfig.teamCount && i < lotteryResults.length; i++) {
        lines.push(`${i + 1}. ${lotteryResults[i].name}`);
    }
    triggerDownload(lines.join('\n'), `${sanitizeFilename(leagueConfig.leagueName)}-lottery-results.txt`);
}

function copyResults(results) {
    const lines = [`${leagueConfig.leagueName} — Lottery Results`, ''];
    for (let i = 0; i < results.length; i++) lines.push(`${i + 1}. ${results[i].name}`);
    const text = lines.join('\n');
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => showToast('Results copied!', 'success')).catch(() => fallbackCopy(text));
    } else fallbackCopy(text);
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); showToast('Results copied!', 'success'); }
    catch (e) { showToast('Copy failed — select and copy manually.', 'error'); }
    document.body.removeChild(ta);
}

// ============================================
// CONFETTI (skipped under reduced motion)
// ============================================
function launchConfetti() {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = `position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:${500};`;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    const colors = ['#3B82F6', '#22C55E', '#F59E0B', '#EF4444', '#A855F7', '#06B6D4'];
    const pieces = Array.from({ length: 120 }, () => ({
        x: Math.random() * canvas.width, y: Math.random() * -canvas.height,
        w: 8 + Math.random() * 6, h: 4 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * Math.PI * 2, rotV: (Math.random() - 0.5) * 0.15,
        vx: (Math.random() - 0.5) * 3, vy: 3 + Math.random() * 4,
    }));
    let frame; const duration = 3200; const start = performance.now();
    const draw = (now) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        pieces.forEach((p) => {
            p.x += p.vx; p.y += p.vy; p.rot += p.rotV;
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
            ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
        });
        if (now - start < duration) frame = requestAnimationFrame(draw);
        else canvas.remove();
    };
    frame = requestAnimationFrame(draw);
    setTimeout(() => { cancelAnimationFrame(frame); canvas.remove(); }, duration + 200);
}

// ============================================
// HISTORY (per league)
// ============================================
function saveToHistory(entry) {
    try {
        const raw = localStorage.getItem(LS_KEY_HISTORY);
        const history = raw ? JSON.parse(raw) : [];
        history.unshift({
            league: leagueConfig.leagueName,
            timestamp: entry.timestamp,
            magicNumber: entry.magicNumber,
            picks: entry.results.map((r, i) => ({ pick: i + 1, name: r.name })),
            jumpers: (entry.jumpers || []).map((j) => ({ name: j.team.name, pick: j.pick, fromSeed: j.fromSeed })),
        });
        if (history.length > 20) history.splice(20);
        safeSetItem(LS_KEY_HISTORY, JSON.stringify(history));
    } catch (e) { console.warn('Failed to save history', e); }
    renderHistory();
}

function renderHistory() {
    const section = document.getElementById('historySection');
    if (!section) return;
    let history = [];
    try { const raw = localStorage.getItem(LS_KEY_HISTORY); if (raw) history = JSON.parse(raw); } catch (e) { /* ignore */ }
    const mine = history.filter((h) => h.league === leagueConfig.leagueName);
    if (!mine.length) { section.style.display = 'none'; return; }

    section.style.display = '';
    section.innerHTML = '<h2 id="historyHeading">Lottery history</h2>';
    mine.forEach((run, idx) => {
        const entry = document.createElement('details');
        entry.className = 'history-entry';
        if (idx === 0) entry.open = true;
        const summary = document.createElement('summary');
        const date = new Date(run.timestamp).toLocaleString();
        summary.textContent = `Run #${mine.length - idx} — ${date} (magic #${run.magicNumber})`;
        entry.appendChild(summary);
        const list = document.createElement('ol');
        list.className = 'history-picks';
        run.picks.forEach((p) => { const li = document.createElement('li'); li.textContent = p.name; list.appendChild(li); });
        entry.appendChild(list);
        if (run.jumpers?.length) {
            const chaos = document.createElement('p');
            chaos.className = 'history-chaos';
            chaos.textContent = 'Jumpers: ' + run.jumpers.map((j) => `${j.name} (seed ${j.fromSeed} → pick ${j.pick})`).join(', ');
            entry.appendChild(chaos);
        }
        section.appendChild(entry);
    });

    const clear = document.createElement('button');
    clear.type = 'button'; clear.className = 'ghost-btn history-clear';
    clear.textContent = 'Clear history';
    clear.addEventListener('click', () => showConfirm('Clear the lottery history for this league?', () => {
        try {
            const raw = localStorage.getItem(LS_KEY_HISTORY);
            const all = raw ? JSON.parse(raw) : [];
            safeSetItem(LS_KEY_HISTORY, JSON.stringify(all.filter((h) => h.league !== leagueConfig.leagueName)));
        } catch (e) { /* ignore */ }
        renderHistory();
    }));
    section.appendChild(clear);
}

// ============================================
// EXPORT / IMPORT
// ============================================
function exportConfig() {
    if (!leagueConfig) { showToast('No league to export.', 'warning'); return; }
    triggerDownload(JSON.stringify(leagueConfig, null, 2), `${sanitizeFilename(leagueConfig.leagueName)}-config.json`);
}

function importConfig() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            let parsed;
            try { parsed = JSON.parse(e.target.result); }
            catch (err) { showToast('That file is not valid JSON.', 'error'); return; }
            const result = sanitizeConfig(parsed);
            if (!result) { showToast('That config is missing a valid team count (4–20).', 'error'); return; }
            clearTransientKeys();
            saveLeagueConfig(result.config);
            hideWizard();
            safeInitApp();
            showToast(result.adjusted
                ? 'Config imported (some values were adjusted to keep it valid).'
                : 'Config imported.', result.adjusted ? 'warning' : 'success');
        };
        reader.readAsText(file);
    });
    input.click();
}

// ============================================
// INITIALIZATION
// ============================================
function initApp() {
    initStateFromConfig();

    const titleEl = document.getElementById('leagueTitle');
    if (titleEl) titleEl.textContent = leagueConfig.leagueName;
    document.title = `${leagueConfig.leagueName} — Draft Lottery`;

    renderLeagueSummary();
    createTeamInputs();
    refreshOddsTableBody();
    loadSavedPickOwnership();
    createPickOwnershipTable();
    renderOwnershipSummary();
    clearResultsDOM();
    renderHistory();

    const editor = document.getElementById('ownershipEditor');
    if (editor) editor.open = false;
}

function safeInitApp() {
    try { initApp(); }
    catch (e) {
        console.error('initApp failed', e);
        showRecoveryPanel();
    }
}

function showRecoveryPanel() {
    const container = document.getElementById('appContainer');
    if (!container) return;
    container.style.display = '';
    container.innerHTML = `
        <div class="recovery-panel">
            <h2>Something went wrong</h2>
            <p>Your saved league couldn't be loaded. You can reset and start fresh — nothing else on your device is affected.</p>
            <button type="button" class="quickstart-custom-btn" id="recoveryReset">Reset and start over</button>
        </div>`;
    document.getElementById('recoveryReset')?.addEventListener('click', () => {
        [LS_KEY_LEAGUE_CONFIG, LS_KEY_PICK_OWNERSHIP, LS_KEY_HISTORY, ...LEGACY_KEYS]
            .forEach((k) => localStorage.removeItem(k));
        location.reload();
    });
}

function bindStaticControls() {
    // Reset — bound outside initApp so a corrupt config can never disable it.
    const resetBtn = document.getElementById('resetButton');
    if (resetBtn) {
        let pending = false, revert = null;
        resetBtn.addEventListener('click', () => {
            if (!pending) {
                pending = true;
                resetBtn.textContent = 'Tap again to confirm';
                revert = setTimeout(() => { pending = false; resetBtn.textContent = 'Reset all data'; }, 3000);
            } else {
                clearTimeout(revert);
                [LS_KEY_LEAGUE_CONFIG, LS_KEY_PICK_OWNERSHIP, LS_KEY_HISTORY, ...LEGACY_KEYS]
                    .forEach((k) => localStorage.removeItem(k));
                location.reload();
            }
        });
    }

    document.getElementById('lotteryButton')?.addEventListener('click', runLottery);

    document.getElementById('reconfigureBtn')?.addEventListener('click', () => {
        if (!leagueConfig) return;
        const hasResults = !!lastLotteryResult || countTrades() > 0;
        const open = () => showSetupWizard(leagueConfig);
        if (hasResults) showConfirm('Reconfiguring may reset traded picks and clears the current results. Continue?', open);
        else open();
    });

    document.getElementById('backToPresetsBtn')?.addEventListener('click', () => {
        showConfirm('Switch sports? This clears the current league, its picks, and its history.', () => showQuickStart());
    });

    document.getElementById('exportConfigBtn')?.addEventListener('click', exportConfig);
    document.getElementById('importConfigBtn')?.addEventListener('click', importConfig);

    const ownReset = document.getElementById('ownershipResetBtn');
    if (ownReset) ownReset.addEventListener('click', () => resetOwnership());
}

document.addEventListener('DOMContentLoaded', () => {
    bindStaticControls();
    leagueConfig = loadLeagueConfig();
    if (!leagueConfig) showQuickStart();
    else { hideWizard(); safeInitApp(); }
});

// Expose for inline handlers / debugging
window.runLottery = runLottery;
