# Streak System Explained

## How the 3-Day Streak Works

### Overview
The streak system tracks **consecutive days** of helping users in support. It's designed to reward consistent community engagement.

### How It's Tracked

1. **Daily Activity Detection**
   - When a support interaction ends, the system records the date
   - The system compares the current date with your last assist date

2. **Streak Calculation Logic**
   ```
   If you helped today AND helped yesterday → Streak continues (+1)
   If you helped today BUT last help was 2+ days ago → Streak resets to 1
   If you help multiple times in one day → Streak stays the same (no penalty, no bonus)
   ```

3. **Streak Persistence**
   - Current streak: Your ongoing consecutive days
   - Longest streak: Your all-time best (for bragging rights!)

### Example Scenarios

**Scenario 1: Building a Streak**
- Monday: Help a user → Streak = 1
- Tuesday: Help a user → Streak = 2
- Wednesday: Help a user → Streak = 3 ✅ **Achievement Unlocked: 3-Day Streak (+25 points)**
- Thursday: Help a user → Streak = 4
- Friday: Help a user → Streak = 5
- Saturday: Help a user → Streak = 6
- Sunday: Help a user → Streak = 7 ✅ **Achievement Unlocked: Week Warrior (+50 points)**

**Scenario 2: Streak Reset**
- Monday: Help a user → Streak = 3
- Tuesday: Skip helping → Streak stays at 3
- Wednesday: Skip helping → Streak still at 3
- Thursday: Help a user → Streak resets to 1 (broke the consecutive days)

**Scenario 3: Same Day Multiple Helps**
- Monday 10 AM: Help a user → Streak = 2
- Monday 2 PM: Help another user → Streak stays at 2 (same day)
- Tuesday: Help a user → Streak = 3

### What Counts as "Helping"

Any of these actions count toward your streak:
- Claiming a support ticket
- Resolving a support interaction
- Being added as a helper to a ticket
- Completing a support case marked as resolved

### Achievements Based on Streaks

- **3-Day Streak** (25 points)
  - Help users on 3 consecutive days
  - Shows commitment to the community

- **Week Warrior** (50 points)  
  - Help users on 7 consecutive days (1 full week)
  - Elite dedication!

### Tips for Maintaining Streaks

1. **Be Consistent**: Try to help at least one person each day
2. **Don't Stress**: Life happens! If your streak breaks, just start building it again
3. **Quality Over Quantity**: One genuine help per day is all you need
4. **Check Your Progress**: Use `/stats` to see your current streak and longest streak

### Technical Implementation

The system uses the `user_stats` table with these fields:
- `current_streak`: Your active consecutive days
- `longest_streak`: Your personal best
- `last_assist_date`: The date of your most recent help

The streak logic runs automatically when:
- A support interaction ends (`endSupportInteraction`)
- A ticket is marked as resolved
- The `trackSupportStats` function is called

### Viewing Your Streaks

Use these commands to check your progress:
- `/stats` - See your current streak, longest streak, and all achievement progress
- `/perks` - View your total points earned from achievements
- `/achievements` - See all unlocked achievements

---

**Note**: The streak system is now fully implemented and integrated with the ticket and support interaction systems!
