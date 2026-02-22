#!/usr/bin/env node
/**
 * Agent Connect - Cancel Friend Request
 * Cancels a pending outgoing pair request
 * 
 * Usage: node cancel-request.js <name>
 */

const { loadFriend, deleteFriend, getFriendMemoryDir } = require('../lib/config');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const friendName = args[0];

function main() {
    if (!friendName) {
        console.error('❌ Usage: node cancel-request.js <name>');
        process.exit(1);
    }

    const friend = loadFriend(friendName);
    if (!friend) {
        console.error(`❌ No friend or request found for: ${friendName}`);
        process.exit(1);
    }

    if (friend.status === 'paired') {
        console.error(`❌ Already paired with ${friendName}. Use /connect-remove to unfriend.`);
        process.exit(1);
    }

    if (friend.status !== 'pending') {
        console.error(`❌ No pending request for ${friendName} (status: ${friend.status})`);
        process.exit(1);
    }

    // Delete the pending friend config
    deleteFriend(friendName);

    // Clean up any memory files
    const memDir = path.join(getFriendMemoryDir(friendName));
    try {
        const pairFile = path.join(memDir, 'pair-request.md');
        if (fs.existsSync(pairFile)) fs.unlinkSync(pairFile);
    } catch { }

    console.log(`✅ Cancelled pair request for ${friendName}`);
    console.log(`   Their token has been revoked.`);
}

main();
