#!/usr/bin/env node
/**
 * Agent Connect - Watchdog
 * Keeps the server running — restarts it if it crashes.
 * Uses exponential backoff to avoid rapid restart loops.
 * 
 * Usage: node watchdog.js
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SERVER_SCRIPT = path.join(__dirname, 'server.js');
const SKILL_DIR = path.join(__dirname, '..');
const PID_FILE = path.join(os.homedir(), '.openclaw', '.agent-connect-watchdog.pid');
const LOG_FILE = path.join(os.homedir(), '.openclaw', '.agent-connect.log');

const MIN_RESTART_DELAY = 1000;    // 1 second
const MAX_RESTART_DELAY = 60000;   // 1 minute
const RESET_AFTER_MS = 300000;     // Reset backoff after 5 min of stable running

let restartDelay = MIN_RESTART_DELAY;
let restartCount = 0;

function log(msg) {
    const line = `[watchdog ${new Date().toISOString()}] ${msg}\n`;
    process.stdout.write(line);
    try {
        fs.appendFileSync(LOG_FILE, line);
    } catch { }
}

function startServer() {
    log(`Starting server (attempt #${restartCount + 1})...`);

    const logFd = fs.openSync(LOG_FILE, 'a');
    const child = spawn('node', [SERVER_SCRIPT], {
        cwd: SKILL_DIR,
        stdio: ['ignore', logFd, logFd],
    });

    const startedAt = Date.now();

    child.on('exit', (code, signal) => {
        const runtime = Math.floor((Date.now() - startedAt) / 1000);
        log(`Server exited (code: ${code}, signal: ${signal}) after ${runtime}s`);

        // If it ran for a while, reset the backoff
        if (Date.now() - startedAt > RESET_AFTER_MS) {
            restartDelay = MIN_RESTART_DELAY;
            restartCount = 0;
        }

        restartCount++;

        // Exponential backoff
        log(`Restarting in ${restartDelay / 1000}s...`);
        setTimeout(() => {
            startServer();
        }, restartDelay);

        restartDelay = Math.min(restartDelay * 2, MAX_RESTART_DELAY);
    });

    child.on('error', (err) => {
        log(`Failed to start server: ${err.message}`);
    });
}

// Write watchdog PID
fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
fs.writeFileSync(PID_FILE, process.pid.toString());

// Graceful shutdown
process.on('SIGTERM', () => {
    log('Watchdog stopping...');
    try { fs.unlinkSync(PID_FILE); } catch { }
    process.exit(0);
});
process.on('SIGINT', () => {
    log('Watchdog stopping (SIGINT)...');
    try { fs.unlinkSync(PID_FILE); } catch { }
    process.exit(0);
});

log('Watchdog started');
startServer();
