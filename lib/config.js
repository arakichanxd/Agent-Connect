#!/usr/bin/env node
/**
 * Agent Connect - Configuration Loader
 * Loads config from ~/.openclaw/.agent-connect.env
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const OPENCLAW_DIR = path.join(os.homedir(), '.openclaw');
const WORKSPACE_DIR = path.join(OPENCLAW_DIR, 'workspace');
const SKILL_DIR = path.join(WORKSPACE_DIR, 'skills', 'agent-connect');
const ENV_FILE = path.join(OPENCLAW_DIR, '.agent-connect.env');
const PID_FILE = path.join(OPENCLAW_DIR, '.agent-connect.pid');
const OPENCLAW_CONFIG = path.join(OPENCLAW_DIR, 'openclaw.json');
const FRIENDS_DIR = path.join(SKILL_DIR, 'friends');
const MEMORY_DIR = path.join(SKILL_DIR, 'memory');

/**
 * Read OpenClaw's main config (openclaw.json) for shared settings
 */
function getOpenClawConfig() {
    try {
        if (fs.existsSync(OPENCLAW_CONFIG)) {
            return JSON.parse(fs.readFileSync(OPENCLAW_CONFIG, 'utf8'));
        }
    } catch { }
    return null;
}

/**
 * Load environment variables from .agent-connect.env
 * Does NOT override existing env vars
 */
function loadEnv() {
    if (!fs.existsSync(ENV_FILE)) return;

    const content = fs.readFileSync(ENV_FILE, 'utf8');
    content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const match = trimmed.match(/^([A-Z_]+)=(.*)$/);
        if (match && !process.env[match[1]]) {
            process.env[match[1]] = match[2].trim();
        }
    });
}

/**
 * Get the full config object
 */
function getConfig() {
    loadEnv();

    // Try to read Telegram bot token from OpenClaw's config if not in our env
    let telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || null;
    let telegramChannelId = process.env.TELEGRAM_CHANNEL_ID || null;

    if (!telegramBotToken) {
        const ocConfig = getOpenClawConfig();
        if (ocConfig?.channels?.telegram?.botToken) {
            telegramBotToken = ocConfig.channels.telegram.botToken;
        }
    }

    return {
        agentName: process.env.AGENT_NAME || 'unnamed-agent',
        port: parseInt(process.env.CONNECT_PORT || '3847', 10),
        tunnelUrl: process.env.TUNNEL_URL || null,
        tunnelToken: process.env.TUNNEL_TOKEN || null,
        friendMode: process.env.FRIEND_MODE || 'manual',
        maxExchangesPerConvo: parseInt(process.env.MAX_EXCHANGES || '6', 10),
        cooldownMinutes: parseInt(process.env.COOLDOWN_MINUTES || '30', 10),
        telegramBotToken,
        telegramChannelId,
    };
}

/**
 * Check if the skill is configured
 */
function isConfigured() {
    loadEnv();
    return !!(process.env.AGENT_NAME && process.env.TUNNEL_URL);
}

/**
 * Save a key=value pair to the env file
 * Creates with restrictive permissions (owner-only)
 */
function saveEnvValue(key, value) {
    // Ensure .openclaw dir exists
    fs.mkdirSync(OPENCLAW_DIR, { recursive: true });

    let content = '';
    if (fs.existsSync(ENV_FILE)) {
        content = fs.readFileSync(ENV_FILE, 'utf8');
    }

    const lines = content.split('\n');
    let found = false;
    const updated = lines.map(line => {
        if (line.startsWith(`${key}=`)) {
            found = true;
            return `${key}=${value}`;
        }
        return line;
    });

    if (!found) {
        updated.push(`${key}=${value}`);
    }

    fs.writeFileSync(ENV_FILE, updated.join('\n'), { mode: 0o600 }); // Owner-only read/write
}

/**
 * Load a friend config from friends/<name>.json
 */
function loadFriend(name) {
    const file = path.join(FRIENDS_DIR, `${name}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Save a friend config to friends/<name>.json
 */
function saveFriend(name, data) {
    fs.mkdirSync(FRIENDS_DIR, { recursive: true });
    const file = path.join(FRIENDS_DIR, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/**
 * Delete a friend config
 */
function deleteFriend(name) {
    const file = path.join(FRIENDS_DIR, `${name}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
}

/**
 * List all friends
 */
function listFriends() {
    if (!fs.existsSync(FRIENDS_DIR)) return [];
    return fs.readdirSync(FRIENDS_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => {
            const data = JSON.parse(fs.readFileSync(path.join(FRIENDS_DIR, f), 'utf8'));
            return data;
        });
}

/**
 * Validate a friend name (alphanumeric, dash, underscore only)
 */
function isValidName(name) {
    return /^[a-zA-Z0-9_-]+$/.test(name) && name.length <= 64;
}

// --- Per-Friend Memory ---

/**
 * Get the memory directory for a specific friend
 * Structure: skills/agent-connect/memory/<friendName>/
 */
function getFriendMemoryDir(friendName) {
    const dir = path.join(MEMORY_DIR, friendName);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

/**
 * Append a message to a friend's conversation log
 * Each friend gets their own conversation.md file
 */
function appendToConversationLog(friendName, from, message, direction) {
    const memDir = getFriendMemoryDir(friendName);
    const logFile = path.join(memDir, 'conversation.md');
    const timestamp = new Date().toISOString();
    const arrow = direction === 'incoming' ? '⬅️' : '➡️';

    // Create header if file doesn't exist
    if (!fs.existsSync(logFile)) {
        fs.writeFileSync(logFile, `# Conversation with ${friendName}\n\n`);
    }

    const entry = `${arrow} **${from}** (${timestamp}):\n${message}\n\n`;
    fs.appendFileSync(logFile, entry);
}

/**
 * Write the latest conversation context for a friend
 * This is what the LLM reads to understand the current state
 */
function writeLatestContext(friendName, contextData) {
    const memDir = getFriendMemoryDir(friendName);
    const contextFile = path.join(memDir, 'context.md');
    fs.writeFileSync(contextFile, contextData);
}

/**
 * Read a friend's conversation log
 */
function readConversationLog(friendName) {
    const logFile = path.join(MEMORY_DIR, friendName, 'conversation.md');
    if (!fs.existsSync(logFile)) return '';
    return fs.readFileSync(logFile, 'utf8');
}

/**
 * Count recent consecutive exchanges with a friend
 * Used to prevent infinite auto-reply loops
 * Returns the number of messages exchanged in the last N minutes
 */
function getRecentExchangeCount(friendName, windowMinutes) {
    const friend = loadFriend(friendName);
    if (!friend || !friend.conversation_history) return 0;

    const cutoff = Date.now() - (windowMinutes * 60 * 1000);
    return friend.conversation_history.filter(m => {
        const msgTime = new Date(m.timestamp).getTime();
        return msgTime > cutoff;
    }).length;
}

module.exports = {
    OPENCLAW_DIR,
    WORKSPACE_DIR,
    SKILL_DIR,
    ENV_FILE,
    PID_FILE,
    FRIENDS_DIR,
    MEMORY_DIR,
    loadEnv,
    getConfig,
    getOpenClawConfig,
    isConfigured,
    saveEnvValue,
    loadFriend,
    saveFriend,
    deleteFriend,
    listFriends,
    isValidName,
    getFriendMemoryDir,
    appendToConversationLog,
    writeLatestContext,
    readConversationLog,
    getRecentExchangeCount,
};
