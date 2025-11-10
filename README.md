# SynapseAI Discord Bot

This is a scaffold for the SynapseAI Discord bot: a TypeScript-based Discord bot with OpenAI integration for natural, contextual replies and moderation commands (kick, ban, mute, add/remove role) plus a help command.

Quick start
1. Copy `.env.example` to `.env` and fill in your `DISCORD_TOKEN` and `OPENAI_API_KEY`.
	- Do NOT paste tokens into public files (like this README). If you accidentally exposed a Discord bot token, rotate it in the Discord Developer Portal immediately.
2. Install dependencies:

```bash
npm install
```

3. Run in development (requires `ts-node`):

```bash
npm run dev
```

4. Build and run:

```bash
npm run build
npm start
```

Notes
- The bot listens for messages that either mention the bot, contain the wake word (`SynapseAI` by default), or start with the configured prefix (default `!`).
- Moderation commands require appropriate permissions (KickMembers, BanMembers, ManageRoles, ModerateMembers).
- OpenAI integration is used to generate conversational replies. Ensure your OpenAI key is set.

## New Features

### 🚫 Staff Suspension & Demotion System
Automatic staff management with warning escalation and role hierarchy:

**Key Features:**
- **Auto-suspend at 3 warnings** (4-7 day random duration)
- **Role hierarchy demotion:** Head Support → Support → Trial Support → Permanent Removal
- **Manual suspension:** `/suspendstaff` with custom duration
- **Cancellation:** `/cancelsuspension` to restore roles
- **Monitoring:** `/suspensions` to view active cases

**Commands:**
- `/suspendstaff user:[staff] duration:[days] reason:[text]` - Manually suspend staff member
- `/cancelsuspension user:[staff]` - Cancel active suspension and restore roles
- `/suspensions` - View all active staff suspensions

**See [STAFF_SUSPENSION_SYSTEM.md](./STAFF_SUSPENSION_SYSTEM.md) for complete documentation.**

### 📊 Stats & Achievement Tracking
- **Message tracking:** Earn points for every 100 messages
- **Welcome tracking:** Track and reward welcoming new members
- **Conversation tracking:** Track meaningful conversations
- **Streak system:** Maintain consecutive days of support
- **Comprehensive stats:** `/stats` command shows detailed progress

**See [STREAK_SYSTEM.md](./STREAK_SYSTEM.md) for streak details.**

### 💰 Payroll System
- **Unpaid breaks:** Break time excluded from pay calculations
- **Daily limits:** Automatic enforcement with break exclusion
- **Shift tracking:** `/shifts detail` for comprehensive breakdown

Security
- Keep `.env` secret. Do not commit API keys to git.

Next steps
- Configure support roles using `/setsupportroles`
- Set up mod log channel with `/setmodlog`
- Review staff suspension settings in documentation
