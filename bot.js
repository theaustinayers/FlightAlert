/**
 * FlightAlert Discord Bot
 * Monitors ADSB aircraft emergency signals and provides Discord bot commands
 */

const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const config = require('./config');

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

// Store recent alerts to prevent duplicates (hex: timestamp)
const recentAlerts = {};

// Track which extra aircraft are currently online
const extraAircraftOnline = {};

// Store current aircraft data for commands
const aircraftData = {
  '7500': [],
  '7700': [],
  'extra': {},
};

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
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription('Aircraft emergency detected!')
    .setColor(0xFF0000) // Red for alerts
    .addFields(
      { name: 'Flight Number', value: aircraftData.flight, inline: false },
      { name: 'Tail Number', value: aircraftData.tail, inline: true },
      { name: 'Aircraft Type', value: aircraftData.type, inline: true },
      { name: 'Hex ID', value: aircraftData.hex, inline: true },
      {
        name: 'TRACK IT',
        value: `[ADS-B Exchange](https://globe.adsbexchange.com/?icao=${aircraftData.hex.toLowerCase()})`,
        inline: false,
      }
    )
    .setTimestamp();
}

/**
 * Create Discord embed for extra tracked aircraft
 */
function createExtraAircraftEmbed(aircraftData) {
  const embed = new EmbedBuilder()
    .setTitle('AIRCRAFT ONLINE')
    .setDescription('Tracked aircraft is now online!')
    .setColor(0x00FF00); // Green for online

  if (aircraftData.flight !== 'N/A') {
    embed.addFields({ name: 'Flight Number', value: aircraftData.flight, inline: false });
  }

  embed.addFields(
    { name: 'Tail Number', value: aircraftData.tail, inline: true },
    { name: 'Aircraft Type', value: aircraftData.type, inline: true },
    { name: 'Hex ID', value: aircraftData.hex, inline: true },
    {
      name: 'TRACK IT',
      value: `[ADS-B Exchange](https://globe.adsbexchange.com/?icao=${aircraftData.hex.toLowerCase()})`,
      inline: false,
    }
  );

  embed.setTimestamp();
  return embed;
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
  
  const aircraftDataFormatted = formatAircraftData(aircraft);
  const embed = createEmergencyEmbed(squawkType.title, aircraftDataFormatted);
  
  try {
    await axios.post(webhookUrl, {
      content: '@everyone',
      embeds: [embed.toJSON()],
    });
    console.log(`[INFO] Alert posted for ${aircraftDataFormatted.hex} (${squawkCode}) - ${aircraftDataFormatted.flight}`);
  } catch (error) {
    console.error(`[ERROR] Failed to post alert to Discord: ${error.message}`);
  }
}

/**
 * Send aircraft data to custom API endpoints
 */
