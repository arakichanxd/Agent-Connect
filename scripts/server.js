#!/usr/bin/env node
/**
 * Agent Connect - Webhook Server
 * HTTP server that listens for friend messages, pair requests, and heartbeats
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { getConfig, loadFriend, saveFriend, PID_FILE, getFriendMemoryDir, appendToConversationLog, writeLatestContext } = require('../lib/config');
const { verifyBearerToken, checkRateLimit, checkPairRequestLimit } = require('../lib/auth');
const { startHeartbeat, stopHeartbeat, recordHeartbeat } = require('../lib/heartbeat');
const { decryptMessage } = require('../lib/crypto');
const { rotateIfNeeded } = require('../lib/log-rotate');
const telegram = require('../lib/telegram');

const startTime = Date.now();

/**
 * Parse JSON body from request
 */
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => {
            data += chunk;
            // Limit body size to 1MB
            if (data.length > 1024 * 1024) {
                reject(new Error('Body too large'));
            }
        });
        req.on('end', () => {
            try {
                resolve(data ? JSON.parse(data) : {});
            } catch {
                reject(new Error('Invalid JSON'));
            }
        });
        req.on('error', reject);
    });
}

/**
 * Send JSON response
 */
function sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

/**
 * Authenticate a request from a known friend
 */
function authenticateFriend(req, body) {
    const friendName = body.from;
    if (!friendName) return { error: 'Missing "from" field' };

    const friend = loadFriend(friendName);
    if (!friend) return { error: `Unknown agent: ${friendName}` };

    if (friend.status !== 'paired' && friend.status !== 'pending') {
        return { error: `Not paired with: ${friendName}` };
    }

    const authResult = verifyBearerToken(req.headers['authorization'], friend.token);
    if (!authResult.valid) return { error: authResult.error };

    return { friend };
}

// --- Route Handlers ---

/**
 * GET /health — Public health check
 */
function handleHealth(req, res) {
    const config = getConfig();
    sendJSON(res, 200, {
        status: 'ok',
        agent: config.agentName,
        uptime: Math.floor((Date.now() - startTime) / 1000),
        version: '2.0.0',
    });
}

/**
 * POST /pair-request — Receive a friend pair request
 */
async function handlePairRequest(req, res) {
    // Rate limit pair requests by IP to prevent spam
    const clientIP = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const pairLimitCheck = checkPairRequestLimit(clientIP);
    if (!pairLimitCheck.allowed) {
        return sendJSON(res, 429, { error: 'Too many pair requests. Try again later.' });
    }

    const body = await parseBody(req);
    const { from, token, webhook_url } = body;

    if (!from || !token || !webhook_url) {
        return sendJSON(res, 400, { error: 'Missing required fields: from, token, webhook_url' });
    }

    // Validate friend name
    const { isValidName } = require('../lib/config');
    if (!isValidName(from)) {
        return sendJSON(res, 400, { error: 'Invalid agent name. Use only letters, numbers, dash, underscore.' });
    }

    // Check if already friends
    const existing = loadFriend(from);
    if (existing && existing.status === 'paired') {
        return sendJSON(res, 409, { error: `Already paired with ${from}` });
    }

    // Save as pending friend
    saveFriend(from, {
        name: from,
        webhook_url,
        token,
        status: 'pending',
        paired_at: null,
        last_heartbeat: null,
        last_message_at: null,
        conversation_history: [],
    });

    console.log(`📨 Pair request from: ${from} (${webhook_url})`);
    console.log(`   To accept: node index.js accept ${from}`);

    // Write notification to this friend's memory
    const memDir = getFriendMemoryDir(from);
    const notifFile = path.join(memDir, 'pair-request.md');
    fs.writeFileSync(notifFile, [
        `# Friend Request from ${from}`,
        '',
        `**From:** ${from}`,
        `**URL:** ${webhook_url}`,
        `**Time:** ${new Date().toISOString()}`,
        '',
        `To accept: \`/connect-accept ${from}\``,
    ].join('\n'));

    // Notify Telegram
    telegram.notifyFriendRequest(from, webhook_url, getConfig().agentName);

    sendJSON(res, 200, { status: 'pending', message: `Pair request received from ${from}` });
}

/**
 * POST /pair-accept — Receive acceptance of our pair request
 */
async function handlePairAccept(req, res) {
    const body = await parseBody(req);
    const { from, webhook_url } = body;

    if (!from) {
        return sendJSON(res, 400, { error: 'Missing required field: from' });
    }

    const friend = loadFriend(from);
    if (!friend) {
        return sendJSON(res, 404, { error: `No pending request for: ${from}` });
    }

    // Verify the token matches
    const authResult = verifyBearerToken(req.headers['authorization'], friend.token);
    if (!authResult.valid) {
        return sendJSON(res, 401, { error: authResult.error });
    }

    // Update friend status to paired
    friend.status = 'paired';
    friend.paired_at = new Date().toISOString();
    if (webhook_url) friend.webhook_url = webhook_url;
    saveFriend(from, friend);

    console.log(`✅ Paired with: ${from}`);

    sendJSON(res, 200, { status: 'paired', message: `Now paired with ${from}` });
}

