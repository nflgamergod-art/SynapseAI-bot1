# Enhanced Commands Guide

## 📚 Knowledge Base (KB) Commands

The Knowledge Base is an AI-powered FAQ system that learns from support interactions and helps users find answers quickly.

### `/kb search <query>`
**Who can use:** Everyone  
**What it does:** Searches the knowledge base for answers to questions  
**Example:** `/kb search how to reset password`

- Searches all FAQ entries using smart matching
- Shows up to 5 relevant results with answers
- Displays how many times each answer has been helpful
- Use this when you need quick answers to common questions

### `/kb add <category> <question> <answer> [tags]`
**Who can use:** Admins only  
**What it does:** Manually adds a new FAQ entry  
**Example:** `/kb add setup "How do I join?" "Click the invite link in #welcome" discord,join,setup`

- **category**: Group similar questions (setup, billing, features, technical, etc.)
- **question**: The question users ask
- **answer**: The complete answer
- **tags**: Optional comma-separated keywords for better search

**Best practices:**
- Use clear, natural language questions
- Keep answers concise but complete
- Add relevant tags to improve search accuracy
- Group related FAQs in the same category

### `/kb trending [days]`
**Who can use:** Everyone  
**What it does:** Shows the most frequently accessed knowledge entries  
**Example:** `/kb trending 30` (shows last 30 days)

- Default: last 7 days
- See which FAQs users are viewing most
- Helps identify what topics users care about
- Use to prioritize content updates

### `/kb suggest [days]`
**Who can use:** Admins only  
**What it does:** AI analyzes support questions to suggest missing FAQs  
**Example:** `/kb suggest 14` (analyzes last 2 weeks)

- Scans support interactions and user questions
- Identifies patterns in unanswered questions
- Suggests what FAQ entries you should create
- Shows the reason for each suggestion
- Great for proactive content creation

### `/kb stats`
**Who can use:** Admins only  
**What it does:** Shows knowledge base analytics  

Displays:
- Total entries in knowledge base
- Number of categories
- Average helpfulness rating
- Recent contributions (last 7 days)
- Most helpful entry

Use this to track how well your knowledge base is serving users.

---

## 🏆 Gamification Commands

### `/achievements [user]`
**Who can use:** Everyone  
**What it does:** Shows earned achievements and reward points  
**Example:** `/achievements @user` or `/achievements` (yourself)

- Displays all unlocked achievements
- Shows points earned for each
- Categories: Helper, Active Member, Support Star, etc.
- Tracks total points

### `/perks`
**Who can use:** Everyone  
**What it does:** Shows special abilities unlocked based on your points  

Examples of perks:
- Priority support
- Custom colors
- Special badges
- Early feature access

Points unlock new perks automatically.

### `/leaderboard [type]`
**Who can use:** Everyone  
**What it does:** Shows rankings for achievements or support performance  

- Default: achievement leaderboard (total points)
- Optional types: resolution, speed, rating, volume
- Shows top 10 users
- Encourages healthy competition

---

## 📊 Support & Analytics Commands

### `/supportstats [member]`
**Who can use:** Everyone  
**What it does:** Shows support member performance metrics  

Displays:
- Total cases handled
- Average response time
- Resolution rate
- Satisfaction rating
- Expertise areas

### `/commonissues [hours]`
**Who can use:** Admins only  
**What it does:** Detects recurring support patterns  
**Example:** `/commonissues 48` (last 48 hours)

- Shows frequently asked questions
- Identifies trending issues
- Helps you spot problems before they spread
- Suggests proactive solutions

### `/faq [category]`
**Who can use:** Everyone  
**What it does:** Quick access to frequently asked questions  
**Example:** `/faq billing`

- Shows all FAQs (or filter by category)
- Formatted for easy reading
- Great for new users

---

## 🔮 AI Intelligence Commands (Admin Only)

### `/patterns`
**Who can use:** Admins only  
**What it does:** Shows detected user behavior patterns  

Displays patterns like:
- Timezone preferences
- Active hours (when users are online)
- Common topics users ask about
- Mood trends over time

