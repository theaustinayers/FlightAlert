/**
 * FlightAlert Discord Bot
 * Monitors ADSB aircraft emergency signals (7500 hijack, 7700 emergency) and posts to Discord webhooks
 */

const axios = require('axios');
const config = require('./config');

// Store recent alerts to prevent duplicates (hex: timestamp)
const recentAlerts = {};

// Track which extra aircraft are currently online
const extraAircraftOnline = {};

/**
 * Determine alert type and title based on squawk code
 */
function getSquawkType(squawkCode) {
  if (squawkCode === '7500') {
    return { code: '7500', title: 'HIJACK AIRCRAFT ALERT' };
  } else if (squawkCode === '7700') {
    return { code: '7700', title: 'EMERGENCY AIRCRAFT ALERT' };
  }
  return null;
}

/**
 * Check if this aircraft was already alerted for this squawk code in the time window
 */
function isDuplicateAlert(hexId, squawkCode) {
  const alertKey = `${hexId}_${squawkCode}`;
  
  if (alertKey in recentAlerts) {
    const lastAlertTime = recentAlerts[alertKey];
    const timeDiff = Date.now() - lastAlertTime;
    
    if (timeDiff < config.DUPLICATE_ALERT_WINDOW * 1000) {
      return true;
    }
  }
  
  // Update the timestamp for this alert
  recentAlerts[alertKey] = Date.now();
  return false;
}

/**
 * Remove alerts older than the duplicate window
 */
function cleanOldAlerts() {
  const currentTime = Date.now();
  for (const key in recentAlerts) {
    if (currentTime - recentAlerts[key] > config.DUPLICATE_ALERT_WINDOW * 1000) {
      delete recentAlerts[key];
    }
  }
}

/**
 * Format aircraft data for Discord embed
 */
function formatAircraftData(aircraft) {
  return {
    flight: aircraft.flight ? aircraft.flight.trim() : 'N/A',
    tail: aircraft.r ? aircraft.r.trim() : 'N/A',
    type: aircraft.t || 'N/A',
    hex: (aircraft.hex || 'N/A').toUpperCase(),
  };
}

/**
 * Create Discord embed for emergency alerts
 */
function createEmergencyEmbed(title, aircraftData) {
  const timestamp = new Date().toISOString();
  
  return {
    embeds: [
      {
        title: title,
        description: 'Aircraft emergency detected!',
        color: 0xff0000, // Red for alerts
        fields: [
          {
            name: 'Flight Number',
            value: aircraftData.flight,
            inline: false,
          },
          {
            name: 'Tail Number',
            value: aircraftData.tail,
            inline: true,
          },
          {
            name: 'Aircraft Type',
            value: aircraftData.type,
            inline: true,
          },
          {
            name: 'Hex ID',
            value: aircraftData.hex,
            inline: true,
          },
          {
            name: 'TRACK IT',
            value: `[ADS-B Exchange](https://globe.adsbexchange.com/?icao=${aircraftData.hex.toLowerCase()})`,
            inline: false,
          },
        ],
        timestamp: timestamp,
      },
    ],
    content: '@everyone',
  };
}

/**
 * Create Discord embed for extra tracked aircraft
 */
function createExtraAircraftEmbed(aircraftData) {
  const timestamp = new Date().toISOString();
  const fields = [];
  
  if (aircraftData.flight !== 'N/A') {
    fields.push({
      name: 'Flight Number',
      value: aircraftData.flight,
      inline: false,
    });
  }
  
  fields.push(
    {
      name: 'Tail Number',
      value: aircraftData.tail,
      inline: true,
    },
    {
      name: 'Aircraft Type',
      value: aircraftData.type,
      inline: true,
    },
    {
      name: 'Hex ID',
      value: aircraftData.hex,
      inline: true,
    },
    {
      name: 'TRACK IT',
      value: `[ADS-B Exchange](https://globe.adsbexchange.com/?icao=${aircraftData.hex.toLowerCase()})`,
      inline: false,
    }
  );
  
  return {
    embeds: [
      {
        title: 'AIRCRAFT ONLINE',
        description: 'Tracked aircraft is now online!',
        color: 0x00ff00, // Green for online
        fields: fields,
        timestamp: timestamp,
      },
    ],
  };
}

/**
 * Post aircraft alert to Discord webhook
 */
async function postToDiscord(squawkCode, aircraft) {
  const squawkType = getSquawkType(squawkCode);
  if (!squawkType) return;
  
  // Check for duplicates
  if (isDuplicateAlert(aircraft.hex, squawkCode)) {
    console.log(`[INFO] Duplicate alert suppressed for ${aircraft.hex} (${squawkCode})`);
    return;
  }
  
  const webhookUrl = config.WEBHOOKS[squawkCode];
  if (!webhookUrl) {
    console.error(`[ERROR] No webhook configured for squawk code ${squawkCode}`);
    return;
  }
  
  const aircraftData = formatAircraftData(aircraft);
  const payload = createEmergencyEmbed(squawkType.title, aircraftData);
  
  try {
    await axios.post(webhookUrl, payload);
    console.log(`[INFO] Alert posted for ${aircraftData.hex} (${squawkCode}) - ${aircraftData.flight}`);
  } catch (error) {
    console.error(`[ERROR] Failed to post alert to Discord: ${error.message}`);
  }
}

