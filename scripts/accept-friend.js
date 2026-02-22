#!/usr/bin/env node
/**
 * Agent Connect - Accept Friend
 * Accepts a pending pair request from another agent
 * 
 * Usage: node accept-friend.js <name>
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { getConfig, loadFriend, saveFriend, getFriendMemoryDir } = require('../lib/config');
const telegram = require('../lib/telegram');

const args = process.argv.slice(2);
const friendName = args[0];

function main() {
    if (!friendName) {
        console.error('❌ Usage: node accept-friend.js <name>');
        process.exit(1);
    }

    const friend = loadFriend(friendName);
    if (!friend) {
        console.error(`❌ No pending request from: ${friendName}`);
        process.exit(1);
    }

    if (friend.status === 'paired') {
        console.log(`✅ Already paired with ${friendName}`);
        process.exit(0);
    }

    if (friend.status !== 'pending') {
        console.error(`❌ Unexpected status for ${friendName}: ${friend.status}`);
        process.exit(1);
    }

    const config = getConfig();
    const myUrl = config.tunnelUrl || `http://localhost:${config.port}`;

    // Init Telegram if configured
    if (config.telegramBotToken && config.telegramChannelId) {
        telegram.initTelegram(config.telegramBotToken, config.telegramChannelId);
    }

    console.log(`✅ Accepting pair request from ${friendName}...`);

    // Update local friend status
    friend.status = 'paired';
    friend.paired_at = new Date().toISOString();
    saveFriend(friendName, friend);

    // Notify the friend's webhook
    const payload = JSON.stringify({
        from: config.agentName,
        webhook_url: myUrl,
    });

    const url = new URL('/pair-accept', friend.webhook_url);
    const transport = url.protocol === 'https:' ? https : http;

    const req = transport.request(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'Authorization': `Bearer ${friend.token}`,
        },
        timeout: 10000,
    }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const response = JSON.parse(data);
                if (res.statusCode === 200) {
                    console.log(`✅ Paired with ${friendName}!`);
                    console.log(`   You can now send messages: /connect-send ${friendName} <message>`);
                    telegram.notifyPaired(friendName, config.agentName);
                } else {
                    console.error(`⚠️  Friend notification failed: ${response.error}`);
                    console.log('   (You are paired locally, but they may not know yet)');
                }
            } catch {
                console.error('⚠️  Could not parse friend response');
            }
        });
    });

    req.on('error', (err) => {
        console.error(`⚠️  Could not notify ${friendName}: ${err.message}`);
        console.log('   (You are paired locally, they will be notified on next heartbeat)');
    });

    req.on('timeout', () => {
        req.destroy();
        console.error(`⚠️  Notification timed out`);
    });

    req.write(payload);
    req.end();

    // Clean up pair request notification from friend's memory
    const memDir = getFriendMemoryDir(friendName);
    const notifFile = path.join(memDir, 'pair-request.md');
    try { fs.unlinkSync(notifFile); } catch { }
}

main();
