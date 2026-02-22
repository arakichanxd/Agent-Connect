#!/usr/bin/env node
/**
 * Agent Connect - Add Friend
 * Sends a pair request to another agent's webhook
 * 
 * Usage: node add-friend.js <name> <webhook-url>
 */

const http = require('http');
const https = require('https');
const { getConfig, loadFriend, saveFriend, isValidName } = require('../lib/config');
const { generatePairToken } = require('../lib/auth');

const args = process.argv.slice(2);
const friendName = args[0];
const friendUrl = args[1];

function main() {
    if (!friendName || !friendUrl) {
        console.error('❌ Usage: node add-friend.js <name> <webhook-url>');
        console.error('   Example: node add-friend.js maya https://maya-agent.example.com');
        process.exit(1);
    }

    if (!isValidName(friendName)) {
        console.error('❌ Invalid name. Use only letters, numbers, dash, underscore.');
        process.exit(1);
    }

    // Check if already friends
    const existing = loadFriend(friendName);
    if (existing && existing.status === 'paired') {
        console.error(`❌ Already paired with ${friendName}`);
        process.exit(1);
    }

    const config = getConfig();

    if (!config.agentName || config.agentName === 'unnamed-agent') {
        console.error('❌ Run /connect-setup first to configure your agent');
        process.exit(1);
    }

    // Generate shared secret
    const token = generatePairToken();
    const myUrl = config.tunnelUrl || `http://localhost:${config.port}`;

    // Save friend locally (pending)
    saveFriend(friendName, {
        name: friendName,
        webhook_url: friendUrl,
        token,
        status: 'pending',
        paired_at: null,
        last_heartbeat: null,
        last_message_at: null,
        conversation_history: [],
    });

    console.log(`📤 Sending pair request to ${friendName}...`);

    // Send pair request
    const payload = JSON.stringify({
        from: config.agentName,
        token,
        webhook_url: myUrl,
    });

    const url = new URL('/pair-request', friendUrl);
    const transport = url.protocol === 'https:' ? https : http;

    const req = transport.request(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 10000,
    }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const response = JSON.parse(data);
                if (res.statusCode === 200) {
                    console.log(`✅ Pair request sent to ${friendName}`);
                    console.log(`   Status: ${response.status}`);
                    console.log(`   Waiting for ${friendName} to accept...`);
                } else {
                    console.error(`❌ Rejected: ${response.error || 'Unknown error'}`);
                }
            } catch {
                console.error(`❌ Invalid response from ${friendName}`);
            }
        });
    });

    req.on('error', (err) => {
        console.error(`❌ Failed to reach ${friendName}: ${err.message}`);
        console.error(`   Make sure their server is running at: ${friendUrl}`);
    });

    req.on('timeout', () => {
        req.destroy();
        console.error(`❌ Connection timed out to ${friendUrl}`);
    });

    req.write(payload);
    req.end();
}

main();
