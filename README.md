# Fantasy Draft Lottery Simulator

A configurable, browser-based simulator for fantasy draft lotteries. Set up your
league, weight the lottery odds, and run a live, animated weighted lottery that
produces a full snake or linear draft order — all client-side, no accounts, no server.

**Live:** runs entirely in the browser. No build step, no dependencies.

## Features

- **Quick start presets** — load a demo football, basketball, hockey, or baseball league and run instantly.
- **Custom setup wizard** — name your league, set 4–20 teams, define the lottery structure, weight the combinations, and pick snake or linear format.
- **Weighted lottery** — NBA-style combination draw with a discarded-combination redraw rule.
- **Live odds table** — exact analytical odds for small leagues, Monte Carlo estimation for very large ones, always consistent with the actual draw.
- **Pick ownership** — every team owns its own picks by default; open the editor to record traded picks. No mandatory setup before you can run.
- **Animated reveal** — build-up ceremony with a top-3 podium, upset/shock-drop callouts, a skip control, and full reduced-motion support.
- **Magic number** — run N simulations and treat the last as official, so no one can cherry-pick a result.
- **Per-league history, export/import** — review past runs, and back up or share a league as JSON.

## How it works

1. **Set up** — choose a preset or build a custom league in the wizard.
2. **Adjust** — edit team names inline (they save automatically) and record any traded picks.
3. **Run** — pick a magic number (1–99) and run the lottery.
4. **Review & export** — see the full draft order, copy or download results.

## Configuration

- **Team count** — 4 to 20.
- **Drawn picks** — how many top picks are decided by the lottery draw.
- **By-record picks** — picks assigned by reverse standings, but still eligible for the lottery pool (a by-record team can jump into a drawn pick if its number is drawn).
- **Locked picks** — remaining picks, fixed by standings (auto-computed).
- **Combinations** — lottery weight per eligible team; must total 1,000.
- **Draft rounds** — 1 to 10, in snake or linear order.

All configuration is stored locally in your browser (`localStorage`) and persists across sessions. A corrupt or outdated saved league is repaired automatically rather than crashing.

## Technical details

- **No build required** — plain HTML, CSS, and vanilla JavaScript.
- **No dependencies** — no frameworks, no bundler.
- **Accessible** — WCAG-conscious contrast, keyboard-operable controls, focus management, live regions, and `prefers-reduced-motion` support.

## Development

Open `index.html` in any modern browser, or serve the folder statically
(`python -m http.server`). Edit the files and refresh. Clear `localStorage` to
replay the first-run experience.

## License

See the LICENSE file.