/**
 * Fetch ADSB data from the API for a specific squawk code
 */
async function fetchADSBData(squawkCode) {
  try {
    const endpoint = config.ADSB_API_ENDPOINTS[squawkCode];
    if (!endpoint) return [];
    
    const response = await axios.get(endpoint, { timeout: 10000 });
    const aircraftList = response.data.ac || [];
    
    console.log(`[INFO] Fetched ${aircraftList.length} aircraft with squawk ${squawkCode}`);
    return aircraftList;
  } catch (error) {
    console.error(`[ERROR] Failed to fetch ADSB data for ${squawkCode}: ${error.message}`);
    return [];
  }
}

/**
 * Fetch all aircraft data from ADSB API
 */
async function fetchAllAircraft() {
  try {
    const endpoint = config.ADSB_API_ENDPOINTS.all;
    const response = await axios.get(endpoint, { timeout: 10000 });
    return response.data.ac || [];
  } catch (error) {
    console.error(`[ERROR] Failed to fetch all aircraft data: ${error.message}`);
    return [];
  }
}

/**
 * Post extra tracked aircraft data to Discord webhook
 */
async function postExtraAircraftAlert(hexId, aircraft, webhookUrl) {
  try {
    const aircraftData = formatAircraftData(aircraft);
    const payload = createExtraAircraftEmbed(aircraftData);
    
    await axios.post(webhookUrl, payload);
    console.log(`[INFO] Extra aircraft alert posted for ${hexId} - ${aircraftData.flight}`);
  } catch (error) {
    console.error(`[ERROR] Failed to post extra aircraft alert: ${error.message}`);
  }
}

/**
 * Check if extra tracked aircraft are online and post alerts
 */
async function checkExtraTrackedAircraft() {
  const trackedAircraft = config.EXTRA_TRACKED_AIRCRAFT;
  if (Object.keys(trackedAircraft).length === 0) return;
  
  const aircraftList = await fetchAllAircraft();
  const onlineHexes = new Set(
    aircraftList
      .filter((a) => a.hex)
      .map((a) => a.hex.toLowerCase())
  );
  
  // Check each tracked aircraft
  for (const [hexId, webhookUrl] of Object.entries(trackedAircraft)) {
    const hexIdLower = hexId.toLowerCase();
    
    if (onlineHexes.has(hexIdLower)) {
      // Aircraft is online
      if (!(hexIdLower in extraAircraftOnline)) {
        // Aircraft just came online - post alert
        console.log(`[INFO] Extra tracked aircraft ${hexId} came online`);
        
        // Find the aircraft data
        const aircraft = aircraftList.find((a) => a.hex && a.hex.toLowerCase() === hexIdLower);
        if (aircraft) {
          await postExtraAircraftAlert(hexId, aircraft, webhookUrl);
          extraAircraftOnline[hexIdLower] = true;
        }
      }
    } else {
      // Aircraft is offline
      if (hexIdLower in extraAircraftOnline) {
        // Aircraft just went offline - reset the timer
        console.log(`[INFO] Extra tracked aircraft ${hexId} went offline - timer reset`);
        delete extraAircraftOnline[hexIdLower];
      }
    }
  }
}

/**
 * Main bot loop
 */
async function main() {
  console.log('[INFO] FlightAlert Discord Bot started');
  console.log(`[INFO] Poll interval: ${config.POLL_INTERVAL} seconds`);
  console.log(`[INFO] Duplicate alert window: ${config.DUPLICATE_ALERT_WINDOW} seconds`);
  
  const trackedAircraft = config.EXTRA_TRACKED_AIRCRAFT;
  if (Object.keys(trackedAircraft).length > 0) {
    console.log(`[INFO] Tracking ${Object.keys(trackedAircraft).length} extra aircraft: ${Object.keys(trackedAircraft).join(', ')}`);
  }
  
  // Main polling loop
  while (true) {
    try {
      // Check both squawk codes
      for (const squawkCode of ['7500', '7700']) {
        const aircraftList = await fetchADSBData(squawkCode);
        
        for (const aircraft of aircraftList) {
          await postToDiscord(squawkCode, aircraft);
        }
      }
      
      // Check extra tracked aircraft
      await checkExtraTrackedAircraft();
      
      // Clean up old alerts periodically
      cleanOldAlerts();
      
      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, config.POLL_INTERVAL * 1000));
    } catch (error) {
      console.error(`[ERROR] Unexpected error in main loop: ${error.message}`);
      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, config.POLL_INTERVAL * 1000));
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('[INFO] Bot stopped by user');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[INFO] Bot terminated');
  process.exit(0);
});

// Start the bot
main().catch((error) => {
  console.error(`[ERROR] Fatal error: ${error.message}`);
  process.exit(1);
});
