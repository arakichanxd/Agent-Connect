#!/usr/bin/env node
/**
 * Agent Connect - Telegram Notifications
 * Forwards all agent communication to a private Telegram channel.
 * The master can monitor all messages and friend requests from Telegram.
 * 
 * Uses Telegram Bot API — no external dependencies, just https requests.
 * 
 * Required env vars:
 *   TELEGRAM_BOT_TOKEN  — from @BotFather
 *   TELEGRAM_CHANNEL_ID — your private channel ID (e.g., -1001234567890)
 */

const https = require('https');

let _botToken = null;
let _channelId = null;
let _enabled = false;

/**
 * Initialize Telegram with config
 */
function initTelegram(botToken, channelId) {
    _botToken = botToken;
    _channelId = channelId;
    _enabled = !!(botToken && channelId);
    return _enabled;
}

/**
 * Check if Telegram is configured
 */
function isTelegramEnabled() {
    return _enabled;
}

/**
 * Send a message to the Telegram channel
 * Uses Telegram Bot API sendMessage with HTML parse mode
 */
function sendToChannel(text, options = {}) {
    if (!_enabled) return Promise.resolve(null);

    return new Promise((resolve) => {
        const payload = JSON.stringify({
            chat_id: _channelId,
            text: text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            ...options,
        });

        const req = https.request(`https://api.telegram.org/bot${_botToken}/sendMessage`, {
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
                    resolve(JSON.parse(data));
                } catch {
                    resolve(null);
                }
            });
        });

        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.write(payload);
        req.end();
    });
}

// --- Notification Helpers ---

/**
 * Notify: incoming message from a friend
 */
function notifyIncomingMessage(fromAgent, message, agentName) {
    const text = [
        `📩 <b>Incoming Message</b>`,
        ``,
        `<b>From:</b> ${escapeHtml(fromAgent)}`,
        `<b>To:</b> ${escapeHtml(agentName)}`,
        `<b>Time:</b> ${new Date().toLocaleString()}`,
        ``,
        `<blockquote>${escapeHtml(message)}</blockquote>`,
    ].join('\n');
    return sendToChannel(text);
}

/**
 * Notify: outgoing message to a friend
 */
function notifyOutgoingMessage(toAgent, message, agentName) {
    const text = [
        `📤 <b>Outgoing Message</b>`,
        ``,
        `<b>From:</b> ${escapeHtml(agentName)}`,
        `<b>To:</b> ${escapeHtml(toAgent)}`,
        `<b>Time:</b> ${new Date().toLocaleString()}`,
        ``,
        `<blockquote>${escapeHtml(message)}</blockquote>`,
    ].join('\n');
    return sendToChannel(text);
}

/**
 * Notify: friend request received
 */
function notifyFriendRequest(fromAgent, webhookUrl, agentName) {
    const text = [
        `🤝 <b>New Friend Request!</b>`,
        ``,
        `<b>From:</b> ${escapeHtml(fromAgent)}`,
        `<b>URL:</b> ${escapeHtml(webhookUrl)}`,
        `<b>To:</b> ${escapeHtml(agentName)}`,
        ``,
        `To accept: <code>/connect-accept ${escapeHtml(fromAgent)}</code>`,
        `To reject: <code>/connect-cancel ${escapeHtml(fromAgent)}</code>`,
    ].join('\n');
    return sendToChannel(text);
}

/**
 * Notify: friend paired
 */
function notifyPaired(friendName, agentName) {
    return sendToChannel(`✅ <b>${escapeHtml(agentName)}</b> is now paired with <b>${escapeHtml(friendName)}</b>!`);
}

/**
 * Notify: friend removed
 */
function notifyFriendRemoved(friendName, agentName) {
    return sendToChannel(`❌ <b>${escapeHtml(agentName)}</b> removed friend <b>${escapeHtml(friendName)}</b>`);
}

/**
 * Notify: file received
 */
function notifyFileReceived(fromAgent, filename, sizeKB, agentName) {
    const text = [
        `📎 <b>File Received</b>`,
        ``,
        `<b>From:</b> ${escapeHtml(fromAgent)}`,
        `<b>File:</b> ${escapeHtml(filename)} (${sizeKB}KB)`,
        `<b>To:</b> ${escapeHtml(agentName)}`,
    ].join('\n');
    return sendToChannel(text);
}

/**
 * Notify: server status change
 */
function notifyServerStatus(status, agentName) {
    const emoji = status === 'started' ? '🚀' : '🛑';
    return sendToChannel(`${emoji} <b>${escapeHtml(agentName)}</b> server ${status}`);
}

/**
 * Escape HTML special characters for Telegram
 */
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

module.exports = {
    initTelegram,
    isTelegramEnabled,
    sendToChannel,
    notifyIncomingMessage,
    notifyOutgoingMessage,
    notifyFriendRequest,
    notifyPaired,
    notifyFriendRemoved,
    notifyFileReceived,
    notifyServerStatus,
};