/**
 * POST /message — Receive a message from a friend
 */
async function handleMessage(req, res) {
    const body = await parseBody(req);
    const auth = authenticateFriend(req, body);

    if (auth.error) {
        return sendJSON(res, 401, { error: auth.error });
    }

    const { friend } = auth;
    const { from, timestamp } = body;
    let { message } = body;

    if (!message) {
        return sendJSON(res, 400, { error: 'Missing "message" field' });
    }

    // Rate limit check
    const rateCheck = checkRateLimit(from);
    if (!rateCheck.allowed) {
        return sendJSON(res, 429, { error: 'Rate limit exceeded', retryAfterMs: 60000 });
    }

    // Decrypt if encrypted
    let plaintext = message;
    let isFileMessage = body.message_type === 'file';
    if (body.encrypted) {
        const decrypted = decryptMessage(message, friend.token);
        if (decrypted === null) {
            return sendJSON(res, 400, { error: 'Decryption failed — message tampered or wrong key' });
        }
        plaintext = decrypted;
    }

    // Handle file messages
    if (isFileMessage) {
        try {
            const fileData = JSON.parse(plaintext);
            const filesDir = path.join(getFriendMemoryDir(from), 'files');
            fs.mkdirSync(filesDir, { recursive: true });
            const filePath = path.join(filesDir, fileData.filename);
            fs.writeFileSync(filePath, Buffer.from(fileData.data, 'base64'));
            plaintext = `[FILE: ${fileData.filename} (${(fileData.size / 1024).toFixed(1)}KB)]${fileData.caption ? ' ' + fileData.caption : ''}`;
            console.log(`📎 [${from}] sent file: ${fileData.filename} → saved to memory/${from}/files/`);
            // Telegram: file received
            telegram.notifyFileReceived(from, fileData.filename, (fileData.size / 1024).toFixed(1), getConfig().agentName);
        } catch {
            console.log(`⚠️  Could not process file from ${from}`);
        }
    } else {
        console.log(`💬 [${from}]: ${plaintext}`);
        // Telegram: incoming message
        telegram.notifyIncomingMessage(from, plaintext, getConfig().agentName);
    }

    // Save to conversation history (in friend config)
    friend.conversation_history = friend.conversation_history || [];
    friend.conversation_history.push({
        from,
        message: plaintext,
        timestamp: timestamp || new Date().toISOString(),
        direction: 'incoming',
    });

    // Keep last 100 messages in config
    if (friend.conversation_history.length > 100) {
        friend.conversation_history = friend.conversation_history.slice(-100);
    }

    friend.last_message_at = new Date().toISOString();
    saveFriend(from, friend);

    // Write to this friend's memory (separate from main agent memory)
    appendToConversationLog(from, from, plaintext, 'incoming');

    // Check friend mode for reply behavior
    const config = getConfig();
    const { getRecentExchangeCount } = require('../lib/config');
    const recentExchanges = getRecentExchangeCount(from, config.cooldownMinutes);
    const overCooldown = recentExchanges >= config.maxExchangesPerConvo;

    // Build context for LLM
    const modeNote = config.friendMode === 'auto'
        ? (overCooldown
            ? `⏸️ COOLDOWN: ${recentExchanges} exchanges in the last ${config.cooldownMinutes}min. Wind down the conversation naturally.`
            : `🤖 AUTO MODE: Reply naturally and send with /connect-send ${from} <reply>`)
        : `👤 MANUAL MODE: Ask your master how to respond.`;

    const contextData = [
        `# Message from ${from}`,
        '',
        `**From:** ${from}`,
        `**Time:** ${new Date().toISOString()}`,
        `**Mode:** ${config.friendMode} | Exchanges: ${recentExchanges}/${config.maxExchangesPerConvo}`,
        '',
        `## Latest Message`,
        '',
        plaintext,
        '',
        `## Recent Conversation`,
        '',
        ...friend.conversation_history.slice(-10).map(m =>
            `- **${m.from}** (${m.timestamp}): ${m.message}`
        ),
        '',
        `---`,
        modeNote,
    ].join('\n');
    writeLatestContext(from, contextData);

    // Mode-aware reply behavior
    if (config.friendMode === 'auto' && !overCooldown) {
        // Auto mode: trigger immediate reply
        console.log(`🤖 Auto-replying to ${from}...`);
        try {
            const { execSync } = require('child_process');
            const skillDir = path.join(__dirname, '..');
            execSync(`node "${path.join(skillDir, 'index.js')}" reply ${from}`, {
                stdio: 'inherit',
                timeout: 30000,
            });
        } catch (err) {
            console.log(`⚠️  Auto-reply trigger failed: ${err.message}`);
        }
    } else if (config.friendMode === 'auto' && overCooldown) {
        // Auto mode but cooldown hit — wind down
        console.log(`⏸️ Cooldown: ${recentExchanges} exchanges with ${from}. Pausing auto-replies.`);
    } else {
        // Manual mode: just notify, don't auto-reply
        console.log(`📩 Message from ${from} saved. Ask your master: /connect-reply ${from}`);
    }

    sendJSON(res, 200, {
        status: 'delivered',
        message: 'Message received',
        remaining: rateCheck.remaining,
    });
}

