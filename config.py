"""
Configuration file for FlightAlert Discord Bot
"""

import json
import os

# Webhook URLs for different alert types
WEBHOOKS = {
    '7500': 'https://discordapp.com/api/webhooks/1474619756416995463/896kOrBlOoxHGSZ_uFLuuZE2V4r2xsE1VkxVRrB7tmz0WwLU8pfGYV-0uTvVgiEyEmBE',  # HIJACK
    '7700': 'https://discordapp.com/api/webhooks/1474619902525444197/38dO22KxBEEGFJ0v6ZQRW9Wit-NMCG0snIKEr2GD-deBH_vhaspa1vBSSo1aff2YCyPT',  # EMERGENCY
}

# API endpoints for ADSB data
ADSB_API_ENDPOINTS = {
    '7500': 'https://api.adsb.lol/v2/sqk/7500',
    '7700': 'https://api.adsb.lol/v2/sqk/7700',
}

# Poll interval in seconds
POLL_INTERVAL = 10

# Time window to prevent duplicate alerts (in seconds)
DUPLICATE_ALERT_WINDOW = 3600  # 60 minutes

# Load extra tracked aircraft from extra.conf
EXTRA_TRACKED_AIRCRAFT = {}

def load_extra_config():
    """Load extra tracked aircraft configuration"""
    global EXTRA_TRACKED_AIRCRAFT
    config_path = os.path.join(os.path.dirname(__file__), 'extra.conf')
    
    if not os.path.exists(config_path):
        return
    
    try:
        with open(config_path, 'r') as f:
            content = f.read().strip()
            
            # Skip comments and empty lines
            lines = [line.strip() for line in content.split('\n') if line.strip() and not line.strip().startswith('#')]
            
            # Extract the JSON-like content between { }
            config_text = '\n'.join(lines)
            
            # Find content between braces
            start = config_text.find('{')
            end = config_text.rfind('}')
            
            if start != -1 and end != -1:
                json_text = config_text[start:end+1]
                EXTRA_TRACKED_AIRCRAFT = json.loads(json_text)
    
    except Exception as e:
        print(f"Error loading extra.conf: {e}")
        EXTRA_TRACKED_AIRCRAFT = {}

# Load on import
load_extra_config()
