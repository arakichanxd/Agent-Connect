#!/usr/bin/env node
/**
 * Agent Connect - Main Entry Point
 * Routes all slash commands to their respective scripts
 * 
 * Usage:
 *   node index.js setup
 *   node index.js start
 *   node index.js stop
 *   node index.js add <name> <url>
 *   node index.js accept <name>
 *   node index.js remove <name>
 *   node index.js send <name> <message...>
 *   node index.js reply <name>
 *   node index.js friends
 *   node index.js status
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const SCRIPTS_DIR = path.join(__dirname, 'scripts');
const os = require('os');
const LOG_FILE = path.join(os.homedir(), '.openclaw', '.agent-connect.log');

// Parse command and args
const args = process.argv.slice(2);
const command = args[0]?.toLowerCase();
const commandArgs = args.slice(1);

// Help text
function showHelp() {
    console.log(`
🔌 Agent Connect - Commands

  /connect-setup              First-time setup (tunnel + config)
  /connect-start              Start webhook server
  /connect-stop               Stop webhook server

  /connect-add <name> <url>   Send friend pair request
  /connect-accept <name>      Accept a friend request
  /connect-cancel <name>      Cancel a pending request
  /connect-remove <name>      Remove a friend

  /connect-send <name> <msg>  Send a message (E2E encrypted)
  /connect-send-file <n> <f>  Send a file/image
  /connect-reply <name>       Auto-reply (internal)
  /connect-auto-chat          Auto-chat with online friends (auto mode)

  /connect-group <sub> [args]  Group messaging (create/send/list/add/remove/delete)

  /connect-friends            List all friends
  /connect-status             Show server + config status
  /connect-watchdog           Start server with auto-restart watchdog

Examples:
  node index.js setup
  node index.js start
  node index.js add maya https://maya-agent.example.com
  node index.js accept maya
  node index.js send maya Hey, how are you doing?
  node index.js friends
  node index.js status
`);
}

// Run a script in foreground (interactive, waits for exit)
function runScript(scriptName, scriptArgs = []) {
    const scriptPath = path.join(SCRIPTS_DIR, scriptName);

    const child = spawn('node', [scriptPath, ...scriptArgs], {
        stdio: 'inherit',
        cwd: __dirname,
    });

    child.on('error', (err) => {
        console.error(`❌ Failed to run ${scriptName}:`, err.message);
        process.exit(1);
    });

    child.on('exit', (code) => {
        process.exit(code || 0);
    });
}

// Run server as detached background process
function runBackground() {
    const scriptPath = path.join(SCRIPTS_DIR, 'server.js');

    // Ensure log directory exists
    const logDir = path.dirname(LOG_FILE);
    fs.mkdirSync(logDir, { recursive: true });

    // Open log file for stdout/stderr
    const logFd = fs.openSync(LOG_FILE, 'a');

    const child = spawn('node', [scriptPath], {
        cwd: __dirname,
        detached: true,
        stdio: ['ignore', logFd, logFd],  // stdin=ignore, stdout+stderr=logfile
    });

    child.unref();  // Allow parent to exit

    console.log(`🚀 Server starting in background (PID: ${child.pid})`);
    console.log(`   Logs: ${LOG_FILE}`);
    console.log(`   Stop: /connect-stop`);

    // Give server a moment to fail if port is busy
    setTimeout(() => {
        process.exit(0);
    }, 500);
}

// Main command handler
switch (command) {
    case 'setup':
        runScript('setup.js');
        break;

    case 'start':
    case 'server':
        runBackground();
        break;

    case 'stop':
        runScript('stop.js');
        break;

    case 'add':
    case 'add-friend':
        runScript('add-friend.js', commandArgs);
        break;

    case 'accept':
    case 'accept-friend':
        runScript('accept-friend.js', commandArgs);
        break;

    case 'cancel':
    case 'cancel-request':
        runScript('cancel-request.js', commandArgs);
        break;

    case 'remove':
    case 'remove-friend':
        runScript('remove-friend.js', commandArgs);
        break;

    case 'send':
    case 'message':
        runScript('send-message.js', commandArgs);
        break;

    case 'reply':
        runScript('reply.js', commandArgs);
        break;

    case 'auto-chat':
    case 'autochat':
        runScript('auto-chat.js', commandArgs);
        break;

    case 'send-file':
    case 'sendfile':
    case 'file':
        runScript('send-file.js', commandArgs);
        break;

    case 'group':
        runScript('group.js', commandArgs);
        break;

    case 'watchdog': {
        // Watchdog runs as a detached background process
        const wdPath = path.join(SCRIPTS_DIR, 'watchdog.js');
        const logDir = path.dirname(LOG_FILE);
        fs.mkdirSync(logDir, { recursive: true });
        const logFd = fs.openSync(LOG_FILE, 'a');
        const wd = spawn('node', [wdPath], {
            cwd: __dirname,
            detached: true,
            stdio: ['ignore', logFd, logFd],
        });
        wd.unref();
        console.log(`🐕 Watchdog started (PID: ${wd.pid})`);
        console.log(`   Server will auto-restart on crashes.`);
        console.log(`   Logs: ${LOG_FILE}`);
        setTimeout(() => process.exit(0), 500);
        break;
    }

    case 'friends':
    case 'list':
        runScript('friends-list.js');
        break;

    case 'status':
        runScript('status.js');
        break;

    case 'help':
    case '--help':
    case '-h':
    case undefined:
        showHelp();
        break;

    default:
        console.error(`❌ Unknown command: ${command}`);
        console.log('Run with --help to see available commands.');
        process.exit(1);
}
