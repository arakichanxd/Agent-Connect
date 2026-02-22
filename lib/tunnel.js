#!/usr/bin/env node
/**
 * Agent Connect - Cloudflare Tunnel Manager
 * Installs cloudflared and manages tunnel lifecycle
 */

const { execSync } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

/**
 * Detect the current platform
 * Returns: 'windows' | 'macos' | 'linux-deb' | 'linux-rpm' | 'unknown'
 */
function detectPlatform() {
    const platform = os.platform();

    if (platform === 'win32') return 'windows';
    if (platform === 'darwin') return 'macos';

    if (platform === 'linux') {
        // Check for package manager
        try {
            execSync('which dpkg', { stdio: 'pipe' });
            return 'linux-deb';
        } catch { }
        try {
            execSync('which rpm', { stdio: 'pipe' });
            return 'linux-rpm';
        } catch { }
        return 'linux-deb'; // fallback to deb
    }

    return 'unknown';
}

/**
 * Check if cloudflared is installed
 */
function isCloudflaredInstalled() {
    try {
        execSync('cloudflared --version', { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

/**
 * Get cloudflared version string
 */
function getCloudflaredVersion() {
    try {
        const output = execSync('cloudflared --version', { stdio: 'pipe', encoding: 'utf8' });
        return output.trim();
    } catch {
        return null;
    }
}

/**
 * Install cloudflared based on platform
 * Returns: { success: boolean, message: string }
 */
function installCloudflared() {
    const platform = detectPlatform();
    console.log(`📦 Installing cloudflared for ${platform}...`);

    try {
        switch (platform) {
            case 'windows':
                execSync('winget install --id Cloudflare.cloudflared --accept-package-agreements --accept-source-agreements', {
                    stdio: 'inherit',
                });
                break;

            case 'macos':
                execSync('brew install cloudflare/cloudflare/cloudflared', {
                    stdio: 'inherit',
                });
                break;

            case 'linux-deb': {
                // Download latest from GitHub releases
                const arch = os.arch() === 'x64' ? 'amd64' : os.arch() === 'arm64' ? 'arm64' : 'amd64';
                const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}.deb`;
                const tmpFile = '/tmp/cloudflared.deb';
                execSync(`curl -fsSL -o ${tmpFile} ${url}`, { stdio: 'inherit' });
                execSync(`sudo dpkg -i ${tmpFile}`, { stdio: 'inherit' });
                fs.unlinkSync(tmpFile);
                break;
            }

            case 'linux-rpm': {
                const arch = os.arch() === 'x64' ? 'amd64' : os.arch() === 'arm64' ? 'arm64' : 'amd64';
                const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}.rpm`;
                const tmpFile = '/tmp/cloudflared.rpm';
                execSync(`curl -fsSL -o ${tmpFile} ${url}`, { stdio: 'inherit' });
                execSync(`sudo rpm -i ${tmpFile}`, { stdio: 'inherit' });
                fs.unlinkSync(tmpFile);
                break;
            }

            default:
                return {
                    success: false,
                    message: `Unsupported platform: ${platform}. Please install cloudflared manually: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/`,
                };
        }

        // Verify installation
        if (isCloudflaredInstalled()) {
            const version = getCloudflaredVersion();
            return { success: true, message: `✅ cloudflared installed: ${version}` };
        } else {
            return { success: false, message: '❌ Installation seemed to succeed but cloudflared not found in PATH' };
        }
    } catch (err) {
        return {
            success: false,
            message: `❌ Failed to install cloudflared: ${err.message}\n\nPlease install manually: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/`,
        };
    }
}

/**
 * Install cloudflared as a service with the given tunnel token
 * This registers the tunnel connector so it auto-starts on boot
 */
function installTunnelService(token) {
    try {
        console.log('🔧 Installing cloudflared tunnel service...');

        const platform = detectPlatform();
        if (platform === 'windows') {
            // On Windows, cloudflared service install needs admin
            execSync(`cloudflared service install ${token}`, { stdio: 'inherit' });
        } else {
            execSync(`sudo cloudflared service install ${token}`, { stdio: 'inherit' });
        }

        return { success: true, message: '✅ Tunnel service installed and running' };
    } catch (err) {
        // If service already exists, try uninstall + reinstall
        if (err.message.includes('already exists') || err.message.includes('already installed')) {
            try {
                console.log('⚠️  Service already exists, reinstalling...');
                const platform = detectPlatform();
                if (platform === 'windows') {
                    execSync('cloudflared service uninstall', { stdio: 'inherit' });
                    execSync(`cloudflared service install ${token}`, { stdio: 'inherit' });
                } else {
                    execSync('sudo cloudflared service uninstall', { stdio: 'inherit' });
                    execSync(`sudo cloudflared service install ${token}`, { stdio: 'inherit' });
                }
                return { success: true, message: '✅ Tunnel service reinstalled and running' };
            } catch (retryErr) {
                return { success: false, message: `❌ Failed to reinstall service: ${retryErr.message}` };
            }
        }
        return { success: false, message: `❌ Failed to install tunnel service: ${err.message}` };
    }
}

/**
 * Check if the tunnel is running and healthy
 */
function isTunnelRunning() {
    try {
        const platform = detectPlatform();
        if (platform === 'windows') {
            const output = execSync('sc query cloudflared', { stdio: 'pipe', encoding: 'utf8' });
            return output.includes('RUNNING');
        } else {
            execSync('systemctl is-active cloudflared', { stdio: 'pipe' });
            return true;
        }
    } catch {
        return false;
    }
}

/**
 * Validate tunnel token format (should start with eyJ = base64 JSON)
 */
function isValidTunnelToken(token) {
    if (!token || token.length < 50) return false;
    return token.startsWith('eyJ');
}

module.exports = {
    detectPlatform,
    isCloudflaredInstalled,
    getCloudflaredVersion,
    installCloudflared,
    installTunnelService,
    isTunnelRunning,
    isValidTunnelToken,
};
