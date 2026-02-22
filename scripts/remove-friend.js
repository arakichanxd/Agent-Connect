#!/usr/bin/env node
/**
 * Agent Connect - Remove Friend
 * Removes a friend from the friends list
 * 
 * Usage: node remove-friend.js <name>
 */

const { loadFriend, deleteFriend, getConfig } = require('../lib/config');
const telegram = require('../lib/telegram');

const args = process.argv.slice(2);
const friendName = args[0];

function main() {
    if (!friendName) {
        console.error('❌ Usage: node remove-friend.js <name>');
        process.exit(1);
    }

    const friend = loadFriend(friendName);
    if (!friend) {
        console.error(`❌ No friend found: ${friendName}`);
        process.exit(1);
    }

    const config = getConfig();

    // Init Telegram if configured
    if (config.telegramBotToken && config.telegramChannelId) {
        telegram.initTelegram(config.telegramBotToken, config.telegramChannelId);
    }

    deleteFriend(friendName);
    console.log(`✅ Removed ${friendName} from friends list`);
    console.log(`   They will no longer be able to send you messages.`);

    telegram.notifyFriendRemoved(friendName, config.agentName);
}

main();
