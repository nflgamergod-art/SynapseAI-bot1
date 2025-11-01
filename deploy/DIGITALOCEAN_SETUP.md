DigitalOcean droplet setup for SynapseAI bot

This guide assumes you will use an Ubuntu 22.04 droplet. It covers creating a droplet, preparing it, and configuring systemd (recommended) or PM2 to run the bot 24/7.

1) Create a Droplet
- Recommended: Ubuntu 22.04 LTS
- Size: Basic 1 vCPU / 1GB RAM (s-1vcpu-1gb) is usually sufficient.
- Add your SSH public key to the droplet during creation (recommended). If you don't have one, generate: `ssh-keygen -t ed25519`.
- Choose a region near your users and create the droplet.

2) SSH into the droplet

Replace DROPLET_IP with the public IP.

```bash
ssh root@DROPLET_IP
```

3) Create a deploy user (non-root) and setup firewall

```bash
# create a user 'synapseai'
adduser --disabled-password --gecos "" synapseai
usermod -aG sudo synapseai
# copy your SSH key for easier login (on your local machine):
# scp ~/.ssh/id_ed25519.pub root@DROPLET_IP:/root/key.pub
# on the droplet:
mkdir -p /home/synapseai/.ssh
cat /root/key.pub >> /home/synapseai/.ssh/authorized_keys
chown -R synapseai:synapseai /home/synapseai/.ssh
chmod 700 /home/synapseai/.ssh
chmod 600 /home/synapseai/.ssh/authorized_keys

# enable UFW
apt update && apt install -y ufw
ufw allow OpenSSH
ufw enable

# optional: allow HTTP if you later add a web endpoint
# ufw allow http
```

4) Install Node.js, git, and PM2

```bash
# on the droplet (as root or sudo)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt-get install -y nodejs git build-essential
npm install -g pm2
```

5) Deploy your app to the droplet

You have two options:
A) Push the repo to GitHub and clone on the droplet (recommended)
B) rsync your local folder to the droplet

A) Clone from GitHub

```bash
sudo -u synapseai -i
cd /srv
git clone git@github.com:YOUR_USER/YOUR_REPO.git synapseai
cd synapseai
npm ci
npm run build
exit
```

B) Transfer from your local machine (rsync)

```bash
# from your local machine
rsync -avz --exclude node_modules --exclude .git . root@DROPLET_IP:/srv/synapseai
# then on droplet
chown -R synapseai:synapseai /srv/synapseai
sudo -u synapseai -i
cd /srv/synapseai
npm ci
npm run build
```

6) Configure environment secrets (recommended: EnvironmentFile)

Create `/etc/synapseai.env` (owned by root) with content:

```
DISCORD_TOKEN=your_token_here
OWNER_ID=your_user_id
GUILD_ID=optional_guild_id
PREFIX=!
```

Protect it:

```bash
chmod 600 /etc/synapseai.env
```

7) Use systemd to run the bot (recommended)

Copy the `deploy/synapseai.service.template` into `/etc/systemd/system/synapseai.service` and edit paths/user if needed.

Then run:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now synapseai
sudo journalctl -u synapseai -f
```

8) PM2 alternative

If you prefer PM2 (does not require creating a systemd file yourself):

```bash
# as synapseai user
cd /srv/synapseai
pm ci
npm run build
# start app with PM2
pm2 start dist/index.js --name synapseai --node-args=""
pm2 save
# generate startup script so pm2 resurrects on reboot
pm2 startup systemd
# follow the printed command (it will require sudo)
```

9) Logs & management

- view systemd logs: `sudo journalctl -u synapseai -f`
- view pm2 logs: `pm2 logs synapseai`
- restart: `sudo systemctl restart synapseai` or `pm2 restart synapseai`

10) Security & best practices
- Keep secrets in `/etc/synapseai.env` (or use a secrets manager).
- Use SSH keys and disable password auth if possible.
- Consider automatic backups on DigitalOcean and monitoring.

If you want, I can:
- create a small health HTTP endpoint in the bot to surface /health for monitoring (I can add a tiny express endpoint), or
- generate the systemd unit file in your repo with exact variables filled in, or
- provide the exact commands to run if you give me your droplet IP and whether you'll push to GitHub or use rsync.
