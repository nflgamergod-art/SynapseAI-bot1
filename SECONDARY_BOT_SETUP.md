# Secondary Bot Setup Guide

## Problem
With 113+ commands, we're exceeding Discord's 100 slash command limit per bot, forcing us to prioritize critical commands and cut others. Many great features are being hidden.

## Solution: Split Features Across Two Bots

### **Bot 1: SynapseAI (Main Bot)** - Critical Operations
**Keep the 32 priority commands:**
- Core: help, ping, diagcommands
- **Shift & Payroll (CRITICAL):** clockin, clockout, forceclockout, payroll, shifts, shiftstats, whosonduty, schedule, upt, attendance
- **Staff Management:** staffactivity, promotion, violations
- **Ticket System:** ticket, ticketsla, tickettag, ticketnote, ticketanalytics, ticketfeedback, autoresponse, staffexpertise, ticketrouting
- **Support:** supportstats
- **Moderation:** warn, mute, kick, ban, cases
- **Appeals:** appeal

### **Bot 2: SynapseAI-Extra** - Enhancement Features
**Move these commands to the secondary bot:**
- **Fun & Games:** joke, blackjack, rpsai
- **Utility:** membercount, version, memories, remember, forget
- **Configuration:** All config commands (setmodlog, setdefaultmute, setfounderrole, etc.)
- **Advanced Moderation:** updatecase, clearmodlog, clearwarn, purge
- **Perks System:** perks, perkspanel, claimperk, setperkrole
- **Channel Management:** channelsuggestion, prioritysupport
- **Giveaways:** giveaway
- **Reminders:** remind, reminders
- **Appeals Management:** appeals, appealhistory
- **Staff Suspension:** suspendstaff, suspensions, cancelsuspension
- **Knowledge Base:** kb, faq
- **Support Roles:** getsupportroles, setsupportroles, getsupportintercept, setsupportintercept
- **Question Timeout:** getquestiontimeout, setquestiontimeout
- **Automod:** automod, addbypass, removebypass, abusebypass
- **Emoji Requests:** requestemoji
- **Role Management:** addrole, removerole, setcolor
- **Response Rules:** setresponserule, delresponserule, listresponserules
- **Founder Management:** setfounderrole
- **Stats:** stats, leaderboard
- **Points:** givepoints, history
- **Mentions:** getmention, setmention
- **AI Commands:** diagai
- **Aliases:** aliases
- **Announcements:** announce
- **Support Commands:** support, supportstart, supportend, supportaddhelper, supportrate
- **Voice Priority:** voicepriority
- **Case Management:** case
- **Manage Command:** manage
- **Revert:** revert

---

## Step-by-Step Setup

### Step 1: Create the Second Bot on Discord

1. Go to https://discord.com/developers/applications
2. Click **"New Application"**
3. Name it: `SynapseAI-Extra` (or `SynapseAI Utility`)
4. Go to **Bot** section
5. Click **"Add Bot"**
6. **Important Settings:**
   - Enable **"Presence Intent"**
   - Enable **"Server Members Intent"**
   - Enable **"Message Content Intent"**
