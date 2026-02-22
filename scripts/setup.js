#!/usr/bin/env node
/**
 * Agent Connect - Setup Wizard
 * First-time setup: agent name, Cloudflare tunnel, config
 */

const readline = require('readline');
const fs = require('fs');
const { OPENCLAW_DIR, ENV_FILE, saveEnvValue } = require('../lib/config');
const { isCloudflaredInstalled, getCloudflaredVersion, installCloudflared, installTunnelService, isValidTunnelToken } = require('../lib/tunnel');

function createRL() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
}

function ask(rl, question) {
    return new Promise(resolve => {
        rl.question(question, answer => {
            resolve(answer.trim());
        });
    });
}

async function main() {
    const rl = createRL();

    console.log('\n🔌 Agent Connect - Setup Wizard\n');
    console.log('This will configure your agent for inter-agent communication.\n');

    // --- Pre-flight: Detect existing state ---
    console.log('📋 Checking existing setup...\n');

    // Check existing config
    const hasExistingConfig = fs.existsSync(ENV_FILE);
    if (hasExistingConfig) {
        const { getConfig } = require('../lib/config');
        const existing = getConfig();
        console.log('  ⚙️  Existing config found:');
        console.log(`     Agent name:  ${existing.agentName}`);
        console.log(`     Port:        ${existing.port}`);
        console.log(`     Tunnel URL:  ${existing.tunnelUrl || '(not set)'}`);
        console.log(`     Tunnel token: ${existing.tunnelToken ? '****' + existing.tunnelToken.slice(-8) : '(not set)'}`);
        console.log('');

        const reconfigure = await ask(rl, '  Reconfigure? (y/n, default n): ');
        if (reconfigure.toLowerCase() !== 'y') {
            console.log('\n✅ Keeping existing config. Nothing to do.');
            rl.close();
            process.exit(0);
        }
        console.log('');
    } else {
        console.log('  ⚙️  No existing config found. Starting fresh setup.\n');
    }

    // Check cloudflared installation upfront
    const cloudflaredReady = isCloudflaredInstalled();
    if (cloudflaredReady) {
        const version = getCloudflaredVersion();
        console.log(`  ✅ cloudflared is installed: ${version}`);
    } else {
        console.log('  ⚠️  cloudflared is NOT installed (will set up later)');
    }

    // Check if tunnel service is already running
    const { isTunnelRunning } = require('../lib/tunnel');
    if (cloudflaredReady) {
        const tunnelActive = isTunnelRunning();
        console.log(`  ${tunnelActive ? '✅' : '🔴'} Tunnel service: ${tunnelActive ? 'running' : 'not running'}`);
    }
    console.log('');

    // --- Step 1: Agent Identity ---
    console.log('━'.repeat(50));
    console.log('📛 Step 1: Agent Identity\n');

    const agentName = await ask(rl, '  Enter your agent name (e.g., kiara): ');
    if (!agentName || !/^[a-zA-Z0-9_-]+$/.test(agentName)) {
        console.error('  ❌ Invalid name. Use only letters, numbers, dash, underscore.');
        rl.close();
        process.exit(1);
    }
    saveEnvValue('AGENT_NAME', agentName);
    console.log(`  ✅ Agent name: ${agentName}\n`);

    // --- Step 2: Port ---
    console.log('━'.repeat(50));
    console.log('🔌 Step 2: Webhook Port\n');

    const portAnswer = await ask(rl, '  Port for webhook server (default 3847): ');
    const port = portAnswer ? parseInt(portAnswer, 10) : 3847;
    if (isNaN(port) || port < 1024 || port > 65535) {
        console.error('  ❌ Invalid port. Use a number between 1024 and 65535.');
        rl.close();
        process.exit(1);
    }
    saveEnvValue('CONNECT_PORT', port.toString());
    console.log(`  ✅ Port: ${port}\n`);

    // --- Step 3: Cloudflare Tunnel ---
    console.log('━'.repeat(50));
    console.log('🌐 Step 3: Cloudflare Tunnel\n');
    console.log('  Agents communicate through Cloudflare tunnels — encrypted,');
    console.log('  no open ports needed, works behind any firewall.\n');

    // Ask about existing tunnel setup
    const hasTunnel = await ask(rl, '  Have you already set up a Cloudflare tunnel for this agent? (y/n): ');

    if (hasTunnel.toLowerCase() === 'y') {
        // Already has a tunnel configured
        console.log('');

        // Ask if they have a tunnel token installed as a service already
        const hasService = await ask(rl, '  Is the tunnel already running as a service (via cloudflared service install)? (y/n): ');

        if (hasService.toLowerCase() === 'y') {
            console.log('  ✅ Great! Tunnel service is already set up.\n');
        } else {
            // They have a tunnel but haven't installed the service yet
            const hasToken = await ask(rl, '  Do you have the tunnel token? (y/n): ');

            if (hasToken.toLowerCase() === 'y') {
                // Install cloudflared if needed
                if (!cloudflaredReady) {
                    console.log('\n  ⚠️  cloudflared is not installed yet.\n');
                    const installAnswer = await ask(rl, '  Install cloudflared automatically? (y/n): ');
                    if (installAnswer.toLowerCase() === 'y') {
                        const result = installCloudflared();
                        console.log(`  ${result.message}`);
                        if (!result.success) {
                            rl.close();
                            process.exit(1);
                        }
                    } else {
                        console.log('\n  Please install cloudflared manually:');
                        console.log('    https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
                        console.log('  Then run this setup again.\n');
                        rl.close();
                        process.exit(0);
                    }
                }

                const tunnelToken = await ask(rl, '\n  🔑 Paste your tunnel token: ');
                if (!isValidTunnelToken(tunnelToken)) {
                    console.error('  ❌ Invalid token. It should start with eyJhIjoi... and be quite long.');
                    rl.close();
                    process.exit(1);
                }
                saveEnvValue('TUNNEL_TOKEN', tunnelToken);
                console.log('  ✅ Token saved.\n');

                console.log('  Installing tunnel service...\n');
                const serviceResult = installTunnelService(tunnelToken);
                console.log(`  ${serviceResult.message}`);

                if (!serviceResult.success) {
                    console.log('\n  ⚠️  You can run the tunnel manually:');
                    console.log(`     cloudflared tunnel run --token <YOUR_TOKEN>\n`);
                }
            }
        }

        // Get the public URL — show port so they know what tunnel should point to
        console.log(`\n  📌 Your webhook server will run on: http://localhost:${port}`);
        console.log(`     Make sure your tunnel routes to this address.\n`);
        const tunnelUrl = await ask(rl, '  Enter your tunnel\'s public URL (e.g., https://kiara-agent.example.com): ');
        if (!tunnelUrl || !tunnelUrl.startsWith('https://')) {
            console.error('  ❌ Tunnel URL must start with https://');
            rl.close();
            process.exit(1);
        }
        saveEnvValue('TUNNEL_URL', tunnelUrl);
        console.log(`  ✅ Tunnel URL: ${tunnelUrl}\n`);

    } else {
        // No tunnel yet — full setup
        console.log('\n  📋 Let\'s set up a tunnel from scratch!\n');

        // Step 3a: Install cloudflared
        if (!cloudflaredReady) {
            console.log('  First, we need to install cloudflared.\n');
            const installAnswer = await ask(rl, '  Install cloudflared automatically? (y/n): ');

            if (installAnswer.toLowerCase() === 'y') {
                const result = installCloudflared();
                console.log(`  ${result.message}`);
                if (!result.success) {
                    rl.close();
                    process.exit(1);
                }
                console.log('');
            } else {
                console.log('\n  Please install cloudflared manually:');
                console.log('    https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
                console.log('  Then run this setup again.\n');
                rl.close();
                process.exit(0);
            }
        } else {
            console.log('  ✅ cloudflared is installed.\n');
        }

        // Step 3b: Create tunnel in Cloudflare dashboard
        console.log('  Now create a tunnel in the Cloudflare dashboard:\n');
        console.log('    1. Go to: https://one.dash.cloudflare.com');
        console.log('    2. Navigate to: Networks → Tunnels');
        console.log('    3. Click "Create a tunnel"');
        console.log('    4. Choose "Cloudflared" as the connector');
        console.log('    5. Name it (e.g., "agent-' + agentName + '")');
        console.log('    6. On the "Install connector" page, copy the tunnel token');
        console.log('       (it starts with eyJhIjoi...)\n');

        const ready = await ask(rl, '  Press Enter when you have the token (or type "skip" to do later): ');

        if (ready.toLowerCase() !== 'skip') {
            const tunnelToken = await ask(rl, '  🔑 Paste your tunnel token: ');
            if (!isValidTunnelToken(tunnelToken)) {
                console.error('  ❌ Invalid token. It should start with eyJhIjoi... and be quite long.');
                rl.close();
                process.exit(1);
            }
            saveEnvValue('TUNNEL_TOKEN', tunnelToken);
            console.log('  ✅ Token saved.\n');

            // Install as system service
            console.log('  Installing tunnel as a system service...\n');
            const serviceResult = installTunnelService(tunnelToken);
            console.log(`  ${serviceResult.message}`);

            if (!serviceResult.success) {
                console.log('\n  ⚠️  You can run the tunnel manually instead:');
                console.log(`     cloudflared tunnel run --token ${tunnelToken.substring(0, 20)}...\n`);
            }

            // Configure public hostname — clearly show port
            console.log(`\n  📋 Almost done! Your webhook server will run on: http://localhost:${port}`);
            console.log('     Now set up the public hostname in Cloudflare:\n');
            console.log('    1. Back in the Cloudflare dashboard, go to your tunnel settings');
            console.log('    2. Add a "Public Hostname" route');
            console.log(`    3. Service type: HTTP, URL: localhost:${port}`);
            console.log('    4. Save\n');

            const tunnelUrl = await ask(rl, '  Enter the public hostname URL you just created: ');
            if (tunnelUrl && tunnelUrl.startsWith('https://')) {
                saveEnvValue('TUNNEL_URL', tunnelUrl);
                console.log(`  ✅ Tunnel URL: ${tunnelUrl}\n`);
            } else {
                console.log('  ⚠️  You can set TUNNEL_URL later in ~/.openclaw/.agent-connect.env\n');
            }
        } else {
            console.log('\n  ⚠️  Tunnel setup skipped. Set TUNNEL_URL and TUNNEL_TOKEN');
            console.log('     in ~/.openclaw/.agent-connect.env when ready.\n');
        }
    }

    // --- Step 4: Friend Mode ---
    console.log('━'.repeat(50));
    console.log('🤖 Step 4: Friend Mode\n');
    console.log('  Choose how your agent handles friend conversations:\n');
    console.log('  AUTO  — Agent auto-replies to messages and can initiate chats.');
    console.log('          It will stop after a few exchanges to avoid infinite loops.');
    console.log('          Important messages are still escalated to you.\n');
    console.log('  MANUAL — Agent always notifies you and waits for your instruction.');
    console.log('           You decide every response.\n');

    const modeAnswer = await ask(rl, '  Enable auto friend mode? (y/n, default n): ');
    const friendMode = modeAnswer.toLowerCase() === 'y' ? 'auto' : 'manual';
    saveEnvValue('FRIEND_MODE', friendMode);
    console.log(`  ✅ Friend mode: ${friendMode}\n`);

    if (friendMode === 'auto') {
        const maxExch = await ask(rl, '  Max exchanges per conversation before cooldown (default 6): ');
        const maxVal = maxExch ? parseInt(maxExch, 10) : 6;
        if (!isNaN(maxVal) && maxVal > 0 && maxVal <= 50) {
            saveEnvValue('MAX_EXCHANGES', maxVal.toString());
        }

        const cooldown = await ask(rl, '  Cooldown period in minutes between auto-conversations (default 30): ');
        const coolVal = cooldown ? parseInt(cooldown, 10) : 30;
        if (!isNaN(coolVal) && coolVal > 0) {
            saveEnvValue('COOLDOWN_MINUTES', coolVal.toString());
        }

        console.log(`  ✅ Cooldown: ${maxVal || 6} exchanges, ${coolVal || 30}min gap\n`);
    }

    // --- Step 5: Telegram Notifications ---
    console.log('━'.repeat(50));
    console.log('📱 Step 5: Telegram Notifications (optional)\n');
    console.log('  Forward all agent messages to a private Telegram channel.');
    console.log('  You can monitor conversations and friend requests from Telegram.\n');

    // Helper: ask for bot token with retry
    async function askForBotToken() {
        for (let attempt = 0; attempt < 2; attempt++) {
            const token = await ask(rl, '  Bot token (from @BotFather): ');
            if (token && token.includes(':')) {
                saveEnvValue('TELEGRAM_BOT_TOKEN', token);
                console.log('  ✅ Bot token saved.\n');
                return true;
            }
            console.log('  ⚠️  Invalid token (should contain ":"). Try again.\n');
        }
        console.log('  ❌ Skipping bot token. Set TELEGRAM_BOT_TOKEN in env later.\n');
        return false;
    }

    // Helper: ask for channel ID with retry
    async function askForChannelId() {
        for (let attempt = 0; attempt < 2; attempt++) {
            const id = await ask(rl, '  Channel ID for notifications (e.g., -1001234567890): ');
            if (id && id.startsWith('-')) {
                saveEnvValue('TELEGRAM_CHANNEL_ID', id);
                console.log('  ✅ Channel ID saved!\n');
                return true;
            }
            console.log('  ⚠️  Invalid ID (should start with "-"). Try again.\n');
        }
        console.log('  ❌ Skipping channel ID. Set TELEGRAM_CHANNEL_ID in env later.\n');
        return false;
    }

    // Try to auto-detect from OpenClaw config
    let tokenResolved = false;
    try {
        const { getOpenClawConfig } = require('../lib/config');
        const ocConfig = getOpenClawConfig();
        const existingBotToken = ocConfig?.channels?.telegram?.botToken;

        if (existingBotToken && existingBotToken.includes(':')) {
            const masked = existingBotToken.substring(0, 6) + '...' + existingBotToken.slice(-4);
            console.log(`  ✅ Found Telegram bot token in openclaw.json: ${masked}`);
            console.log('     Will reuse your OpenClaw Telegram bot automatically.\n');

            const useExisting = await ask(rl, '  Use this bot token? (y/n, default y): ');
            if (useExisting.toLowerCase() !== 'n') {
                // Don't save — config.js auto-reads from openclaw.json
                console.log('  ✅ Using OpenClaw bot token.\n');
                tokenResolved = true;
            } else {
                tokenResolved = await askForBotToken();
            }
        }
    } catch {
        console.log('  ⚠️  Could not read openclaw.json. No worries.\n');
    }

    // If we didn't get a token from auto-detect, ask manually
    if (!tokenResolved) {
        const wantTelegram = await ask(rl, '  Enable Telegram notifications? (y/n, default n): ');
        if (wantTelegram.toLowerCase() === 'y') {
            console.log('\n  To set up, you need:');
            console.log('    1. Create a bot via @BotFather on Telegram');
            console.log('    2. Create a private channel and add the bot as admin');
            console.log('    3. Get the channel ID (starts with -100)\n');
            tokenResolved = await askForBotToken();
        } else {
            console.log('  ℹ️  Skipped. Enable later with TELEGRAM_BOT_TOKEN + TELEGRAM_CHANNEL_ID.\n');
        }
    }

    // Ask for channel ID if we got a token
    if (tokenResolved) {
        await askForChannelId();
    }

    rl.close();

    // --- Summary ---
    console.log('━'.repeat(50));
    console.log('✅ Setup complete!\n');

    // Read back the saved config for display
    const { getConfig } = require('../lib/config');
    const finalConfig = getConfig();

    console.log('  Your agent configuration:');
    console.log(`    Agent name:  ${finalConfig.agentName}`);
    console.log(`    Port:        ${finalConfig.port}`);
    console.log(`    Tunnel URL:  ${finalConfig.tunnelUrl || '(not set yet)'}`);
    console.log(`    Config file: ${ENV_FILE}`);
    console.log('');
    console.log('  Next steps:');
    console.log('    1. Start the server:  /connect-start');
    console.log('    2. Add a friend:      /connect-add <name> <url>');
    console.log('    3. Send a message:    /connect-send <name> <message>');
    console.log('');
}

main().catch(err => {
    console.error('❌ Setup error:', err.message);
    process.exit(1);
});
