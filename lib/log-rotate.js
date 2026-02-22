#!/usr/bin/env node
/**
 * Agent Connect - Log Rotation
 * Rotates the server log file when it exceeds MAX_LOG_SIZE.
 * Keeps up to MAX_LOG_FILES rotated copies.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const LOG_FILE = path.join(os.homedir(), '.openclaw', '.agent-connect.log');
const MAX_LOG_SIZE = 5 * 1024 * 1024;  // 5MB
const MAX_LOG_FILES = 3;

/**
 * Check if log needs rotation and rotate if needed.
 * Called on server start.
 */
function rotateIfNeeded() {
    if (!fs.existsSync(LOG_FILE)) return;

    const stats = fs.statSync(LOG_FILE);
    if (stats.size < MAX_LOG_SIZE) return;

    // Rotate: .log.3 → delete, .log.2 → .log.3, .log.1 → .log.2, .log → .log.1
    for (let i = MAX_LOG_FILES; i >= 1; i--) {
        const from = i === 1 ? LOG_FILE : `${LOG_FILE}.${i - 1}`;
        const to = `${LOG_FILE}.${i}`;

        if (i === MAX_LOG_FILES) {
            // Delete oldest
            try { fs.unlinkSync(to); } catch { }
        }

        if (fs.existsSync(from)) {
            try { fs.renameSync(from, to); } catch { }
        }
    }

    // Create fresh log
    fs.writeFileSync(LOG_FILE, `--- Log rotated at ${new Date().toISOString()} ---\n`);
}

/**
 * Get total log size across all rotated files
 */
function getLogSize() {
    let total = 0;
    try {
        if (fs.existsSync(LOG_FILE)) total += fs.statSync(LOG_FILE).size;
        for (let i = 1; i <= MAX_LOG_FILES; i++) {
            const f = `${LOG_FILE}.${i}`;
            if (fs.existsSync(f)) total += fs.statSync(f).size;
        }
    } catch { }
    return total;
}

module.exports = {
    rotateIfNeeded,
    getLogSize,
    LOG_FILE,
    MAX_LOG_SIZE,
};