async function sendToCustomApis(data) {
  if (config.CUSTOM_API_ENDPOINTS.length === 0) return;
  
  for (const endpoint of config.CUSTOM_API_ENDPOINTS) {
    try {
      const payload = {
        timestamp: new Date().toISOString(),
        ...data,
      };
      
      await axios.post(endpoint, payload, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      console.log(`[INFO] Data sent to API: ${endpoint}`);
    } catch (error) {
      console.error(`[ERROR] Failed to send data to ${endpoint}: ${error.message}`);
    }
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
    
    // Store for commands
    aircraftData[squawkCode] = aircraftList;
    
    // Send to custom APIs
    await sendToCustomApis({ type: squawkCode, data: response.data });
    
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
    
    // Send to custom APIs
    await sendToCustomApis({ type: 'all', data: response.data });
    
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
    const aircraftDataFormatted = formatAircraftData(aircraft);
    const embed = createExtraAircraftEmbed(aircraftDataFormatted);
    
    await axios.post(webhookUrl, {
      embeds: [embed.toJSON()],
    });
    console.log(`[INFO] Extra aircraft alert posted for ${hexId} - ${aircraftDataFormatted.flight}`);
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
  
  // Store extra aircraft data
  aircraftData.extra = {};
  
  // Check each tracked aircraft
  for (const [hexId, webhookUrl] of Object.entries(trackedAircraft)) {
    const hexIdLower = hexId.toLowerCase();
    
    if (onlineHexes.has(hexIdLower)) {
      // Aircraft is online
      const aircraft = aircraftList.find((a) => a.hex && a.hex.toLowerCase() === hexIdLower);
      if (aircraft) {
        aircraftData.extra[hexId] = aircraft;
        
        if (!(hexIdLower in extraAircraftOnline)) {
          // Aircraft just came online - post alert
          console.log(`[INFO] Extra tracked aircraft ${hexId} came online`);
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
 * Format aircraft list as a Discord table-like message
 */
function formatAircraftTable(aircraft, title) {
  if (aircraft.length === 0) {
    return `**${title}**\nNo aircraft currently detected.`;
  }
  
  const maxItems = 20; // Discord limit
  const items = aircraft.slice(0, maxItems);
  
  let table = `**${title}** (${aircraft.length} total)\n\`\`\`\n`;
  table += 'Flight      | Tail     | Type  | Hex ID\n';
  table += '----------- | -------- | ----- | ---------\n';
  
  for (const plane of items) {
    const formatted = formatAircraftData(plane);
    const flight = formatted.flight.padEnd(11);
    const tail = formatted.tail.padEnd(8);
    const type = formatted.type.padEnd(5);
    const hex = formatted.hex;
    
    table += `${flight} | ${tail} | ${type} | ${hex}\n`;
  }
  
  table += '```';
  
  if (aircraft.length > maxItems) {
    table += `\n*...and ${aircraft.length - maxItems} more aircraft*`;
  }
  
  return table;
}

// Discord Bot Events
client.once('ready', () => {
  console.log(`[INFO] Discord bot logged in as ${client.user.tag}`);
  console.log(`[INFO] Monitoring ${Object.keys(config.EXTRA_TRACKED_AIRCRAFT).length} extra aircraft`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === '7500') {
      const table = formatAircraftTable(aircraftData['7500'], '🚨 HIJACK ALERTS (7500)');
      await interaction.reply({ content: table, ephemeral: false });
    } else if (interaction.commandName === '7700') {
      const table = formatAircraftTable(aircraftData['7700'], '🆘 EMERGENCY ALERTS (7700)');
      await interaction.reply({ content: table, ephemeral: false });
    } else if (interaction.commandName === 'trackall') {
      const embed = new EmbedBuilder()
        .setTitle('📊 ALL TRACKED AIRCRAFT')
        .setColor(0x0099FF)
        .setTimestamp();

      let description = '';
      
      // Add 7500 hijacks
      const hijacks = aircraftData['7500'].length;
      description += `**🚨 Hijack Alerts (7500):** ${hijacks} aircraft\n`;
      
      // Add 7700 emergencies
      const emergencies = aircraftData['7700'].length;
      description += `**🆘 Emergency Alerts (7700):** ${emergencies} aircraft\n`;
      
      // Add extra tracked
      const extraCount = Object.keys(aircraftData.extra).length;
      description += `**✈️ Extra Tracked:** ${extraCount} aircraft online\n`;
      
      embed.setDescription(description);
      
      // Add field for extra tracked aircraft details
      if (Object.keys(aircraftData.extra).length > 0) {
        let extraText = '';
        for (const [hex, plane] of Object.entries(aircraftData.extra)) {
          const formatted = formatAircraftData(plane);
          extraText += `**${hex.toUpperCase()}** - ${formatted.flight} (${formatted.tail})\n`;
        }
        embed.addFields({ name: 'Online', value: extraText || 'None', inline: false });
      }
      
      await interaction.reply({ embeds: [embed], ephemeral: false });
    }
  } catch (error) {
    console.error(`[ERROR] Command error: ${error.message}`);
    await interaction.reply({ content: 'Error executing command', ephemeral: true });
  }
});

/**
 * Register slash commands
 */
async function registerCommands() {
  try {
    const commands = [
      new SlashCommandBuilder()
        .setName('7500')
        .setDescription('View all current HIJACK aircraft alerts (7500 squawk code)'),
      new SlashCommandBuilder()
        .setName('7700')
        .setDescription('View all current EMERGENCY aircraft alerts (7700 squawk code)'),
      new SlashCommandBuilder()
        .setName('trackall')
        .setDescription('View all tracked aircraft (7500, 7700, and extra tracked)'),
    ];

    await client.application.commands.set(commands);
    console.log('[INFO] Slash commands registered successfully');
  } catch (error) {
    console.error(`[ERROR] Failed to register commands: ${error.message}`);
  }
}

/**
 * Main bot loop
 */
async function main() {
  console.log('[INFO] FlightAlert Discord Bot starting...');
  
  // Check for Discord token
  if (!config.DISCORD_TOKEN) {
    console.error('[ERROR] DISCORD_TOKEN not found in .env file');
    process.exit(1);
  }
  
  // Login to Discord
  try {
    await client.login(config.DISCORD_TOKEN);
  } catch (error) {
    console.error(`[ERROR] Failed to login to Discord: ${error.message}`);
    process.exit(1);
  }
  
  // Wait for bot to be ready
  await new Promise((resolve) => {
    client.once('ready', resolve);
  });

  // Register slash commands
  await registerCommands();

  console.log(`[INFO] Poll interval: ${config.POLL_INTERVAL} seconds`);
  console.log(`[INFO] Duplicate alert window: ${config.DUPLICATE_ALERT_WINDOW} seconds`);
  
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
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[INFO] Bot terminated');
  client.destroy();
  process.exit(0);
});

// Start the bot
main().catch((error) => {
  console.error(`[ERROR] Fatal error: ${error.message}`);
  process.exit(1);
});
