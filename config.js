require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Discord Bot Token (from .env)
const DISCORD_TOKEN = process.env.DISCORD_TOKEN || '';

// Webhook URLs for different alert types
const WEBHOOKS = {
  '7500': process.env.WEBHOOK_7500 || 'https://discordapp.com/api/webhooks/1474619756416995463/896kOrBlOoxHGSZ_uFLuuZE2V4r2xsE1VkxVRrB7tmz0WwLU8pfGYV-0uTvVgiEyEmBE',  // HIJACK
  '7700': process.env.WEBHOOK_7700 || 'https://discordapp.com/api/webhooks/1474619902525444197/38dO22KxBEEGFJ0v6ZQRW9Wit-NMCG0snIKEr2GD-deBH_vhaspa1vBSSo1aff2YCyPT',  // EMERGENCY
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

// Load custom API endpoints from api.conf
let CUSTOM_API_ENDPOINTS = [];

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

function loadApiEndpoints() {
  try {
    const configPath = path.join(__dirname, 'api.conf');
    
    if (!fs.existsSync(configPath)) {
      CUSTOM_API_ENDPOINTS = [];
      return;
    }
    
    const content = fs.readFileSync(configPath, 'utf8');
    
    // Extract all URLs from the file
    const lines = content.split('\n');
    CUSTOM_API_ENDPOINTS = lines
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && (line.startsWith('http://') || line.startsWith('https://')));
    
    if (CUSTOM_API_ENDPOINTS.length > 0) {
      console.log(`Loaded ${CUSTOM_API_ENDPOINTS.length} custom API endpoints`);
    }
  } catch (error) {
    console.error(`Error loading api.conf: ${error.message}`);
    CUSTOM_API_ENDPOINTS = [];
  }
}

// Load on import
loadExtraConfig();
loadApiEndpoints();

module.exports = {
  DISCORD_TOKEN,
  WEBHOOKS,
  ADSB_API_ENDPOINTS,
  POLL_INTERVAL,
  DUPLICATE_ALERT_WINDOW,
  EXTRA_TRACKED_AIRCRAFT,
  CUSTOM_API_ENDPOINTS,
  loadExtraConfig,
  loadApiEndpoints,
};
