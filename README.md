# FlightAlert Discord Bot

A full-featured Discord bot that monitors live ADSB aircraft data for emergency signals, tracks specific aircraft, provides interactive slash commands, and forwards data to custom APIs.

## Features

- **Real-time monitoring** of aircraft emergency signals
- **Discord bot integration** with slash commands:
  - `/7500` - View all current HIJACK aircraft alerts
  - `/7700` - View all current EMERGENCY aircraft alerts
  - `/trackall` - View summary of all tracked aircraft
- **Dual squawk code support**:
  - **7500**: Aircraft hijacking alert
  - **7700**: General emergency alert
- **Extra aircraft tracking**: Monitor specific aircraft by hex code
  - Posts when aircraft comes online
  - Resets when aircraft goes offline (allowing re-alerting if it comes back)
- **Custom API forwarding**: Forward all aircraft data to any HTTP server via api.conf
- **Duplicate prevention**: Suppresses duplicate alerts for the same aircraft within a 60-minute window
- **Rich Discord embeds** with aircraft information including:
  - Flight number
  - Tail number (registration)
  - Aircraft type
  - Hex ID (ICAO address)
  - Direct tracking link to ADS-B Exchange

## Requirements

- Node.js 16.0+
- npm (Node Package Manager)
- Discord Bot Token (from Discord Developer Portal)
- Internet connection to access ADSB API and Discord

## Installation

1. Clone or download the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the project root:
   ```bash
   cp .env.example .env
   ```

4. Edit `.env` and add your Discord bot token:
   ```bash
   DISCORD_TOKEN=your_discord_bot_token_here
   WEBHOOK_7500=your_7500_webhook_url
   WEBHOOK_7700=your_7700_webhook_url
   ```

## Configuration

### Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Go to "Bot" section, click "Add Bot"
4. Under "TOKEN", click "Copy" to get your bot token
5. Paste it in the `.env` file as `DISCORD_TOKEN`
6. Use OAuth2 URL Generator to invite bot to server

### Main Alerts (config.js)

Edit `config.js` to set up your Discord webhooks (optional, can use .env):

```javascript
const WEBHOOKS = {
  '7500': process.env.WEBHOOK_7500 || 'YOUR_7500_WEBHOOK_URL',
  '7700': process.env.WEBHOOK_7700 || 'YOUR_7700_WEBHOOK_URL',
};
```

### Extra Aircraft Tracking (extra.conf)

Track specific aircraft by their hex code. Edit `extra.conf`:

```json
{
    "c07c7b": "https://discordapp.com/api/webhooks/YOUR_WEBHOOK_HERE",
    "a12ff9": "https://discordapp.com/api/webhooks/ANOTHER_WEBHOOK_HERE"
}
```

### Custom API Forwarding (api.conf)

Forward all aircraft data to custom HTTP endpoints. Edit `api.conf` and add one URL per line:

```
https://your-api.example.com/aircraft
https://another-api.example.com/data
http://localhost:3000/adsb
```

The bot will POST aircraft data to these endpoints with timestamp and aircraft information.

### Settings

- **POLL_INTERVAL**: How often to check for new aircraft (default: 10 seconds)
- **DUPLICATE_ALERT_WINDOW**: Time period to suppress duplicate alerts (default: 3600 seconds = 60 minutes)

## Usage

Run the bot:
```bash
npm start
```

The bot will:
1. Connect to Discord and register slash commands
2. Poll the ADSB API every 10 seconds
3. Post alerts to webhooks when emergency aircraft are detected
4. Forward all aircraft data to configured API endpoints
5. Allow users to view tracked aircraft with slash commands
6. Automatically suppress duplicate emergency alerts within 60 minutes
7. Reset tracking for extra aircraft when they go offline

## Slash Commands

### `/7500` - HIJACK Alerts
Displays all aircraft currently squawking 7500 (hijack code) in a formatted table.

### `/7700` - EMERGENCY Alerts
Displays all aircraft currently squawking 7700 (emergency code) in a formatted table.

### `/trackall` - All Tracked Aircraft
Shows a summary embed with:
- Count of 7500 hijack alerts
- Count of 7700 emergency alerts
- List of extra tracked aircraft currently online

## ADSB Data Source

This bot uses live ADS-B data from:
- `https://api.adsb.lol/v2/sqk/7500` - Hijack alerts
- `https://api.adsb.lol/v2/sqk/7700` - Emergency alerts
- `https://api.adsb.lol/v2/aircraft` - All aircraft (for extra tracking)

## Discord Webhook Setup

1. Create Discord webhooks in your server:
   - One for 7500 (hijack) alerts
   - One for 7700 (emergency) alerts
   - Additional webhooks for each extra tracked aircraft

2. Copy the webhook URLs

3. Paste them in `config.js` for main alerts, or in `extra.conf` for extra aircraft tracking

### Getting a Discord Webhook URL

1. Right-click on a channel in Discord
2. Select "Edit Channel"
3. Go to "Integrations" → "Webhooks"
4. Click "New Webhook"
5. Name it (e.g., "FlightAlert 7500") and click "Create"
6. Click "Copy Webhook URL"

## Alert Types

### Emergency Alerts (7500/7700)
- Include @everyone mention
- Red embed (danger color)
- Suppresses duplicates for 60 minutes

### Extra Aircraft Tracking
- No @everyone mention (quiet tracking)
- Green embed when aircraft comes online
- Posts again if aircraft returns online after going offline

## Logging

The bot logs all activities including:
- Successfully posted alerts
- Aircraft coming online/going offline
- Skipped duplicates
- API errors and failures
- Bot startup and shutdown

## Pterodactyl Panel Deployment

To deploy on a Pterodactyl Panel:

1. Create a new server with **Node.js 18+** Docker image
2. Upload the bot files to the server
3. Create a `.env` file with your Discord token and webhooks:
   ```
   DISCORD_TOKEN=your_bot_token
   WEBHOOK_7500=your_7500_url
   WEBHOOK_7700=your_7700_url
   ```
4. Configure `extra.conf` for tracked aircraft (if needed)
5. Configure `api.conf` for custom API endpoints (if needed)
6. Set the startup command: `npm start`
7. In the console, run: `npm install`
8. Invite the bot to your Discord server using OAuth2 URL
9. Start the server

## Project Structure

```
FlightAlert/
├── bot.js              # Main bot logic with Discord integration
├── config.js           # Configuration (webhooks, API endpoints)
├── extra.conf          # Extra aircraft tracking configuration (hex: webhook)
├── api.conf            # Custom API endpoint configuration (one URL per line)
├── .env.example        # Environment variables template
├── package.json        # Node.js dependencies
└── README.md           # This file
```

## License

MIT License - Feel free to modify and distribute

## Author

Austin Ayers
