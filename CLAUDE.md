# Fantasy Draft Lottery Simulator - Project Guide

## Architecture

This is a single-file, no-build-tools web application:
- **No frameworks** (no React, Vue, Angular)
- **No build step** (no webpack, Babel, npm)
- **No dependencies** (pure vanilla JavaScript)
- **Browser-based** (runs entirely client-side in localStorage)

## Key Files

### index.html
- Main HTML structure
- Contains embedded CSS and JavaScript
- Single entry point for the application

### js/lottery.js
- All application logic
- Functions: loadLeagueConfig(), saveLeagueConfig(), computeOdds(), showSetupWizard(), initApp()
- State management via localStorage

### styles/main.css
- All styling
- Responsive design for mobile and desktop
- Setup wizard, lottery simulator, and results display styles

### .github/workflows/static.yml
- GitHub Actions workflow for automated deployment
- Deploys to GitHub Pages on push to main branch

## Configuration System

### leagueConfig Object Structure

```javascript
{
  leagueName: string,
  teamCount: number (4-20),
  teams: [
    { name: string, drawOrderOdds: number },
    // ...
  ],
  drawnPickCount: number,
  byRecordPickCount: number,
  lockedPickCount: number (auto-computed),
  draftRounds: number (1-10)
}
```

### localStorage Keys

- `lotteryLeagueConfig`: Main configuration object (JSON)
- `lotteryTeamNames`: Team names array (JSON)
- `lotteryTeamsLocked`: Boolean, tracks if setup is complete
- `lotteryPickOwnershipLocked`: Boolean, tracks if odds are locked
- `lotteryPickOwnership`: Current draft order (array)

## Key Functions

### loadLeagueConfig()
Loads league configuration from localStorage. Returns default config if first visit.

### saveLeagueConfig()
Persists leagueConfig to localStorage.

### computeOdds()
Calculates lottery odds for each team based on their combination count.
Returns probability array for each pick position.

### showSetupWizard()
Displays the setup wizard for first-time configuration.
Triggered if lotteryTeamsLocked is not set or is false.

### initApp()
Initializes the application on page load.
Loads config, shows setup if needed, displays main lottery simulator.

## Development Workflow

1. **Open directly in browser**: Simply open `index.html` in any modern browser
2. **No build required**: Edit HTML, CSS, or JS files and refresh
3. **localStorage debugging**: Use browser DevTools to inspect and clear localStorage
4. **Test in fresh browser**: Clear localStorage to test setup wizard again

## Common Tasks

### Add a New Configuration Option

1. Add field to leagueConfig object in js/lottery.js
2. Add input field to setup wizard in index.html
3. Update saveLeagueConfig() to persist the new field
4. Update loadLeagueConfig() default if needed

### Modify Lottery Algorithm

Edit the computeOdds() function in js/lottery.js. Ensure:
- Combinations sum to 1000 (or adjust logic as needed)
- Output format matches downstream consumers (odds display, draft simulation)

### Change UI Text or Layout

Edit index.html for structure and styles/main.css for styling.
No JavaScript changes needed for purely visual updates.

## Design Principles

- **Configuration-driven**: All league rules in leagueConfig, not hardcoded
- **localStorage-first**: Persist everything locally for offline use
- **Setup wizard**: Guide new users through configuration once
- **No external data**: All data lives in the browser

## Testing

Since there's no build step:
1. Clear localStorage to simulate new install
2. Walk through setup wizard
3. Modify config via browser DevTools localStorage
4. Test lottery with different odds distributions
5. Verify all draftRound simulations work (1-10)

## Deployment

GitHub Actions automatically deploys to GitHub Pages on every push to main branch.
Site is live at: `https://[username].github.io/fantasy-draft-lottery-simulator/`