7. Copy the **Bot Token** (you'll need this)
8. Go to **OAuth2 → URL Generator**
9. Select scopes:
   - `bot`
   - `applications.commands`
10. Select permissions:
    - Administrator (or specific permissions as needed)
11. Copy the generated URL and invite the bot to your server

### Step 2: Clone the Current Bot Code

```bash
# On your local machine
cd /Users/kc
cp -r "SynapseAI bot1" "SynapseAI bot2"
cd "SynapseAI bot2"

# Initialize as separate git repo
rm -rf .git
git init
git remote add origin https://github.com/nflgamergod-art/SynapseAI-bot2.git
```

### Step 3: Modify the Secondary Bot

**Update `.env` file:**
```env
DISCORD_TOKEN=YOUR_NEW_BOT_TOKEN_HERE
DISCORD_APPLICATION_ID=YOUR_NEW_BOT_APP_ID
GUILD_ID=1394809372022018058
OWNER_ID=1272923881052704820
# ... rest of config
```

**Update `src/index.ts` - Remove Priority Commands:**

In the commands array, **remove these 32 commands:**
- help, ping, diagcommands
- clockin, clockout, forceclockout, payroll, shifts, shiftstats, whosonduty, schedule, upt, attendance
- staffactivity, promotion, violations
- ticket, ticketsla, tickettag, ticketnote, ticketanalytics, ticketfeedback, autoresponse, staffexpertise, ticketrouting
- supportstats
- warn, mute, kick, ban, cases
- appeal

This will leave you with ~81 commands for the secondary bot, well under the 100 limit.

### Step 4: Update Database Access

**Option A: Shared Database (Recommended)**
- Both bots can access the same `data/memory.db`
- Deploy secondary bot to the same server
- Use symbolic link: `ln -s /root/SynapseAI/SynapseAI-bot1/data /root/SynapseAI/SynapseAI-bot2/data`

**Option B: Separate Databases**
- Each bot has its own database
- User data won't sync between bots
- Not recommended for this use case

### Step 5: Deploy Secondary Bot

**On the server:**
```bash
# SSH into your server
ssh root@162.243.193.162

# Clone the secondary bot
cd /root/SynapseAI
git clone https://github.com/nflgamergod-art/SynapseAI-bot2.git
cd SynapseAI-bot2

# Install dependencies
npm install

# Build
npm run build

# Start with PM2
pm2 start dist/index.js --name synapseai-extra
pm2 save

# Check status
pm2 list
pm2 logs synapseai-extra
```

### Step 6: Test Both Bots

1. Type `/` in Discord
2. Verify main bot has 32 priority commands
3. Verify secondary bot has the remaining ~81 commands
4. Test a few commands from each bot to ensure they work

---

## Recommended: Update Bot Names

To help users distinguish between bots:

**Main Bot:**
- Name: `SynapseAI`
- Status: `⚡ Staff Operations | /help`
- Role: Main operations, payroll, tickets, moderation

**Secondary Bot:**
- Name: `SynapseAI Utility`
- Status: `🛠️ Extra Features | /help`
- Role: Configuration, fun commands, utilities

---

## Benefits

✅ **No more 100-command limit issues**
- All features accessible
- No commands hidden
- Room for future growth

✅ **Better organization**
- Critical operations separate from utilities
- Easier to maintain
- Clearer command structure

✅ **Performance**
- Load distributed across two bots
- Less API rate limiting
- Faster response times

✅ **Reliability**
- If one bot goes down, the other still works
- Main operations always available
- Reduced single point of failure

---

## Maintenance

**When adding new commands:**
1. Decide if it's critical (main bot) or utility (secondary bot)
2. Add to appropriate bot
3. Keep main bot under 32 commands
4. Secondary bot has room for 100 commands

**When updating shared features:**
1. Update both codebases
2. Deploy main bot first
3. Then deploy secondary bot
4. Test both together

**When troubleshooting:**
- Check `pm2 logs synapseai` for main bot
- Check `pm2 logs synapseai-extra` for secondary bot
- Both share the same database (if using Option A)

---

## Alternative: Use Subcommands

If you don't want two bots, you can consolidate commands using subcommands:

**Example:** Instead of:
- `/setmodlog`
- `/setdefaultmute`
- `/setfounderrole`

Use:
- `/config modlog`
- `/config defaultmute`
- `/config founderrole`

This reduces command count significantly. However, it requires more refactoring.

---

## Current Status

**Main Bot (SynapseAI):**
- ✅ Deployed and running
- ✅ 32 priority commands registered
- ✅ All critical features working

**Secondary Bot (SynapseAI-Extra):**
- ⏳ Not yet set up
- ⏳ Awaiting your decision to proceed

Let me know if you want to proceed with the two-bot setup!
