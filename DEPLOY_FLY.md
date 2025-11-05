Fly.io deployment steps for this Discord bot

Prereqs
- Install flyctl: https://fly.io/docs/hands-on/install-flyctl/
- Make sure you have a GitHub repo with this project pushed (optional but handy)
- Ensure your project builds locally: `npm ci && npm run build`

Quick deploy (recommended)
1. Login and create an app
   flyctl auth login
   flyctl launch --name your-app-name --region ord
   - If asked to create a Dockerfile, choose to use the existing Dockerfile
   - If asked to set a port, you can accept the default

2. Set secrets (never commit tokens)
   flyctl secrets set DISCORD_TOKEN="Discord_Token"
   flyctl secrets set OWNER_ID="1272923881052704820"
   # Add any other environment variables you need (PREFIX, GUILD_ID, etc.)

3. Deploy
   flyctl deploy

4. Monitor logs
   flyctl logs -a your-app-name
   flyctl status -a your-app-name

Notes & tips
- The provided Dockerfile will build the project and run `node dist/index.js`.
- Fly will keep the app running; it restarts on failure and after host maintenance.
- If you want to use the Fly web builder instead of Docker, you can omit the Dockerfile and let fly build from source.
- For local testing you can run: `flyctl deploy --local-only` to test the container build locally.

Advanced
- If you want to limit outbound IPs or set up a proxy for the OpenAI API, configure that in fly.toml and use NAT services.
- Add health checks or a small HTTP endpoint if you want better monitoring. The bot itself does not need to accept HTTP requests.
