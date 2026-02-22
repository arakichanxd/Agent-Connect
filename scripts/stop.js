#!/usr/bin/env node
/**
 * Agent Connect - Stop Server
 * Reads PID file and sends SIGTERM to the server process
 */

const fs = require('fs');
const { PID_FILE } = require('../lib/config');

function main() {
    if (!fs.existsSync(PID_FILE)) {
        console.log('⚠️  Server is not running (no PID file found)');
        process.exit(0);
    }

    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);

    if (isNaN(pid)) {
        console.error('❌ Invalid PID file');
        fs.unlinkSync(PID_FILE);
        process.exit(1);
    }

    try {
        // Check if process exists
        process.kill(pid, 0);

        // Send SIGTERM
        process.kill(pid, 'SIGTERM');
        console.log(`🛑 Sent stop signal to server (PID: ${pid})`);

        // Wait a moment then check if it stopped
        setTimeout(() => {
            try {
                process.kill(pid, 0);
                console.log('⚠️  Server still running. Force killing...');
                process.kill(pid, 'SIGKILL');
            } catch {
                // Process is gone — good
            }

            // Clean up PID file
            try { fs.unlinkSync(PID_FILE); } catch { }
            console.log('✅ Server stopped.');
        }, 2000);

    } catch (err) {
        if (err.code === 'ESRCH') {
            console.log(`⚠️  Process ${pid} not found (already stopped)`);
            fs.unlinkSync(PID_FILE);
        } else {
            console.error('❌ Error stopping server:', err.message);
        }
    }
}

main();