Use this to understand your community better.

### `/insights`
**Who can use:** Admins only  
**What it does:** AI predictions for best posting times  

Shows:
- Recommended announcement time (peak activity)
- Best support coverage hours
- Server timezone analysis

Perfect for scheduling important announcements or events.

### `/sentiment [channel]`
**Who can use:** Admins only  
**What it does:** Real-time emotional analysis of conversations  
**Example:** `/sentiment #general`

Analyzes:
- Overall mood (very negative → very positive)
- Whether attention is needed
- Celebration opportunities
- Frustration spikes

Use to monitor channel health and intervene when needed.

### `/checkins`
**Who can use:** Admins only  
**What it does:** Shows scheduled proactive user follow-ups  

The bot automatically schedules check-ins for:
- Users who had issues recently
- Regular community members
- People who need follow-up

This shows pending check-ins so you can manually reach out.

---

## 🎯 What's New: Enhanced AI Conversations

**The bot now uses all enhanced features when chatting with users!**

When you talk to the bot, it automatically considers:

✅ **Knowledge Base Integration**
- If your message matches FAQ topics, the bot references those answers
- No need to manually search - it happens automatically

✅ **Emotional Intelligence**
- The bot detects if you're frustrated and adjusts its tone
- It's more empathetic when you're having a bad day
- It celebrates with you when you're happy

✅ **User Patterns**
- Remembers your timezone and active hours
- Understands your typical topics of interest
- Provides personalized context

✅ **Achievement Recognition**
- If you earned achievements recently, it congratulates you
- Tracks your point total for context

✅ **Sentiment Awareness**
- Adjusts responses based on your current mood
- More supportive when needed, cheerful when appropriate

**Example:**
```
You: "I'm still having issues with login"

Old bot: Generic troubleshooting steps

New bot: 
- Checks knowledge base for login FAQs
- Remembers you asked about this yesterday (context)
- Detects frustration in your tone
- Responds empathetically with relevant solutions
- May escalate to support if frustration is high
```

---

## 📈 Deployment Notes

**Latest Commit:** 948867c

**Changes in this update:**
1. Fixed all database schemas (user_patterns, sentiment_history, scheduled_checkins, knowledge_base)
2. Added migration logic to auto-update tables on deployment
3. Enhanced command descriptions with emojis and clear explanations
4. Integrated all enhanced features into AI conversations
5. Added comprehensive documentation

**To deploy:**
```bash
cd /opt/synapseai-bot
git pull
pm2 restart synapseai-bot
pm2 logs synapseai-bot --lines 50
```

**Look for these logs on startup:**
```
⚠️ Migrating user_patterns table to new schema...
⚠️ Migrating sentiment_history table to new schema...
✅ Enhanced features initialized
Registered 78 slash commands
```

---

## 🐛 Troubleshooting

If commands fail with "no such column" errors:
1. Check PM2 logs: `pm2 logs synapseai-bot`
2. Migration should auto-run on restart
3. If not, stop bot and delete `data/memory.db`, then restart (WARNING: loses data)

Common issues fixed:
- ✅ `/achievements` - awarded_at column
- ✅ `/checkins` - status column
- ✅ `/commonissues` - question column
- ✅ `/faq` - question/answer columns
- ✅ `/insights` - active_hours, timezone columns
- ✅ `/sentiment` - sentiment, emotional_markers columns

All schemas are now aligned with service code expectations.

---

## 💡 Tips for Admins

1. **Build your knowledge base early**
   - Use `/kb add` to create FAQs for common questions
   - Run `/kb suggest` weekly to find gaps
   - Monitor `/kb trending` to see what users need

2. **Track support quality**
   - Check `/supportstats` for your team
   - Review `/commonissues` daily
   - Use `/sentiment` to monitor channel health

3. **Optimize engagement**
   - Check `/insights` before scheduling announcements
   - Review `/patterns` to understand your community
   - Use `/leaderboard` to encourage participation

4. **Let AI help users**
   - The bot now auto-references knowledge base in conversations
   - Users get better answers without running commands
   - You can focus on complex issues while AI handles simple ones
