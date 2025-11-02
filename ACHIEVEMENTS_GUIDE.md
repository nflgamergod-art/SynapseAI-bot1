# Achievement System Guide

## Overview
The bot now has a **fully automatic** achievement and points system that tracks user activity and awards achievements in real-time.

## How Points Are Earned

### Support Achievements
- **First Assist** (10 pts) - Help your first user
- **Century Club** (100 pts) - Help 100 users
- **3-Day Streak** (25 pts) - Help users for 3 consecutive days
- **Week Warrior** (50 pts) - Help users for 7 consecutive days
- **Speed Demon** (30 pts) - Resolve 5 issues in under 5 minutes each
- **Expert Helper** (75 pts) - Maintain 95%+ resolution rate over 20 cases

### Community Achievements
- **Welcome Wagon** (20 pts) - Welcome 10 new members
- **Conversation Starter** (30 pts) - Start 50 conversations

### Knowledge Achievements
- **Knowledge Contributor** (40 pts) - Add 10 entries to knowledge base
- **Q&A Master** (35 pts) - Create 25 Q&A pairs

### Social Achievements
- **Well Connected** (45 pts) - Interact in 50+ unique channels

### Milestone Achievements
- **Chatterbox Champion** (150 pts) - Send 1000 helpful messages

## Automatic Tracking

### What's Tracked Automatically:
1. **Messages Sent** - Every message counts toward message milestones
2. **Welcome Messages** - Saying "welcome" + mentioning someone = welcome count++
3. **Support Interactions** - Using support commands tracks assists and streaks
4. **Knowledge Base** - Using `/kb add` counts toward knowledge achievements
5. **Channel Activity** - Talking in different channels = unique interactions
6. **New Member Joins** - System tracks when people join for welcome attribution

### Background Jobs:
- **Streak Check** - Runs daily at midnight to award streak achievements
- **Achievement Scan** - Runs every 6 hours to check all achievement criteria
- **Initial Check** - Runs 1 minute after bot startup

## Perk Unlocks

Points unlock special perks at these thresholds:

| Points | Perk | Description |
|--------|------|-------------|
| 50 | Custom Color | Set your own role color with `/setcolor` |
| 100 | Priority Support | Your questions get priority handling |
| 150 | Custom Emoji | Request a custom server emoji with `/requestemoji` |
| 200 | Channel Suggest | Suggest new channels |
| 300 | Voice Priority | Speaker priority in voice channels |
| 500 | Exclusive VIP | Special VIP role with exclusive perks |

## User Commands

- `/perks` - View your unlocked perks and point total
- `/achievements [user]` - View your (or someone's) earned achievements
- `/leaderboard points` - See the top achievement earners
- `/claimperk <perk_id>` - Claim an unlocked perk

## Admin Commands

- `/supportstats [member]` - View detailed support performance
- `/leaderboard support_category` - View support-specific rankings

## How Achievements Are Checked

### Real-Time (During Each Message):
- Message count
- Welcome detection
- Channel diversity

### Periodic (Every 6 Hours):
- Support interaction totals
- Knowledge base contributions
- Resolution rates
- Fast resolution counts
- Unique interaction counts

### Daily (At Midnight):
- Consecutive day streaks
- Daily activity patterns

## Technical Details

### Data Sources:
- `support_interactions` table - Support tracking
- `knowledge_base` table - KB contributions
- `user_patterns` table - Message counts
- `user_interactions` table - Welcomes, joins
- `sentiment_history` table - Channel diversity

### Achievement Logic:
Achievements are **idempotent** - each can only be earned once per user. The system checks all criteria every time stats update and awards new achievements automatically.

### Notification:
- Console logs when achievements are earned (can be extended to DM users)
- Celebration detection for positive moments
- Escalation detection for frustrated users

## Configuration

Points and thresholds are defined in:
- `src/services/rewards.ts` - Achievement definitions
- `src/services/achievementCron.ts` - Periodic check intervals

To modify achievement criteria, edit the `ACHIEVEMENTS` object in `rewards.ts`.

## Best Practices

1. **Support Members**: Use support commands to track interactions properly
2. **Knowledge Contributors**: Add FAQs via `/kb add` to earn knowledge points
3. **Community Members**: Welcome new users and engage in conversations
4. **Consistency**: Daily activity builds streaks for bonus points

## Troubleshooting

**Points not updating?**
- Automatic checks run every 6 hours
- Manual check: wait for next cron cycle
- Verify you're performing tracked activities (see "What's Tracked Automatically")

**Achievement not awarded?**
- Check `/achievements` to see if you already have it
- Verify you meet the exact criteria
- Some achievements require minimum thresholds (e.g., 20 cases for Expert Helper)

**Streak broken unexpectedly?**
- Streaks require activity on consecutive calendar days
- Timezone is server-local (UTC-based)
- Missing one day breaks the streak

## Future Enhancements

Potential additions:
- User DM notifications for new achievements
- Server-wide achievement announcements
- Seasonal/event achievements
- Team/guild achievements
- Achievement categories/badges in profiles
