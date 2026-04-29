# 🗳 VoteKick Bot

A Telegram group vote-based kick bot using Cloudflare Workers + D1 database with weighted voting and new member verification system.

---

## 📦 Project Structure

```
votekick/
├── src/
│   ├── index.ts                      # Worker entry point (Webhook + Cron)
│   ├── telegram.ts                   # Telegram API wrapper
│   ├── types.ts                     # TypeScript type definitions
│   ├── renderService.ts              # UI rendering
│   ├── db/
│   │   ├── usersRepo.ts             # User database operations
│   │   ├── votesRepo.ts              # Vote database operations
│   │   ├── voteRecordsRepo.ts        # Vote records database operations
│   │   ├── verificationsRepo.ts     # Verification records database operations
│   │   ├── pendingDeletionsRepo.ts    # Pending deletions database operations
│   │   └── botMessagesRepo.ts        # Bot messages database operations
│   └── services/
│       ├── voteService.ts           # Core voting logic
│       ├── verificationService.ts    # New member verification logic
│       ├── weightService.ts           # Weight calculation service
│       └── botMessageService.ts      # Bot message service
├── migrations/
│   ├── 0001_init.sql                # Initial database schema
│   ├── 0002_add_verifications.sql    # Verification feature extension
│   ├── 0003_add_bot_message_tracking.sql
│   └── create_pending_deletions.sql
├── scripts/
│   └── set-webhook.js                # Telegram Webhook setup script
├── config/                           # Configuration templates
├── docs/                             # Documentation
├── wrangler.toml                     # Cloudflare Workers configuration
├── package.json
└── tsconfig.json
```

---

## ✨ Features

### 1. Vote Kick System
- Reply to a user's message and send `/kick` to initiate a vote
- Group members vote, user is kicked when approval weight reaches threshold
- Failed/expired votes are automatically cleaned up

### 2. New Member Verification System
- New members are recorded silently when joining
- Verification triggered on first message
- 1 minute verification timeout
- First failure kicks user, second failure permanently bans

### 3. Weighted Voting System
- User reputation weights based on activity
- Vote power = √weight
- Dynamic kick threshold based on target's weight

---

## 🚀 Deployment Steps

### Prerequisites

1. **Cloudflare Account**: https://cloudflare.com (Free)
2. **Node.js**: https://nodejs.org (LTS recommended)
3. **Telegram Bot**: 
   - Search `@BotFather` on Telegram
   - Send `/newbot` and follow the instructions
   - Save your Bot Token
   - Disable privacy mode for group usage: `/setprivacy` → Disabled

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Login to Cloudflare

```bash
npx wrangler login
```

### Step 3: Create D1 Database

```bash
npx wrangler d1 create votekick-db
```

Copy the `database_id` output and fill in `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "votekick-db"
database_id = "YOUR_DATABASE_ID_HERE"
```

### Step 4: Initialize Database

```bash
# Run all migrations
npx wrangler d1 execute votekick-db --remote --file=migrations/0001_init.sql
npx wrangler d1 execute votekick-db --remote --file=migrations/0002_add_verifications.sql
npx wrangler d1 execute votekick-db --remote --file=migrations/0003_add_bot_message_tracking.sql
npx wrangler d1 execute votekick-db --remote --file=migrations/create_pending_deletions.sql
```

### Step 5: Set Bot Token

```bash
npx wrangler secret put BOT_TOKEN
# Enter your Telegram Bot Token
```

### Step 6: Deploy

```bash
npx wrangler deploy
```

### Step 7: Set Webhook

```bash
BOT_TOKEN=YOUR_BOT_TOKEN WORKER_URL=https://your-worker.workers.dev node scripts/set-webhook.js
```

---

## ⚙️ Configuration

| Variable | Default | Description |
|----------|---------|--------------|
| `BASE_VOTE_THRESHOLD` | 20 | Base kick threshold |
| `VOTE_DURATION_SECONDS` | 300 | Vote duration (seconds) |
| `INITIATOR_COOLDOWN_SECONDS` | 60 | Initiator cooldown (seconds) |
| `TARGET_COOLDOWN_SECONDS` | 180 | Same target cooldown (seconds) |
| `MIN_WEIGHT_TO_INITIATE` | 1.0 | Minimum weight to initiate vote |
| `ENABLE_VERIFICATION` | 1 | Enable verification (1=yes, 0=no) |

---

## 📊 Weight System

**Reputation Update Formula:**
```
W_new = W_old × 0.90^Δd + log(1 + Δt * 0.0005)
```
- `Δd` = days since last update (time decay)
- `Δt` = seconds since last message (activity bonus)

**Vote Power:**
```
vote_power = √W
```

**Dynamic Threshold:**
```
threshold = BASE_VOTE_THRESHOLD × (1 + target_weight / 100)
```

---

## 🛡️ Anti-Abuse Mechanisms

- Administrators/creators cannot be kicked
- Cannot kick bots
- Cannot kick yourself
- Cannot vote twice
- Initiator and target cooldown protection

---

## ❓ FAQ

**Bot not responding?**
- Ensure Bot has admin permissions
- Ensure Webhook is set correctly
- Check logs: `npx wrangler tail`

**Cannot kick users?**
- Ensure Bot has "Ban Users" permission
- Group owners cannot be kicked (Telegram limitation)

**How to disable verification?**
- Set `ENABLE_VERIFICATION = "0"` in `wrangler.toml`

---

## 📝 Commands

- `/kick` - Initiate vote to kick (reply to a message first)
- `/start` - Get usage guide (private chat)

---

## 🌍 Languages

- [中文版 README](./README_CN.md)

---

## License

This project is licensed under the **GNU General Public License v2 (GPL-2.0)**. See [LICENSE](./LICENSE) for full license text.

**Key points:**
- Free to use and modify
- Source code must be made available when distributing
- Derivative works must be distributed under the same license
