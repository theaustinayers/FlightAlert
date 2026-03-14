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
function createExtraAircraftEmbed(aircraftData, comment) {
  const embed = new EmbedBuilder()
    .setTitle('AIRCRAFT ONLINE')
    .setDescription('Tracked aircraft is now online!')
    .setColor(0x00FF00); // Green for online

  if (comment) {
    embed.addFields({ name: 'Reason', value: comment, inline: false });
  }

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
 * Fetch aircraft data by hex code from ADSB API
 */
async function fetchAircraftByHex(hex) {
  try {
    const endpoint = `https://api.adsb.lol/v2/hex/${hex}`;
    const response = await axios.get(endpoint, { timeout: 10000 });
    
    // Send to custom APIs
    await sendToCustomApis({ type: 'hex', hex, data: response.data });
    
    return response.data.ac || [];
  } catch (error) {
    console.error(`[ERROR] Failed to fetch aircraft by hex ${hex}: ${error.message}`);
    return [];
  }
}

/**
 * Fetch aircraft by registration from ADSB API
 */
async function fetchAircraftByRegistration(registration) {
  try {
    const endpoint = `https://api.adsb.lol/v2/reg/${registration}`;
    const response = await axios.get(endpoint, { timeout: 10000 });
    
    return response.data.ac || [];
  } catch (error) {
    console.error(`[ERROR] Failed to fetch aircraft by registration ${registration}: ${error.message}`);
    return [];
  }
}

/**
 * Post extra tracked aircraft data to Discord webhook
 */
async function postExtraAircraftAlert(hexId, aircraft, webhookUrl, comment) {
  try {
    const aircraftDataFormatted = formatAircraftData(aircraft);
    const embed = createExtraAircraftEmbed(aircraftDataFormatted, comment);
    
    await axios.post(webhookUrl, {
      embeds: [embed.toJSON()],
    });
    console.log(`[INFO] Extra aircraft alert posted for ${hexId} - ${aircraftDataFormatted.flight}`);
  } catch (error) {
    console.error(`[ERROR] Failed to post extra aircraft alert: ${error.message}`);
  }
}

/**
 * Detect if a string is a HEX code or registration
 */
function detectAircraftType(value) {
  // HEX: 6 hex characters (0-9, a-f)
  if (/^[0-9a-f]{6}$/i.test(value)) {
    return 'hex';
  }
  // REG: registration/tail number
  return 'reg';
}

/**
 * Check if extra tracked aircraft are online and post alerts
 */
async function checkExtraTrackedAircraft() {
  const trackedAircraft = config.EXTRA_TRACKED_AIRCRAFT;
  if (Object.keys(trackedAircraft).length === 0) return;
  
  // Store extra aircraft data
  aircraftData.extra = {};
  
  // Check each tracked aircraft
  for (const [identifier, config_value] of Object.entries(trackedAircraft)) {
    // Handle both old format (string) and new format (object)
    const isNewFormat = typeof config_value === 'object' && config_value !== null;
    const webhookUrl = isNewFormat ? config_value.webhook : config_value;
    const comment = isNewFormat ? config_value.comment : null;
    const trackType = isNewFormat ? (config_value.type || detectAircraftType(identifier)) : detectAircraftType(identifier);
    
    // Fetch aircraft based on type
    let aircraftList = [];
    if (trackType === 'hex') {
      // For HEX, use dedicated hex endpoint
      aircraftList = await fetchAircraftByHex(identifier);
    } else {
      // For REG, use dedicated API endpoint
      aircraftList = await fetchAircraftByRegistration(identifier);
    }
    
    // Find matching aircraft
    let matchedAircraft = null;
    const identifierLower = identifier.toLowerCase();
    
    if (aircraftList.length > 0) {
      matchedAircraft = aircraftList[0];
    }
    
    if (matchedAircraft) {
      // Aircraft is online
      aircraftData.extra[identifier] = matchedAircraft;
      
      if (!(identifierLower in extraAircraftOnline)) {
        // Aircraft just came online - post alert
        console.log(`[INFO] Extra tracked aircraft ${identifier} (${trackType}) came online`);
        await postExtraAircraftAlert(identifier, matchedAircraft, webhookUrl, comment);
        extraAircraftOnline[identifierLower] = true;
      }
    } else {
      // Aircraft is offline
      if (identifierLower in extraAircraftOnline) {
        // Aircraft just went offline - reset the timer
        console.log(`[INFO] Extra tracked aircraft ${identifier} went offline - timer reset`);
        delete extraAircraftOnline[identifierLower];
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

/**
 * Check if user has any of the authorized admin roles
 */
function userHasAdminRole(member) {
  if (!member) return false;
  
  // If no admin roles configured, deny access
  if (config.ADMIN_ROLES.length === 0) {
    return false;
  }
  
  // Check if user has any of the admin roles
  return member.roles.cache.some((role) => config.ADMIN_ROLES.includes(role.id));
}

/**
 * Check if user is guild admin (for managing admin roles)
 */
function userIsGuildAdmin(member) {
  if (!member) return false;
  return member.permissions.has('ADMINISTRATOR');
}

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
    } else if (interaction.commandName === 'flights') {
      const subcommandGroup = interaction.options.getSubcommandGroup();
      const subcommand = interaction.options.getSubcommand();

      // Admin role management - requires guild admin
      if (subcommandGroup === 'admin') {
        if (!userIsGuildAdmin(interaction.member)) {
          await interaction.reply({
            content: '❌ You need administrator permissions to manage admin roles.',
            ephemeral: true,
          });
          return;
        }

        if (subcommand === 'add') {
          const role = interaction.options.getRole('role');

          if (config.ADMIN_ROLES.includes(role.id)) {
            await interaction.reply({
              content: `⚠️ Role <@&${role.id}> is already an admin role.`,
              ephemeral: true,
            });
            return;
          }

          config.ADMIN_ROLES.push(role.id);
          config.saveAdminRoles();

          await interaction.reply({
            content: `✅ Role <@&${role.id}> added as admin role.`,
            ephemeral: true,
          });
          console.log(`[INFO] Admin role added: ${role.id} (${role.name})`);
        } else if (subcommand === 'remove') {
          const role = interaction.options.getRole('role');

          const index = config.ADMIN_ROLES.indexOf(role.id);
          if (index === -1) {
            await interaction.reply({
              content: `⚠️ Role <@&${role.id}> is not an admin role.`,
              ephemeral: true,
            });
            return;
          }

          config.ADMIN_ROLES.splice(index, 1);
          config.saveAdminRoles();

          await interaction.reply({
            content: `✅ Role <@&${role.id}> removed as admin role.`,
            ephemeral: true,
          });
          console.log(`[INFO] Admin role removed: ${role.id} (${role.name})`);
        }
        return;
      }

      // Flight management - requires admin role
      if (!userHasAdminRole(interaction.member)) {
        await interaction.reply({
          content: '❌ You need an admin role to use this command. Ask an administrator to add your role with `/flights admin add`.',
          ephemeral: true,
        });
        return;
      }

      if (subcommandGroup === 'track') {
        if (subcommand === 'add') {
          const identifier = interaction.options.getString('identifier').toLowerCase();
          const comment = interaction.options.getString('comment');
          const webhook = interaction.options.getString('webhook');
          const trackType = detectAircraftType(identifier);

          if (config.EXTRA_TRACKED_AIRCRAFT[identifier]) {
            await interaction.reply({
              content: `⚠️ Aircraft **${identifier}** is already being tracked.`,
              ephemeral: true,
            });
            return;
          }

          config.EXTRA_TRACKED_AIRCRAFT[identifier] = { webhook, comment, type: trackType };
          config.saveExtraConfig();

          await interaction.reply({
            content: `✅ Aircraft **${identifier}** (type: ${trackType.toUpperCase()}) added to tracking list.\n**Comment:** ${comment}`,
            ephemeral: true,
          });
          console.log(`[INFO] Admin added tracked aircraft: ${identifier} (${trackType})`);
        } else if (subcommand === 'remove') {
          const identifier = interaction.options.getString('identifier').toLowerCase();

          if (!config.EXTRA_TRACKED_AIRCRAFT[identifier]) {
            await interaction.reply({
              content: `⚠️ Aircraft **${identifier}** is not in the tracking list.`,
              ephemeral: true,
            });
            return;
          }

          delete config.EXTRA_TRACKED_AIRCRAFT[identifier];
          config.saveExtraConfig();

          await interaction.reply({
            content: `✅ Aircraft **${identifier}** removed from tracking list.`,
            ephemeral: true,
          });
          console.log(`[INFO] Admin removed tracked aircraft: ${identifier}`);
        }
      } else if (subcommandGroup === 'relay') {
        if (subcommand === 'add') {
          const url = interaction.options.getString('url');

          if (config.CUSTOM_API_ENDPOINTS.includes(url)) {
            await interaction.reply({
              content: `⚠️ API endpoint **${url}** is already configured.`,
              ephemeral: true,
            });
            return;
          }

          config.CUSTOM_API_ENDPOINTS.push(url);
          config.saveApiEndpoints();

          await interaction.reply({
            content: `✅ API endpoint added: **${url}**`,
            ephemeral: true,
          });
          console.log(`[INFO] Admin added API endpoint: ${url}`);
        } else if (subcommand === 'remove') {
          const url = interaction.options.getString('url');

          const index = config.CUSTOM_API_ENDPOINTS.indexOf(url);
          if (index === -1) {
            await interaction.reply({
              content: `⚠️ API endpoint **${url}** is not configured.`,
              ephemeral: true,
            });
            return;
          }

          config.CUSTOM_API_ENDPOINTS.splice(index, 1);
          config.saveApiEndpoints();

          await interaction.reply({
            content: `✅ API endpoint removed: **${url}**`,
            ephemeral: true,
          });
          console.log(`[INFO] Admin removed API endpoint: ${url}`);
        }
      }
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
      new SlashCommandBuilder()
        .setName('flights')
        .setDescription('Admin: Manage tracked aircraft and API relays')
        .addSubcommandGroup((group) =>
          group
            .setName('admin')
            .setDescription('Manage admin roles for flight commands')
            .addSubcommand((subcommand) =>
              subcommand
                .setName('add')
                .setDescription('Add a role as admin for flight commands')
                .addRoleOption((option) =>
                  option
                    .setName('role')
                    .setDescription('Discord role to add as admin')
                    .setRequired(true)
                )
            )
            .addSubcommand((subcommand) =>
              subcommand
                .setName('remove')
                .setDescription('Remove a role from admin access')
                .addRoleOption((option) =>
                  option
                    .setName('role')
                    .setDescription('Discord role to remove from admin')
                    .setRequired(true)
                )
            )
        )
        .addSubcommandGroup((group) =>
          group
            .setName('track')
            .setDescription('Manage tracked aircraft')
            .addSubcommand((subcommand) =>
              subcommand
                .setName('add')
                .setDescription('Add an aircraft to track by HEX or registration')
                .addStringOption((option) =>
                  option
                    .setName('identifier')
                    .setDescription('HEX code (e.g., c07c7b) or registration (e.g., N1234AB, G-ABCD)')
                    .setRequired(true)
                )
                .addStringOption((option) =>
                  option
                    .setName('comment')
                    .setDescription('Reason for tracking (e.g., CEO aircraft)')
                    .setRequired(true)
                )
                .addStringOption((option) =>
                  option
                    .setName('webhook')
                    .setDescription('Discord webhook URL for alerts')
                    .setRequired(true)
                )
            )
            .addSubcommand((subcommand) =>
              subcommand
                .setName('remove')
                .setDescription('Remove an aircraft from tracking')
                .addStringOption((option) =>
                  option
                    .setName('identifier')
                    .setDescription('HEX code or registration (same as when added)')
                    .setRequired(true)
                )
            )
        )
        .addSubcommandGroup((group) =>
          group
            .setName('relay')
            .setDescription('Manage API relay endpoints')
            .addSubcommand((subcommand) =>
              subcommand
                .setName('add')
                .setDescription('Add an API endpoint for data forwarding')
                .addStringOption((option) =>
                  option
                    .setName('url')
                    .setDescription('API endpoint URL (https://...)')
                    .setRequired(true)
                )
            )
            .addSubcommand((subcommand) =>
              subcommand
                .setName('remove')
                .setDescription('Remove an API endpoint')
                .addStringOption((option) =>
                  option
                    .setName('url')
                    .setDescription('API endpoint URL to remove')
                    .setRequired(true)
                )
            )
        )
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
