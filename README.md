# FlightAlert Discord Bot

A Discord bot that monitors live ADSB aircraft data for emergency signals and tracks specific aircraft.

## Features

- **Real-time monitoring** of aircraft emergency signals
- **Dual squawk code support**:
  - **7500**: Aircraft hijacking alert
  - **7700**: General emergency alert
- **Extra aircraft tracking**: Monitor specific aircraft by hex code
  - Posts when aircraft comes online
  - Resets when aircraft goes offline (allowing re-alerting if it comes back)
- **Duplicate prevention**: Suppresses duplicate alerts for the same aircraft within a 60-minute window
- **Rich Discord embeds** with aircraft information including:
  - Flight number
  - Tail number (registration)
  - Aircraft type
  - Hex ID (ICAO address)
  - Direct tracking link to ADS-B Exchange

## Requirements

- Python 3.7+
- Internet connection to access ADSB API and Discord webhooks

## Installation

1. Clone or download the repository
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Configuration

### Main Alerts (config.py)

Edit `config.py` to set up your Discord webhooks for hijack and emergency alerts:

```python
WEBHOOKS = {
    '7500': 'YOUR_7500_WEBHOOK_URL',  # Hijack alerts
    '7700': 'YOUR_7700_WEBHOOK_URL',  # Emergency alerts
}
```

### Settings

- **POLL_INTERVAL**: How often to check for new aircraft (default: 10 seconds)
- **DUPLICATE_ALERT_WINDOW**: Time period to suppress duplicate alerts (default: 3600 seconds = 60 minutes)

### Extra Aircraft Tracking (extra.conf)

Track specific aircraft by their hex code. Edit `extra.conf`:

```json
{
    "c07c7b": "https://discordapp.com/api/webhooks/YOUR_WEBHOOK_HERE",
    "a12ff9": "https://discordapp.com/api/webhooks/ANOTHER_WEBHOOK_HERE"
}
```

When a tracked aircraft comes online, the bot will post to its webhook. When it goes offline and comes back, it will post again (timer resets).

## Usage

Run the bot:
```bash
python bot.py
```

The bot will:
1. Poll the ADSB API every 10 seconds
2. Check for aircraft with 7500 (hijack) or 7700 (emergency) squawk codes
3. Check if your extra tracked aircraft are online
4. Post alerts to Discord webhooks when detected
5. Automatically suppress duplicate emergency alerts for the same aircraft within 60 minutes
6. Reset tracking for extra aircraft when they go offline

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

3. Paste them in `config.py` for main alerts, or in `extra.conf` for extra aircraft tracking

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

1. Create a new server with Python 3.9+ image
2. Upload the bot files to the server
3. Install dependencies: `pip install -r requirements.txt`
4. Set the startup command: `python bot.py`
5. Configure webhooks in `config.py` and `extra.conf` before starting

## License

MIT License - Feel free to modify and distribute

## Author

Austin Ayers
