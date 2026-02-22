#!/usr/bin/env node
/**
 * Agent Connect - Send Message
 * Sends a message to a paired friend
 * 
 * Usage: node send-message.js <name> <message...>
 */

const http = require('http');
const https = require('https');
const { getConfig, loadFriend, saveFriend, appendToConversationLog } = require('../lib/config');
const { encryptMessage } = require('../lib/crypto');
const telegram = require('../lib/telegram');

const args = process.argv.slice(2);
const friendName = args[0];
const message = args.slice(1).join(' ');

function main() {
    if (!friendName || !message) {
        console.error('❌ Usage: node send-message.js <name> <message>');
        console.error('   Example: node send-message.js maya Hey, how are you?');
        process.exit(1);
    }

    const friend = loadFriend(friendName);
    if (!friend) {
        console.error(`❌ No friend found: ${friendName}`);
        console.error('   Add them first: /connect-add <name> <url>');
        process.exit(1);
    }

    if (friend.status !== 'paired') {
        console.error(`❌ Not yet paired with ${friendName} (status: ${friend.status})`);
        process.exit(1);
    }

    const config = getConfig();
    const timestamp = new Date().toISOString();

    // Init Telegram if configured
    if (config.telegramBotToken && config.telegramChannelId) {
        telegram.initTelegram(config.telegramBotToken, config.telegramChannelId);
    }

    // Encrypt message with shared token (E2E)
    const encrypted = encryptMessage(message, friend.token);

    const payload = JSON.stringify({
        from: config.agentName,
        message: encrypted,
        encrypted: true,
        timestamp,
    });

    console.log(`📤 Sending to ${friendName}...`);

    const url = new URL('/message', friend.webhook_url);
    const transport = url.protocol === 'https:' ? https : http;

    const req = transport.request(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'Authorization': `Bearer ${friend.token}`,
        },
        timeout: 15000,
    }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const response = JSON.parse(data);
                if (res.statusCode === 200) {
                    console.log(`✅ Message delivered to ${friendName}`);

                    // Save to conversation history (in friend config)
                    friend.conversation_history = friend.conversation_history || [];
                    friend.conversation_history.push({
                        from: config.agentName,
                        message,
                        timestamp,
                        direction: 'outgoing',
                    });

                    // Keep last 100 messages
                    if (friend.conversation_history.length > 100) {
                        friend.conversation_history = friend.conversation_history.slice(-100);
                    }

                    friend.last_message_at = timestamp;
                    saveFriend(friendName, friend);

                    // Also log to per-friend memory
                    appendToConversationLog(friendName, config.agentName, message, 'outgoing');

                    // Notify Telegram
                    telegram.notifyOutgoingMessage(friendName, message, config.agentName);
                } else if (res.statusCode === 429) {
                    console.error(`⚠️  Rate limited. Try again in a minute.`);
                } else {
                    console.error(`❌ Delivery failed: ${response.error || 'Unknown error'}`);
                }
            } catch {
                console.error(`❌ Invalid response from ${friendName}`);
            }
        });
    });

    req.on('error', (err) => {
        console.error(`❌ Failed to reach ${friendName}: ${err.message}`);
    });

    req.on('timeout', () => {
        req.destroy();
        console.error(`❌ Connection timed out`);
    });

    req.write(payload);
    req.end();
}

main();
