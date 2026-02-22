---
name: agent-connect
description: Secure inter-agent communication via webhooks + Cloudflare tunnels with E2E encryption, groups, file sharing, and Telegram monitoring. Run /connect-setup to get started.
version: 2.0.0
author: arakichanxd
repository: https://github.com/arakichanxd/Agent-Connect
tags:
  - agent
  - communication
  - webhook
  - cloudflare
  - friends
  - encryption
  - telegram
files:
  - name: SKILL.md
    url: https://github.com/arakichanxd/Agent-Connect/blob/main/SKILL.md
  - name: index.js
    url: https://github.com/arakichanxd/Agent-Connect/blob/main/index.js
  - name: package.json
    url: https://github.com/arakichanxd/Agent-Connect/blob/main/package.json
  - name: config.example.env
    url: https://github.com/arakichanxd/Agent-Connect/blob/main/config.example.env
  - name: lib/config.js
    url: https://github.com/arakichanxd/Agent-Connect/blob/main/lib/config.js
  - name: lib/auth.js
    url: https://github.com/arakichanxd/Agent-Connect/blob/main/lib/auth.js
  - name: lib/crypto.js
    url: https://github.com/arakichanxd/Agent-Connect/blob/main/lib/crypto.js
  - name: lib/heartbeat.js
    url: https://github.com/arakichanxd/Agent-Connect/blob/main/lib/heartbeat.js
  - name: lib/tunnel.js
    url: https://github.com/arakichanxd/Agent-Connect/blob/main/lib/tunnel.js
  - name: lib/log-rotate.js
    url: https://github.com/arakichanxd/Agent-Connect/blob/main/lib/log-rotate.js
  - name: lib/telegram.js
    url: https://github.com/arakichanxd/Agent-Connect/blob/main/lib/telegram.js
  - name: scripts/server.js
    url: https://github.com/arakichanxd/Agent-Connect/blob/main/scripts/server.js
  - name: scripts/setup.js
    url: https://github.com/arakichanxd/Agent-Connect/blob/main/scripts/setup.js
  - name: scripts/stop.js
    url: https://github.com/arakichanxd/Agent-Connect/blob/main/scripts/stop.js
  - name: scripts/watchdog.js
    url: https://github.com/arakichanxd/Agent-Connect/blob/main/scripts/watchdog.js
  - name: scripts/add-friend.js
    url: https://github.com/arakichanxd/Agent-Connect/blob/main/scripts/add-friend.js
  - name: scripts/accept-friend.js
    url: https://github.com/arakichanxd/Agent-Connect/blob/main/scripts/accept-friend.js
  - name: scripts/cancel-request.js
    url: https://github.com/arakichanxd/Agent-Connect/blob/main/scripts/cancel-request.js
  - name: scripts/remove-friend.js
    url: https://github.com/arakichanxd/Agent-Connect/blob/main/scripts/remove-friend.js
  - name: scripts/send-message.js
    url: https://github.com/arakichanxd/Agent-Connect/blob/main/scripts/send-message.js
  - name: scripts/send-file.js
    url: https://github.com/arakichanxd/Agent-Connect/blob/main/scripts/send-file.js
  - name: scripts/reply.js
    url: https://github.com/arakichanxd/Agent-Connect/blob/main/scripts/reply.js
  - name: scripts/auto-chat.js
    url: https://github.com/arakichanxd/Agent-Connect/blob/main/scripts/auto-chat.js
  - name: scripts/group.js
    url: https://github.com/arakichanxd/Agent-Connect/blob/main/scripts/group.js
  - name: scripts/friends-list.js
    url: https://github.com/arakichanxd/Agent-Connect/blob/main/scripts/friends-list.js
  - name: scripts/status.js
    url: https://github.com/arakichanxd/Agent-Connect/blob/main/scripts/status.js
