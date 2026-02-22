#!/usr/bin/env node
/**
 * Agent Connect - Group Messaging
 * Manage groups of friends and broadcast messages.
 * 
 * Usage:
 *   node group.js create <group-name> <friend1> <friend2> ...
 *   node group.js list
 *   node group.js send <group-name> <message...>
 *   node group.js add <group-name> <friend>
 *   node group.js remove <group-name> <friend>
 *   node group.js delete <group-name>
 *   node group.js info <group-name>
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { getConfig, loadFriend, saveFriend, appendToConversationLog, SKILL_DIR } = require('../lib/config');
const { encryptMessage } = require('../lib/crypto');

const GROUPS_DIR = path.join(SKILL_DIR, 'groups');

// Ensure groups directory
fs.mkdirSync(GROUPS_DIR, { recursive: true });

function loadGroup(name) {
    const file = path.join(GROUPS_DIR, `${name}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveGroup(name, data) {
    const file = path.join(GROUPS_DIR, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function deleteGroup(name) {
    const file = path.join(GROUPS_DIR, `${name}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
}

function listGroups() {
    if (!fs.existsSync(GROUPS_DIR)) return [];
    return fs.readdirSync(GROUPS_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => JSON.parse(fs.readFileSync(path.join(GROUPS_DIR, f), 'utf8')));
}

/**
 * Send a message to a single friend (helper)
 */
function sendToFriend(friendName, message, config) {
    return new Promise((resolve) => {
        const friend = loadFriend(friendName);
        if (!friend || friend.status !== 'paired') {
            resolve({ friend: friendName, success: false, error: 'not paired' });
            return;
        }

        const encrypted = encryptMessage(message, friend.token);
        const payload = JSON.stringify({
            from: config.agentName,
            message: encrypted,
            encrypted: true,
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
            timeout: 10000,
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    appendToConversationLog(friendName, config.agentName, message, 'outgoing');
                    resolve({ friend: friendName, success: true });
                } else {
                    resolve({ friend: friendName, success: false, error: data });
                }
            });
        });

        req.on('error', (err) => resolve({ friend: friendName, success: false, error: err.message }));
        req.on('timeout', () => { req.destroy(); resolve({ friend: friendName, success: false, error: 'timeout' }); });
        req.write(payload);
        req.end();
    });
}

// --- Commands ---

const args = process.argv.slice(2);
const subcommand = args[0]?.toLowerCase();

async function main() {
    const config = getConfig();

    switch (subcommand) {
        case 'create': {
            const groupName = args[1];
            const members = args.slice(2);
            if (!groupName || members.length === 0) {
                console.error('❌ Usage: group create <name> <friend1> <friend2> ...');
                process.exit(1);
            }

            // Validate all members are paired friends
            for (const m of members) {
                const f = loadFriend(m);
                if (!f || f.status !== 'paired') {
                    console.error(`❌ ${m} is not a paired friend`);
                    process.exit(1);
                }
            }

            saveGroup(groupName, {
                name: groupName,
                members,
                created_at: new Date().toISOString(),
                created_by: config.agentName,
            });

            console.log(`✅ Group "${groupName}" created with ${members.length} members: ${members.join(', ')}`);
            break;
        }

        case 'list': {
            const groups = listGroups();
            if (groups.length === 0) {
                console.log('📋 No groups yet. Create one: /connect-group create <name> <friends...>');
                return;
            }
            console.log(`\n📋 Groups (${groups.length})\n`);
            for (const g of groups) {
                console.log(`  📌 ${g.name} (${g.members.length} members)`);
                console.log(`     Members: ${g.members.join(', ')}`);
                console.log('');
            }
            break;
        }

        case 'send': {
            const groupName = args[1];
            const message = args.slice(2).join(' ');
            if (!groupName || !message) {
                console.error('❌ Usage: group send <name> <message>');
                process.exit(1);
            }

            const group = loadGroup(groupName);
            if (!group) {
                console.error(`❌ Group not found: ${groupName}`);
                process.exit(1);
            }

            console.log(`📤 Broadcasting to group "${groupName}" (${group.members.length} members)...\n`);

            const results = await Promise.all(
                group.members.map(m => sendToFriend(m, message, config))
            );

            for (const r of results) {
                if (r.success) {
                    console.log(`  ✅ ${r.friend} — delivered`);
                } else {
                    console.log(`  ❌ ${r.friend} — ${r.error}`);
                }
            }
            console.log('');
            break;
        }

        case 'add': {
            const groupName = args[1];
            const friendName = args[2];
            if (!groupName || !friendName) {
                console.error('❌ Usage: group add <group> <friend>');
                process.exit(1);
            }
            const group = loadGroup(groupName);
            if (!group) { console.error(`❌ Group not found: ${groupName}`); process.exit(1); }
            if (group.members.includes(friendName)) { console.log(`ℹ️ ${friendName} is already in ${groupName}`); return; }
            const f = loadFriend(friendName);
            if (!f || f.status !== 'paired') { console.error(`❌ ${friendName} is not a paired friend`); process.exit(1); }
            group.members.push(friendName);
            saveGroup(groupName, group);
            console.log(`✅ Added ${friendName} to group "${groupName}"`);
            break;
        }

        case 'remove': {
            const groupName = args[1];
            const friendName = args[2];
            if (!groupName || !friendName) {
                console.error('❌ Usage: group remove <group> <friend>');
                process.exit(1);
            }
            const group = loadGroup(groupName);
            if (!group) { console.error(`❌ Group not found: ${groupName}`); process.exit(1); }
            group.members = group.members.filter(m => m !== friendName);
            saveGroup(groupName, group);
            console.log(`✅ Removed ${friendName} from group "${groupName}"`);
            break;
        }

        case 'delete': {
            const groupName = args[1];
            if (!groupName) { console.error('❌ Usage: group delete <name>'); process.exit(1); }
            deleteGroup(groupName);
            console.log(`✅ Deleted group "${groupName}"`);
            break;
        }

        case 'info': {
            const groupName = args[1];
            if (!groupName) { console.error('❌ Usage: group info <name>'); process.exit(1); }
            const group = loadGroup(groupName);
            if (!group) { console.error(`❌ Group not found: ${groupName}`); process.exit(1); }
            console.log(`\n📌 Group: ${group.name}`);
            console.log(`   Created: ${group.created_at}`);
            console.log(`   Members: ${group.members.join(', ')}`);
            console.log('');
            break;
        }

        default:
            console.log(`
📌 Group Commands:
  /connect-group create <name> <f1> <f2>   Create a group
  /connect-group list                       List all groups
  /connect-group send <name> <message>      Broadcast to group
  /connect-group add <name> <friend>        Add member
  /connect-group remove <name> <friend>     Remove member
  /connect-group delete <name>              Delete group
  /connect-group info <name>                Show group info
`);
    }
}

main().catch(err => {
    console.error('❌ Group error:', err.message);
    process.exit(1);
});
