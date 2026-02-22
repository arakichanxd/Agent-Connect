#!/usr/bin/env node
/**
 * Agent Connect - Authentication
 * Bearer token generation, verification, and rate limiting
 */

const crypto = require('crypto');

/**
 * Generate a cryptographically secure pair token
 * Returns a 64-character hex string
 */
function generatePairToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Verify a bearer token from request headers
 * Returns { valid: boolean, error?: string }
 */
function verifyBearerToken(authHeader, expectedToken) {
    if (!authHeader) {
        return { valid: false, error: 'Missing Authorization header' };
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return { valid: false, error: 'Invalid Authorization format. Expected: Bearer <token>' };
    }

    const token = parts[1];
    if (!token || token.length < 20) {
        return { valid: false, error: 'Token too short' };
    }

    // Constant-time comparison to prevent timing attacks
    const expected = Buffer.from(expectedToken, 'utf8');
    const received = Buffer.from(token, 'utf8');

    if (expected.length !== received.length) {
        return { valid: false, error: 'Invalid token' };
    }

    if (!crypto.timingSafeEqual(expected, received)) {
        return { valid: false, error: 'Invalid token' };
    }

    return { valid: true };
}

// --- Rate Limiting ---

// In-memory rate limit store: { friendName: { count, windowStart } }
const rateLimits = {};
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10; // max requests per window

/**
 * Check rate limit for a friend
 * Returns { allowed: boolean, remaining: number }
 */
function checkRateLimit(friendName) {
    const now = Date.now();
    const entry = rateLimits[friendName];

    if (!entry || (now - entry.windowStart) > RATE_LIMIT_WINDOW_MS) {
        // New window
        rateLimits[friendName] = { count: 1, windowStart: now };
        return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
    }

    if (entry.count >= RATE_LIMIT_MAX) {
        return { allowed: false, remaining: 0 };
    }

    entry.count++;
    return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count };
}

/**
 * Reset rate limit for a friend (useful for testing)
 */
function resetRateLimit(friendName) {
    delete rateLimits[friendName];
}

// --- Pair Request Rate Limiting ---
// Global rate limiter for incoming pair requests (prevent spam)
const pairRequestLimits = {};
const PAIR_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const PAIR_LIMIT_MAX = 5; // max pair requests per window

/**
 * Check pair request rate limit (by IP or identifier)
 */
function checkPairRequestLimit(identifier) {
    const now = Date.now();
    const entry = pairRequestLimits[identifier];

    if (!entry || (now - entry.windowStart) > PAIR_LIMIT_WINDOW_MS) {
        pairRequestLimits[identifier] = { count: 1, windowStart: now };
        return { allowed: true };
    }

    if (entry.count >= PAIR_LIMIT_MAX) {
        return { allowed: false };
    }

    entry.count++;
    return { allowed: true };
}

module.exports = {
    generatePairToken,
    verifyBearerToken,
    checkRateLimit,
    resetRateLimit,
    checkPairRequestLimit,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS,
};
