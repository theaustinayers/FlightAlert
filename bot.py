"""
FlightAlert Discord Bot
Monitors ADSB aircraft emergency signals (7500 hijack, 7700 emergency) and posts to Discord webhooks
"""

import requests
import time
from datetime import datetime, timedelta
from discord_webhook import DiscordWebhook, DiscordEmbed
import logging
from config import WEBHOOKS, ADSB_API_ENDPOINTS, POLL_INTERVAL, DUPLICATE_ALERT_WINDOW, EXTRA_TRACKED_AIRCRAFT

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Store recent alerts to prevent duplicates (hex: timestamp)
recent_alerts = {}

# Track which extra aircraft are currently online
extra_aircraft_online = {}

def get_squawk_type(squawk_code):
    """Determine alert type and title based on squawk code"""
    if squawk_code == '7500':
        return '7500', 'HIJACK AIRCRAFT ALERT'
    elif squawk_code == '7700':
        return '7700', 'EMERGENCY AIRCRAFT ALERT'
    return None, None

def is_duplicate_alert(hex_id, squawk_code):
    """Check if this aircraft was already alerted for this squawk code in the time window"""
    alert_key = f"{hex_id}_{squawk_code}"
    
    if alert_key in recent_alerts:
        last_alert_time = recent_alerts[alert_key]
        if datetime.now() - last_alert_time < timedelta(seconds=DUPLICATE_ALERT_WINDOW):
            return True
        
    # Update the timestamp for this alert
    recent_alerts[alert_key] = datetime.now()
    return False

def clean_old_alerts():
    """Remove alerts older than the duplicate window"""
    current_time = datetime.now()
    alerts_to_remove = [
        key for key, timestamp in recent_alerts.items()
        if current_time - timestamp > timedelta(seconds=DUPLICATE_ALERT_WINDOW)
    ]
    for key in alerts_to_remove:
        del recent_alerts[key]

def format_aircraft_data(aircraft):
    """Format aircraft data for Discord embed"""
    flight = aircraft.get('flight', 'N/A').strip() if aircraft.get('flight') else 'N/A'
    tail = aircraft.get('r', 'N/A').strip() if aircraft.get('r') else 'N/A'
    aircraft_type = aircraft.get('t', 'N/A')
    hex_id = aircraft.get('hex', 'N/A').upper()
    
    return {
        'flight': flight,
        'tail': tail,
        'type': aircraft_type,
        'hex': hex_id
    }

def post_to_discord(squawk_code, aircraft):
    """Post aircraft alert to Discord webhook"""
    squawk_type, title = get_squawk_type(squawk_code)
    if not squawk_type:
        return
    
    # Check for duplicates
    if is_duplicate_alert(aircraft.get('hex', ''), squawk_code):
        logger.info(f"Duplicate alert suppressed for {aircraft.get('hex')} ({squawk_code})")
        return
    
    webhook_url = WEBHOOKS.get(squawk_code)
    if not webhook_url:
        logger.error(f"No webhook configured for squawk code {squawk_code}")
        return
    
    aircraft_data = format_aircraft_data(aircraft)
    
    # Create Discord embed
    embed = DiscordEmbed(
        title=title,
        description=f"Aircraft emergency detected!",
        color="ff0000"  # Red for alerts
    )
    
    embed.add_embed_field(
        name="Flight Number",
        value=aircraft_data['flight'],
        inline=False
    )
    
    embed.add_embed_field(
        name="Tail Number",
        value=aircraft_data['tail'],
        inline=True
    )
    
    embed.add_embed_field(
        name="Aircraft Type",
        value=aircraft_data['type'],
        inline=True
    )
    
    embed.add_embed_field(
        name="Hex ID",
        value=aircraft_data['hex'],
        inline=True
    )
    
    # Add tracking link
    track_url = f"https://globe.adsbexchange.com/?icao={aircraft_data['hex']}"
    embed.add_embed_field(
        name="TRACK IT",
        value=f"[ADS-B Exchange](https://globe.adsbexchange.com/?icao={aircraft_data['hex'].lower()})",
        inline=False
    )
    
    embed.set_timestamp()
    
    try:
        webhook = DiscordWebhook(url=webhook_url, content="@everyone")
        webhook.add_embed(embed)
        webhook.execute()
        logger.info(f"Alert posted for {aircraft_data['hex']} ({squawk_code}) - {aircraft_data['flight']}")
    except Exception as e:
        logger.error(f"Failed to post alert to Discord: {e}")