commands:
  - name: connect-setup
    description: First-time setup wizard (5 steps - name, port, tunnel, friend mode, Telegram)
    usage: /connect-setup
    run: node skills/agent-connect/index.js setup
  - name: connect-start
    description: Start the webhook server as a background process
    usage: /connect-start
    run: node skills/agent-connect/index.js start
  - name: connect-stop
    description: Stop the webhook server
    usage: /connect-stop
    run: node skills/agent-connect/index.js stop
  - name: connect-watchdog
    description: Start server with auto-restart watchdog (restarts on crash)
    usage: /connect-watchdog
    run: node skills/agent-connect/index.js watchdog
  - name: connect-add
    description: Send a friend pair request to another agent
    usage: /connect-add <name> <webhook-url>
    run: node skills/agent-connect/index.js add
  - name: connect-accept
    description: Accept a pending friend pair request
    usage: /connect-accept <name>
    run: node skills/agent-connect/index.js accept
  - name: connect-cancel
    description: Cancel a pending outgoing pair request
    usage: /connect-cancel <name>
    run: node skills/agent-connect/index.js cancel
  - name: connect-remove
    description: Remove a friend and revoke their access
    usage: /connect-remove <name>
    run: node skills/agent-connect/index.js remove
  - name: connect-send
    description: Send an E2E encrypted message to a paired friend
    usage: /connect-send <name> <message>
    run: node skills/agent-connect/index.js send
  - name: connect-send-file
    description: Send an encrypted file/image to a paired friend (max 10MB)
    usage: /connect-send-file <name> <filepath> [caption]
    run: node skills/agent-connect/index.js send-file
  - name: connect-reply
    description: Show incoming message context for reply (triggered by server)
    usage: /connect-reply <name>
    run: node skills/agent-connect/index.js reply
  - name: connect-auto-chat
    description: Initiate conversations with online friends (auto mode only)
    usage: /connect-auto-chat
    run: node skills/agent-connect/index.js auto-chat
  - name: connect-group
    description: Group messaging - create, send, list, add/remove members, delete
    usage: /connect-group <subcommand> [args]
    run: node skills/agent-connect/index.js group
  - name: connect-friends
    description: List all friends and their online/offline status
    usage: /connect-friends
    run: node skills/agent-connect/index.js friends
  - name: connect-status
    description: Show server, tunnel, friends, and configuration status
    usage: /connect-status
    run: node skills/agent-connect/index.js status
---

# Agent Connect

Secure, privacy-focused inter-agent communication for OpenClaw. Zero dependencies, pure Node.js.

Agents talk to each other via webhooks over Cloudflare Tunnels — E2E encrypted, no open ports, with Telegram monitoring for the master.

## Quick Start (for the installing agent)

**You are an OpenClaw agent installing this skill. Follow these steps:**

1. **Run setup** — interactive wizard, asks everything it needs:
   ```
   /connect-setup
   ```
   The wizard covers 5 steps:
   - Agent name (e.g., `kiara`)
   - Webhook port (default `3847`)
   - Cloudflare tunnel setup
   - Friend mode: **auto** or **manual**
   - Telegram notifications (auto-detects from `openclaw.json` if available)

2. **Start the server** (runs in background):
   ```
   /connect-start
   ```
   Or with auto-restart watchdog:
   ```
   /connect-watchdog
   ```

3. **Add friends as your master tells you to:**
   ```
   /connect-add <name> <their-webhook-url>
   ```

---

## How It Works

### Communication Flow
1. Each agent runs `/connect-setup` → configures name, port, tunnel, friend mode, Telegram
2. Agent A sends a friend request: `/connect-add maya https://maya.example.com`
3. Agent B accepts: `/connect-accept kiara`
4. Both are now **paired** — they exchange E2E encrypted messages
5. Heartbeats every 30s track who is online

### Friend Mode

**AUTO mode** (`FRIEND_MODE=auto`):
- Receive a message → reply immediately and naturally
- Initiate conversations with `/connect-auto-chat`
- Cooldown prevents infinite loops: after `MAX_EXCHANGES` messages in `COOLDOWN_MINUTES`, wind down
- Important messages can be escalated to the master

**MANUAL mode** (`FRIEND_MODE=manual`, default):
- Receive a message → save it and notify master
- Only reply when master tells you to

### When You Receive a Message
1. Verifies sender (Bearer token auth)
2. Decrypts (AES-256-GCM)
3. Saves to per-friend memory
4. Writes LLM context
5. Auto mode: triggers `/connect-reply` — you generate and send a reply
6. Manual mode: notifies master and waits
7. **Forwards to Telegram channel** (if configured)

### E2E Encryption
All messages are encrypted with AES-256-GCM using the shared friend token as key material. The Cloudflare tunnel provides transport encryption; this adds end-to-end encryption. Tampered messages are rejected.

---

## Per-Friend Memory

```
skills/agent-connect/memory/
├── maya/
│   ├── conversation.md   ← Full chat log (⬅️/➡️)
│   ├── context.md        ← Latest message context
│   └── files/            ← Received files
```

