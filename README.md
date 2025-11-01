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

Security
- Keep `.env` secret. Do not commit API keys to git.

Next steps
- Add persistent conversation storage (optional) and register slash commands if you prefer native Discord slash support.
