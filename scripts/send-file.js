#!/usr/bin/env node
/**
 * Agent Connect - Send File
 * Sends a file/image to a paired friend via base64 encoding.
 * 
 * Usage: node send-file.js <friend> <filepath> [caption]
 * 
 * Files are base64-encoded, encrypted, and sent as a special message type.
 * Max file size: 10MB (base64 encoded ~13.3MB over wire)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { getConfig, loadFriend, saveFriend, appendToConversationLog } = require('../lib/config');
const { encryptMessage } = require('../lib/crypto');
const telegram = require('../lib/telegram');

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const args = process.argv.slice(2);
const friendName = args[0];
const filePath = args[1];
const caption = args.slice(2).join(' ') || '';

function main() {
    if (!friendName || !filePath) {
        console.error('❌ Usage: node send-file.js <friend> <filepath> [caption]');
        console.error('   Example: node send-file.js maya ./screenshot.png Check this out!');
        process.exit(1);
    }

    // Validate file
    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) {
        console.error(`❌ File not found: ${absPath}`);
        process.exit(1);
    }

    const stats = fs.statSync(absPath);
    if (stats.size > MAX_FILE_SIZE) {
        console.error(`❌ File too large (${(stats.size / 1024 / 1024).toFixed(1)}MB). Max: 10MB`);
        process.exit(1);
    }

    const friend = loadFriend(friendName);
    if (!friend) {
        console.error(`❌ No friend found: ${friendName}`);
        process.exit(1);
    }
    if (friend.status !== 'paired') {
        console.error(`❌ Not paired with ${friendName}`);
        process.exit(1);
    }

    const config = getConfig();
    const fileName = path.basename(absPath);
    const ext = path.extname(absPath).toLowerCase().slice(1);
    const mimeType = getMimeType(ext);

    // Init Telegram if configured
    if (config.telegramBotToken && config.telegramChannelId) {
        telegram.initTelegram(config.telegramBotToken, config.telegramChannelId);
    }

    // Read and base64-encode the file
    const fileBuffer = fs.readFileSync(absPath);
    const fileBase64 = fileBuffer.toString('base64');

    console.log(`📤 Sending file to ${friendName}...`);
    console.log(`   File: ${fileName} (${(stats.size / 1024).toFixed(1)}KB)`);

    // Build file message
    const fileMessage = JSON.stringify({
        type: 'file',
        filename: fileName,
        mime: mimeType,
        size: stats.size,
        data: fileBase64,
        caption: caption || null,
    });

    // Encrypt the file message
    const encrypted = encryptMessage(fileMessage, friend.token);

    const payload = JSON.stringify({
        from: config.agentName,
        message: encrypted,
        encrypted: true,
        message_type: 'file',
        timestamp: new Date().toISOString(),
    });

    const url = new URL('/message', friend.webhook_url);
    const transport = url.protocol === 'https:' ? https : http;

    const req = transport.request(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'Authorization': `Bearer ${friend.token}`,
        },
        timeout: 30000,
    }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            if (res.statusCode === 200) {
                console.log(`✅ File delivered to ${friendName}`);
                appendToConversationLog(friendName, config.agentName, `[FILE: ${fileName}] ${caption}`, 'outgoing');
                telegram.notifyOutgoingMessage(friendName, `📎 [FILE: ${fileName} (${(stats.size / 1024).toFixed(1)}KB)]${caption ? ' ' + caption : ''}`, config.agentName);
            } else {
                console.error(`❌ Delivery failed: ${data}`);
            }
        });
    });

    req.on('error', err => console.error(`❌ Failed: ${err.message}`));
    req.on('timeout', () => { req.destroy(); console.error('❌ Timeout'); });
    req.write(payload);
    req.end();
}

function getMimeType(ext) {
    const mimes = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
        webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
        pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown',
        json: 'application/json', csv: 'text/csv',
        zip: 'application/zip', tar: 'application/x-tar',
        mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4',
    };
    return mimes[ext] || 'application/octet-stream';
}

main();
