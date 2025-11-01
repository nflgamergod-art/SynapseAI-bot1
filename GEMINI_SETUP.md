# Google Gemini API Setup Guide

Your bot has been switched from OpenAI to Google Gemini! Here's how to get your free API key:

## Step 1: Get Your Free Gemini API Key

1. **Go to Google AI Studio**: https://aistudio.google.com/app/apikey

2. **Sign in** with your Google account

3. **Click "Create API Key"**

4. **Copy your API key** (it will look like: `AIzaSy...`)

## Step 2: Update Your Local .env File

Open `/Users/kc/SynapseAI bot1/.env` and replace:
```
GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE
```

With your actual key:
```
GEMINI_API_KEY=AIzaSyYourActualKeyHere
```

## Step 3: Update DigitalOcean Server

SSH into your server and update the .env file:

```bash
ssh root@64.23.133.2
cd /opt/synapseai-bot
nano .env
```

Update the line:
```
GEMINI_API_KEY=AIzaSyYourActualKeyHere
```

Save with `Ctrl+X`, `Y`, `Enter`

Then run the deployment:
```bash
bash deploy.sh
```

## What's Different?

✅ **FREE**: 1,500 requests per day (vs OpenAI's paid API)
✅ **Fast**: Quick response times
✅ **High Quality**: Gemini 1.5 Flash is excellent for conversations
✅ **No Credit Card**: No payment method required

## Benefits of Gemini

- **Model**: Using `gemini-1.5-flash` (fast and smart)
- **Free Tier**: 15 requests/minute, 1,500 requests/day
- **Quality**: Comparable to GPT-4 for most tasks
- **Speed**: Very fast responses
- **Cost**: Completely FREE for moderate usage

## Troubleshooting

If you see errors after deploying:

1. **Check your API key is valid** at https://aistudio.google.com/app/apikey
2. **Make sure you saved the .env file** on both local and server
3. **Restart the bot**: `pm2 restart synapseai-bot`
4. **Check logs**: `pm2 logs synapseai-bot`

## Rate Limits (Free Tier)

- **15 requests per minute**
- **1,500 requests per day**
- **1 million tokens per minute**

This should be more than enough for your Discord bot!

---

**Need help?** The bot will fallback to local responses if Gemini fails, so it will always work!