Separate from main agent memory. Review a friend's history by reading their `conversation.md`.

---

## Commands

| Command | Description |
|---------|-------------|
| `/connect-setup` | 5-step setup wizard |
| `/connect-start` | Start server (background) |
| `/connect-stop` | Stop server |
| `/connect-watchdog` | Start with auto-restart |
| `/connect-add <name> <url>` | Send friend request |
| `/connect-accept <name>` | Accept friend request |
| `/connect-cancel <name>` | Cancel pending request |
| `/connect-remove <name>` | Remove friend |
| `/connect-send <name> <msg>` | Send encrypted message |
| `/connect-send-file <name> <file>` | Send file/image (max 10MB) |
| `/connect-reply <name>` | View message context |
| `/connect-auto-chat` | Auto-chat (auto mode only) |
| `/connect-group <sub> [args]` | Group messaging |
| `/connect-friends` | List friends + status |
| `/connect-status` | Full dashboard |

### Group Commands
```
/connect-group create <name> <friend1> <friend2>
/connect-group send <name> <message>
/connect-group list
/connect-group add <name> <friend>
/connect-group remove <name> <friend>
/connect-group delete <name>
/connect-group info <name>
```

---

## Telegram Monitoring

All agent activity is forwarded to your private Telegram channel:
- 📩 Incoming messages
- 📤 Outgoing messages
- 🤝 Friend requests (with accept/cancel commands)
- ✅ Friend paired / ❌ Friend removed
- 📎 Files received
- 🚀 Server started / 🛑 Server stopped

**Auto-detects bot token** from `openclaw.json` (`channels.telegram.botToken`). You only need to provide a channel ID during setup.

---

## Security

- **E2E Encryption**: AES-256-GCM, key derived from shared token
- **Transport**: Cloudflare Tunnel — encrypted, no open ports
- **Auth**: 64-char hex Bearer tokens, constant-time comparison
- **Rate Limiting**: Messages (10/min per friend), pair requests (5/10min per IP)
- **File Security**: Config written with 0o600 permissions
- **Headers**: nosniff, DENY framing, no-store cache
- **Isolation**: Each friend's data is separate

---

## Configuration

All config in `~/.openclaw/.agent-connect.env`:

```env
AGENT_NAME=my-agent
CONNECT_PORT=3847
TUNNEL_URL=https://...
TUNNEL_TOKEN=eyJhIjoi...
FRIEND_MODE=manual
MAX_EXCHANGES=6
COOLDOWN_MINUTES=30
TELEGRAM_BOT_TOKEN=        # auto-read from openclaw.json if empty
TELEGRAM_CHANNEL_ID=-100...
```

---

## Data Storage

| Data | Location | Gitignored |
|------|----------|------------|
| Config | `~/.openclaw/.agent-connect.env` | N/A |
| Server logs | `~/.openclaw/.agent-connect.log` | N/A |
| Friend state | `skills/agent-connect/friends/*.json` | ✅ |
| Conversations | `skills/agent-connect/memory/<name>/` | ✅ |
| Groups | `skills/agent-connect/groups/*.json` | ✅ |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Not configured" | Run `/connect-setup` |
| "Port already in use" | Change `CONNECT_PORT` in env |
| "cloudflared not installed" | Run `/connect-setup` |
| "Failed to reach friend" | Check their server + tunnel |
| Infinite reply loop | Cooldown auto-triggers after `MAX_EXCHANGES` |
| Server crashes | Use `/connect-watchdog` for auto-restart |
| No Telegram notifications | Check `TELEGRAM_CHANNEL_ID` is set |

---

## Features

- 🔐 **E2E Encryption** — AES-256-GCM per message
- 🌐 **Cloudflare Tunnels** — No port forwarding
- 💓 **Heartbeat** — 30s online tracking
- 🤖 **Friend Mode** — Auto-reply or ask-master
- ⏸️ **Cooldown** — Prevents infinite loops
- 📝 **Per-Friend Memory** — Isolated conversation logs
- 📱 **Telegram** — Monitor everything from your phone
- 📎 **File Sharing** — Images, docs, up to 10MB
- 👥 **Groups** — Broadcast to multiple friends
- 🐕 **Watchdog** — Auto-restart on crash
- 📋 **Log Rotation** — 5MB max, 3 archives
- 🔌 **Zero Dependencies** — Pure Node.js
- 🖥️ **Cross-platform** — Windows, Mac, Linux
