#!/usr/bin/env node
/**
 * Agent Connect - Status
 * Shows server status, tunnel status, and configuration
 */

const fs = require('fs');
const { getConfig, isConfigured, listFriends, PID_FILE } = require('../lib/config');
const { isCloudflaredInstalled, getCloudflaredVersion, isTunnelRunning } = require('../lib/tunnel');
const { isOnline } = require('../lib/heartbeat');

function main() {
    const config = getConfig();

    console.log('\n📊 Agent Connect Status\n');

    // Configuration
    if (!isConfigured()) {
        console.log('⚠️  Not configured! Run: /connect-setup');
        return;
    }

    console.log(`✅ Configured`);
    console.log(`   Agent: ${config.agentName}`);
    console.log(`   Port:  ${config.port}`);
    console.log(`   Tunnel: ${config.tunnelUrl || 'not set'}`);
    console.log('');

    // Server status
    console.log('🖥️  Server:');
    if (fs.existsSync(PID_FILE)) {
        const pid = fs.readFileSync(PID_FILE, 'utf8').trim();
        try {
            process.kill(parseInt(pid, 10), 0);
            console.log(`   ✅ Running (PID: ${pid})`);
        } catch {
            console.log(`   ⚠️  PID file exists but process not found`);
        }
    } else {
        console.log('   🔴 Not running');
        console.log('   Start with: /connect-start');
    }
    console.log('');

    // Cloudflare tunnel
    console.log('🌐 Cloudflare Tunnel:');
    if (isCloudflaredInstalled()) {
        const version = getCloudflaredVersion();
        console.log(`   ✅ cloudflared: ${version}`);
        const running = isTunnelRunning();
        console.log(`   ${running ? '✅' : '🔴'} Tunnel: ${running ? 'running' : 'not running'}`);
    } else {
        console.log('   ⚠️  cloudflared not installed');
        console.log('   Run: /connect-setup');
    }
    console.log('');

    // Friends
    const friends = listFriends();
    const paired = friends.filter(f => f.status === 'paired');
    const pending = friends.filter(f => f.status === 'pending');
    const onlineCount = paired.filter(f => isOnline(f)).length;

    console.log(`👥 Friends: ${friends.length} total`);
    console.log(`   ✅ Paired: ${paired.length}`);
    console.log(`   ⏳ Pending: ${pending.length}`);
    console.log(`   🟢 Online: ${onlineCount}`);
    console.log('');

    // Quick commands
    console.log('💡 Commands:');
    console.log('   /connect-start          Start server');
    console.log('   /connect-stop           Stop server');
    console.log('   /connect-add <n> <url>  Add friend');
    console.log('   /connect-friends        List friends');
    console.log('   /connect-send <n> <msg> Send message');
}

main();
