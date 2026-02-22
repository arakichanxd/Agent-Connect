#!/usr/bin/env node
/**
 * Agent Connect - Heartbeat System
 * Ping/pong to track which friends are online
 */

const http = require('http');
const https = require('https');
const { loadFriend, saveFriend, listFriends } = require('./config');

const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds
const ONLINE_THRESHOLD_MS = 90 * 1000;   // 3x interval = 90s

let heartbeatTimer = null;

/**
 * Send a heartbeat ping to a single friend
 */
function pingFriend(friendConfig, agentName) {
    if (!friendConfig || !friendConfig.webhook_url || friendConfig.status !== 'paired') {
        return;
    }

    const payload = JSON.stringify({
        from: agentName,
        timestamp: Date.now(),
        type: 'heartbeat',
    });

    const url = new URL('/heartbeat', friendConfig.webhook_url);
    const transport = url.protocol === 'https:' ? https : http;

    const req = transport.request(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'Authorization': `Bearer ${friendConfig.token}`,
        },
        timeout: 5000,
    });

    req.on('error', () => {
        // Silently fail — friend is offline
    });

    req.on('timeout', () => {
        req.destroy();
    });

    req.write(payload);
    req.end();
}

/**
 * Start the heartbeat loop — pings all paired friends every 30s
 */
function startHeartbeat(agentName) {
    if (heartbeatTimer) clearInterval(heartbeatTimer);

    heartbeatTimer = setInterval(() => {
        const friends = listFriends();
        for (const friend of friends) {
            if (friend.status === 'paired') {
                pingFriend(friend, agentName);
            }
        }
    }, HEARTBEAT_INTERVAL_MS);

    // Don't keep process alive just for heartbeat
    if (heartbeatTimer.unref) heartbeatTimer.unref();

    console.log(`💓 Heartbeat started (every ${HEARTBEAT_INTERVAL_MS / 1000}s)`);
}

/**
 * Stop the heartbeat loop
 */
function stopHeartbeat() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        console.log('💔 Heartbeat stopped');
    }
}

/**
 * Record an incoming heartbeat from a friend
 */
function recordHeartbeat(friendName) {
    const friend = loadFriend(friendName);
    if (!friend) return false;

    friend.last_heartbeat = new Date().toISOString();
    saveFriend(friendName, friend);
    return true;
}

/**
 * Check if a friend is online (heartbeat within threshold)
 */
function isOnline(friendConfig) {
    if (!friendConfig || !friendConfig.last_heartbeat) return false;
    const lastSeen = new Date(friendConfig.last_heartbeat).getTime();
    return (Date.now() - lastSeen) < ONLINE_THRESHOLD_MS;
}

/**
 * Get online status for all friends
 * Returns: [{ name, status, online, lastSeen }]
 */
function getOnlineStatus() {
    const friends = listFriends();
    return friends.map(f => ({
        name: f.name,
        status: f.status,
        online: isOnline(f),
        lastSeen: f.last_heartbeat || 'never',
    }));
}

module.exports = {
    startHeartbeat,
    stopHeartbeat,
    pingFriend,
    recordHeartbeat,
    isOnline,
    getOnlineStatus,
    HEARTBEAT_INTERVAL_MS,
    ONLINE_THRESHOLD_MS,
};
