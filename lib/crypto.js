#!/usr/bin/env node
/**
 * Agent Connect - End-to-End Encryption
 * AES-256-GCM encryption using the shared friend token as key material.
 * Messages are encrypted before sending, decrypted on receive.
 * The Cloudflare tunnel provides transport encryption; this adds E2E.
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;  // GCM recommended IV size
const TAG_LENGTH = 16; // Auth tag length

/**
 * Derive a 256-bit encryption key from the shared friend token.
 * Uses HKDF-like derivation via SHA-256 to get consistent key length.
 */
function deriveKey(token) {
    return crypto.createHash('sha256').update(token).digest();
}

/**
 * Encrypt a message string.
 * Returns: base64 string of (IV + ciphertext + authTag)
 */
function encryptMessage(plaintext, token) {
    const key = deriveKey(token);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const tag = cipher.getAuthTag();

    // Pack: IV (12) + encrypted + tag (16)
    const packed = Buffer.concat([iv, encrypted, tag]);
    return packed.toString('base64');
}

/**
 * Decrypt a message.
 * Input: base64 string from encryptMessage()
 * Returns: plaintext string, or null if decryption fails
 */
function decryptMessage(encryptedBase64, token) {
    try {
        const key = deriveKey(token);
        const packed = Buffer.from(encryptedBase64, 'base64');

        // Unpack: IV (12) + encrypted + tag (16)
        const iv = packed.subarray(0, IV_LENGTH);
        const tag = packed.subarray(packed.length - TAG_LENGTH);
        const encrypted = packed.subarray(IV_LENGTH, packed.length - TAG_LENGTH);

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);

        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        return decrypted.toString('utf8');
    } catch {
        return null;  // Tampered or wrong key
    }
}

/**
 * Check if a message appears to be encrypted (base64-encoded, long enough)
 */
function isEncrypted(message) {
    if (!message || message.length < 40) return false;
    try {
        const buf = Buffer.from(message, 'base64');
        return buf.length >= IV_LENGTH + TAG_LENGTH + 1;
    } catch {
        return false;
    }
}

module.exports = {
    encryptMessage,
    decryptMessage,
    isEncrypted,
};
