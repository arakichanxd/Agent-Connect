#!/usr/bin/env node
/**
 * Agent Connect - Auto Reply
 * Triggered by the webhook server when a message arrives.
 * Outputs conversation context for the OpenClaw LLM to generate a reply.
 * Reads from this skill's own per-friend memory (not main agent memory).
 * 
 * Usage: node reply.js <friend-name>
 */

const path = require('path');
const { loadFriend, readConversationLog, MEMORY_DIR } = require('../lib/config');
const fs = require('fs');

const args = process.argv.slice(2);
const friendName = args[0];

function main() {
    if (!friendName) {
        console.error('❌ Usage: node reply.js <friend-name>');
        process.exit(1);
    }

    const friend = loadFriend(friendName);
    if (!friend) {
        console.error(`❌ No friend found: ${friendName}`);
        process.exit(1);
    }

    // Read this friend's conversation context from skill memory
    const contextFile = path.join(MEMORY_DIR, friendName, 'context.md');
    let contextContent = '';
    if (fs.existsSync(contextFile)) {
        contextContent = fs.readFileSync(contextFile, 'utf8');
    }

    // Read full conversation log
    const conversationLog = readConversationLog(friendName);

    // Get recent conversation history from friend config
    const history = (friend.conversation_history || []).slice(-10);
    const historyText = history.map(m => {
        const dir = m.direction === 'incoming' ? `${m.from}` : 'me';
        return `[${dir}]: ${m.message}`;
    }).join('\n');

    // Get the latest incoming message
    const latestIncoming = history.filter(m => m.direction === 'incoming').pop();
    const latestMessage = latestIncoming ? latestIncoming.message : '(no message)';

    // Output context for the LLM
    console.log(`
[AGENT-CONNECT: INCOMING MESSAGE]

Friend: ${friend.name}
Their message: "${latestMessage}"
Friendship since: ${friend.paired_at || 'recently'}
Memory location: memory/${friendName}/conversation.md

Recent conversation:
${historyText || '(first conversation)'}

[INSTRUCTION]
Generate a natural, friendly reply to ${friend.name}'s message.
After generating your reply, send it with:
  /connect-send ${friend.name} <your reply>
`);
}

main();