def fetch_adsb_data(squawk_code):
    """Fetch ADSB data from the API for a specific squawk code"""
    try:
        endpoint = ADSB_API_ENDPOINTS.get(squawk_code)
        if not endpoint:
            return []
        
        response = requests.get(endpoint, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        aircraft_list = data.get('ac', [])
        
        logger.info(f"Fetched {len(aircraft_list)} aircraft with squawk {squawk_code}")
        return aircraft_list
    
    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to fetch ADSB data for {squawk_code}: {e}")
        return []

def fetch_all_aircraft():
    """Fetch all aircraft data from ADSB API"""
    try:
        endpoint = 'https://api.adsb.lol/v2/aircraft'
        response = requests.get(endpoint, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        aircraft_list = data.get('ac', [])
        
        return aircraft_list
    
    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to fetch all aircraft data: {e}")
        return []

def post_extra_aircraft_alert(hex_id, aircraft, webhook_url):
    """Post extra tracked aircraft data to Discord webhook"""
    try:
        aircraft_data = format_aircraft_data(aircraft)
        
        # Create Discord embed for extra tracked aircraft
        embed = DiscordEmbed(
            title="AIRCRAFT ONLINE",
            description=f"Tracked aircraft is now online!",
            color="00ff00"  # Green for online
        )
        
        if aircraft_data['flight'] != 'N/A':
            embed.add_embed_field(
                name="Flight Number",
                value=aircraft_data['flight'],
                inline=False
            )
        
        embed.add_embed_field(
            name="Tail Number",
            value=aircraft_data['tail'],
            inline=True
        )
        
        embed.add_embed_field(
            name="Aircraft Type",
            value=aircraft_data['type'],
            inline=True
        )
        
        embed.add_embed_field(
            name="Hex ID",
            value=aircraft_data['hex'],
            inline=True
        )
        
        # Add tracking link
        embed.add_embed_field(
            name="TRACK IT",
            value=f"[ADS-B Exchange](https://globe.adsbexchange.com/?icao={aircraft_data['hex'].lower()})",
            inline=False
        )
        
        embed.set_timestamp()
        
        webhook = DiscordWebhook(url=webhook_url)  # No @everyone for extra tracked aircraft
        webhook.add_embed(embed)
        webhook.execute()
        logger.info(f"Extra aircraft alert posted for {hex_id} - {aircraft_data['flight']}")
    
    except Exception as e:
        logger.error(f"Failed to post extra aircraft alert: {e}")

def check_extra_tracked_aircraft():
    """Check if extra tracked aircraft are online and post alerts"""
    if not EXTRA_TRACKED_AIRCRAFT:
        return
    
    aircraft_list = fetch_all_aircraft()
    online_hexes = set(aircraft.get('hex', '').lower() for aircraft in aircraft_list if aircraft.get('hex'))
    
    # Check each tracked aircraft
    for hex_id, webhook_url in EXTRA_TRACKED_AIRCRAFT.items():
        hex_id_lower = hex_id.lower()
        
        if hex_id_lower in online_hexes:
            # Aircraft is online
            if hex_id_lower not in extra_aircraft_online:
                # Aircraft just came online - post alert
                logger.info(f"Extra tracked aircraft {hex_id} came online")
                
                # Find the aircraft data
                for aircraft in aircraft_list:
                    if aircraft.get('hex', '').lower() == hex_id_lower:
                        post_extra_aircraft_alert(hex_id, aircraft, webhook_url)
                        extra_aircraft_online[hex_id_lower] = True
                        break
        else:
            # Aircraft is offline
            if hex_id_lower in extra_aircraft_online:
                # Aircraft just went offline - reset the timer
                logger.info(f"Extra tracked aircraft {hex_id} went offline - timer reset")
                del extra_aircraft_online[hex_id_lower]

def main():
    """Main bot loop"""
    logger.info("FlightAlert Discord Bot started")
    logger.info(f"Poll interval: {POLL_INTERVAL} seconds")
    logger.info(f"Duplicate alert window: {DUPLICATE_ALERT_WINDOW} seconds")
    
    if EXTRA_TRACKED_AIRCRAFT:
        logger.info(f"Tracking {len(EXTRA_TRACKED_AIRCRAFT)} extra aircraft: {', '.join(EXTRA_TRACKED_AIRCRAFT.keys())}")
    
    try:
        while True:
            # Check both squawk codes
            for squawk_code in ['7500', '7700']:
                aircraft_list = fetch_adsb_data(squawk_code)
                
                for aircraft in aircraft_list:
                    post_to_discord(squawk_code, aircraft)
            
            # Check extra tracked aircraft
            check_extra_tracked_aircraft()
            
            # Clean up old alerts periodically
            clean_old_alerts()
            
            # Wait before next poll
            time.sleep(POLL_INTERVAL)
    
    except KeyboardInterrupt:
        logger.info("Bot stopped by user")
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise

if __name__ == '__main__':
    main()
