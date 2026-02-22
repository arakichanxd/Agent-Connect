#!/usr/bin/env node
/**
 * Agent Connect - Friends List
 * Shows all friends and their online/offline status
 */

const { listFriends } = require('../lib/config');
const { isOnline } = require('../lib/heartbeat');

function main() {
    const friends = listFriends();

    if (friends.length === 0) {
        console.log('📋 No friends yet.');
        console.log('   Add one: /connect-add <name> <url>');
        return;
    }

    console.log(`\n📋 Friends (${friends.length})\n`);

    for (const friend of friends) {
        const online = isOnline(friend);
        const statusIcon = friend.status === 'paired'
            ? (online ? '🟢' : '🔴')
            : '⏳';

        const statusText = friend.status === 'paired'
            ? (online ? 'online' : 'offline')
            : 'pending';

        const lastMsg = friend.last_message_at
            ? `Last msg: ${friend.last_message_at}`
            : 'No messages yet';

        console.log(`  ${statusIcon} ${friend.name} (${statusText})`);
        console.log(`     URL: ${friend.webhook_url}`);
        console.log(`     ${lastMsg}`);
        console.log('');
    }
}

main();