/**
 * POST /heartbeat — Receive heartbeat from a friend
 */
async function handleHeartbeat(req, res) {
    const body = await parseBody(req);
    const { from } = body;

    if (!from) {
        return sendJSON(res, 400, { error: 'Missing "from" field' });
    }

    const friend = loadFriend(from);
    if (!friend || friend.status !== 'paired') {
        return sendJSON(res, 401, { error: 'Not paired' });
    }

    // Verify token
    const authResult = verifyBearerToken(req.headers['authorization'], friend.token);
    if (!authResult.valid) {
        return sendJSON(res, 401, { error: authResult.error });
    }

    recordHeartbeat(from);

    sendJSON(res, 200, { status: 'ok' });
}

// --- Server ---

function startServer() {
    // Rotate logs if needed (before we start writing to them)
    rotateIfNeeded();

    const config = getConfig();
    const port = config.port;

    // Initialize Telegram notifications
    if (config.telegramBotToken && config.telegramChannelId) {
        telegram.initTelegram(config.telegramBotToken, config.telegramChannelId);
    }

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, `http://localhost:${port}`);
        const route = url.pathname;
        const clientIP = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        try {
            // Security headers
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');
            res.setHeader('Cache-Control', 'no-store');  // Never cache responses (contains tokens)
            res.setHeader('Content-Type', 'application/json');

            // Block non-POST/GET methods
            if (req.method !== 'GET' && req.method !== 'POST') {
                return sendJSON(res, 405, { error: 'Method not allowed' });
            }

            if (req.method === 'GET' && route === '/health') {
                return handleHealth(req, res);
            }

            if (req.method === 'POST') {
                // Validate content type for POST requests
                const contentType = req.headers['content-type'] || '';
                if (!contentType.includes('application/json')) {
                    return sendJSON(res, 415, { error: 'Content-Type must be application/json' });
                }

                switch (route) {
                    case '/pair-request': return await handlePairRequest(req, res);
                    case '/pair-accept': return await handlePairAccept(req, res);
                    case '/message': return await handleMessage(req, res);
                    case '/heartbeat': return await handleHeartbeat(req, res);
                }
            }

            sendJSON(res, 404, { error: 'Not found' });
        } catch (err) {
            console.error(`❌ Error handling ${route}:`, err.message);
            sendJSON(res, 500, { error: 'Internal server error' });
        }
    });

    server.listen(port, '0.0.0.0', () => {
        console.log(`\n🚀 Agent Connect server started!`);
        console.log(`   Agent: ${config.agentName}`);
        console.log(`   Local: http://localhost:${port}`);
        if (config.tunnelUrl) {
            console.log(`   Tunnel: ${config.tunnelUrl}`);
        }
        if (telegram.isTelegramEnabled()) {
            console.log(`   Telegram: notifications enabled`);
        }
        console.log(`   Health: http://localhost:${port}/health`);
        console.log('');

        // Write PID file
        fs.writeFileSync(PID_FILE, process.pid.toString());

        // Start heartbeat
        startHeartbeat(config.agentName);

        // Notify Telegram
        telegram.notifyServerStatus('started', config.agentName);
    });

    // Graceful shutdown
    const shutdown = (signal) => {
        console.log(`\n🛑 ${signal} received. Shutting down...`);
        telegram.notifyServerStatus('stopped', config.agentName);
        stopHeartbeat();
        server.close(() => {
            // Clean up PID file
            try { fs.unlinkSync(PID_FILE); } catch { }
            console.log('✅ Server stopped.');
            process.exit(0);
        });
        // Force exit after 5s
        setTimeout(() => process.exit(1), 5000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`❌ Port ${port} is already in use!`);
            console.error('   Change CONNECT_PORT in ~/.openclaw/.agent-connect.env');
        } else {
            console.error('❌ Server error:', err.message);
        }
        process.exit(1);
    });
}

// Run if called directly
if (require.main === module) {
    startServer();
}

module.exports = { startServer };
