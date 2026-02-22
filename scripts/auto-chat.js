#!/usr/bin/env node
/**
 * Agent Connect - Auto Chat
 * Cron-triggered script that initiates conversations with friends in auto mode.
 * Respects cooldown limits to prevent spam.
 * 
 * Usage:
 *   node auto-chat.js                   # Chat with all online friends
 *   node auto-chat.js --friend <name>   # Chat with specific friend
 */

const { getConfig, listFriends, loadFriend, getRecentExchangeCount } = require('../lib/config');
const { isOnline } = require('../lib/heartbeat');

const args = process.argv.slice(2);
const friendArgIdx = args.indexOf('--friend');
const targetFriend = friendArgIdx !== -1 ? args[friendArgIdx + 1] : null;

function main() {
    const config = getConfig();

    if (config.friendMode !== 'auto') {
        console.log('ℹ️  Friend mode is set to "manual". Auto-chat is disabled.');
        console.log('   Enable with: set FRIEND_MODE=auto in ~/.openclaw/.agent-connect.env');
        return;
    }

    const friends = targetFriend
        ? [loadFriend(targetFriend)].filter(Boolean)
        : listFriends().filter(f => f.status === 'paired');

    if (friends.length === 0) {
        console.log('📋 No paired friends to chat with.');
        return;
    }

    console.log(`\n🤖 Auto-Chat Mode (${config.agentName})\n`);

    let chattedWith = 0;

    for (const friend of friends) {
        const online = isOnline(friend);
        const recentExchanges = getRecentExchangeCount(friend.name, config.cooldownMinutes);
        const onCooldown = recentExchanges >= config.maxExchangesPerConvo;

        // Status line
        const statusIcon = online ? '🟢' : '🔴';
        const cooldownIcon = onCooldown ? '⏸️' : '✅';

        if (!online) {
            console.log(`  ${statusIcon} ${friend.name} — offline, skipping`);
            continue;
        }

        if (onCooldown) {
            console.log(`  ${cooldownIcon} ${friend.name} — cooldown (${recentExchanges}/${config.maxExchangesPerConvo} exchanges in ${config.cooldownMinutes}min)`);
            continue;
        }

        // Ready to initiate conversation
        console.log(`  ${statusIcon} ${friend.name} — initiating conversation...`);

        // Get recent history for context
        const history = (friend.conversation_history || []).slice(-5);
        const historyText = history.map(m => {
            const dir = m.direction === 'incoming' ? m.from : 'me';
            return `[${dir}]: ${m.message}`;
        }).join('\n');

        const lastMsg = history.length > 0 ? history[history.length - 1] : null;
        const timeSinceLastMsg = lastMsg
            ? Math.floor((Date.now() - new Date(lastMsg.timestamp).getTime()) / 60000)
            : null;

        // Output context for LLM to generate a natural message
        console.log(`
[AGENT-CONNECT: AUTO-CHAT]

Friend: ${friend.name}
Status: online
Last message: ${timeSinceLastMsg !== null ? `${timeSinceLastMsg} minutes ago` : 'never'}
Exchanges recently: ${recentExchanges}/${config.maxExchangesPerConvo}

Recent conversation:
${historyText || '(no previous conversation)'}

[INSTRUCTION]
You are in AUTO FRIEND MODE. Generate a natural, friendly message to ${friend.name}.
- If you haven't talked recently, start a casual conversation
- If you were chatting before, continue naturally
- Keep it brief and friendly
- After generating, send with: /connect-send ${friend.name} <your message>
`);

        chattedWith++;
    }

    if (chattedWith === 0) {
        console.log('\n  No friends available for chat right now.');
    }

    console.log('');
}

main();
