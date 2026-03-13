require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Webhook URLs for different alert types
const WEBHOOKS = {
  '7500': 'https://discordapp.com/api/webhooks/1474619756416995463/896kOrBlOoxHGSZ_uFLuuZE2V4r2xsE1VkxVRrB7tmz0WwLU8pfGYV-0uTvVgiEyEmBE',  // HIJACK
  '7700': 'https://discordapp.com/api/webhooks/1474619902525444197/38dO22KxBEEGFJ0v6ZQRW9Wit-NMCG0snIKEr2GD-deBH_vhaspa1vBSSo1aff2YCyPT',  // EMERGENCY
};

// API endpoints for ADSB data
const ADSB_API_ENDPOINTS = {
  '7500': 'https://api.adsb.lol/v2/sqk/7500',
  '7700': 'https://api.adsb.lol/v2/sqk/7700',
  'all': 'https://api.adsb.lol/v2/aircraft',
};

// Poll interval in seconds
const POLL_INTERVAL = 10;

// Time window to prevent duplicate alerts (in seconds)
const DUPLICATE_ALERT_WINDOW = 3600; // 60 minutes

// Load extra tracked aircraft from extra.conf
let EXTRA_TRACKED_AIRCRAFT = {};

function loadExtraConfig() {
  try {
    const configPath = path.join(__dirname, 'extra.conf');
    
    if (!fs.existsSync(configPath)) {
      EXTRA_TRACKED_AIRCRAFT = {};
      return;
    }
    
    const content = fs.readFileSync(configPath, 'utf8');
    
    // Find content between braces
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    
    if (start !== -1 && end !== -1) {
      const jsonText = content.substring(start, end + 1);
      EXTRA_TRACKED_AIRCRAFT = JSON.parse(jsonText);
    }
  } catch (error) {
    console.error(`Error loading extra.conf: ${error.message}`);
    EXTRA_TRACKED_AIRCRAFT = {};
  }
}

// Load on import
loadExtraConfig();

module.exports = {
  WEBHOOKS,
  ADSB_API_ENDPOINTS,
  POLL_INTERVAL,
  DUPLICATE_ALERT_WINDOW,
  EXTRA_TRACKED_AIRCRAFT,
  loadExtraConfig,
};
