# Fantasy Draft Lottery Simulator

A customizable, browser-based simulator for fantasy draft lotteries. Configure any league's lottery structure, visualize odds, and run realistic draft simulations.

## Features

- **Flexible Configuration**: Customize league name, team count, team names, and lottery structure
- **Multiple Pick Types**: Support for drawn picks, by-record picks, and locked picks
- **Realistic Odds**: Automatically computed based on your league's lottery configuration
- **Live Visualization**: See draft order and odds in real-time
- **No Installation Required**: Runs entirely in your browser via GitHub Pages

## Getting Started

### First Visit

The setup wizard automatically appears on your first visit. Configure:
- **League Name**: Custom name for your fantasy league
- **Team Count**: Number of teams in your league (4-20)
- **Team Names**: Name each team in your league
- **Lottery Structure**: Define how many picks are determined by lottery, record, or locked

### Configuration Options

Once set up, customize:
- **Drawn Picks**: Number of picks determined by lottery draw
- **By-Record Picks**: Number of picks determined by win-loss record
- **Locked Picks**: Number of picks that are locked/auto-computed (calculated as total teams - drawn - by-record)
- **Lottery Odds**: Assign combinations summing to 1000 for each non-locked pick
- **Draft Rounds**: Simulate 1-10 draft rounds using your configured lottery structure

### Data Storage

All configuration is stored locally in your browser (localStorage). Your league settings persist across sessions.

## How It Works

1. **Setup**: Enter your league configuration
2. **Define Odds**: Specify how many combinations each team receives for the lottery
3. **Run Simulation**: Click "Run Lottery" to generate random draft order
4. **Export**: Copy or save your draft results

## Deployment

This app is deployed via GitHub Pages with automated updates using GitHub Actions. Push to the `main` branch to deploy.

## Technical Details

- **No Build Required**: Single HTML file with embedded CSS and JavaScript
- **No Dependencies**: Pure vanilla JavaScript, no frameworks
- **Browser Storage**: Uses localStorage for configuration persistence

## License

See LICENSE file for details.
