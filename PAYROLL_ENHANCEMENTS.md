# Payroll System Enhancements

## Overview
Comprehensive payroll management system with role-based pay adjustments, automated notifications, and strict time limit enforcement to prevent abuse.

## Features Implemented

### 1. Pay Adjustment System
Set multipliers for specific users or roles to increase/decrease pay rates.

**Commands:**
- `/payroll adjustpay` - Adjust pay multiplier for a user or role
  - `target_type`: Choose "User" or "Role"
  - `user`: Target user (if target_type=user)
  - `role`: Target role (if target_type=role)
  - `multiplier`: Pay rate multiplier (0.1-5.0)
    - 1.0 = normal pay (no change)
    - 1.5 = 150% pay (+50% increase)
    - 0.5 = 50% pay (-50% decrease)
  - `reason`: Reason for adjustment (audit trail)

- `/payroll removepay` - Remove a pay adjustment
  - `target_type`: Choose "User" or "Role"
  - `user` or `role`: Target to remove adjustment from

- `/payroll listpay` - List all active pay adjustments
  - Shows all user and role multipliers
  - Displays percentage changes
  - Includes reasons for each adjustment

- `/payroll viewbalance` - View unpaid balance
  - Staff can view their own balance
  - Owners can view any staff member's balance
  - Shows total unpaid amount, hours, and recent pay periods
  - Displays current pay multiplier

**Priority Rules:**
1. User-specific adjustments take priority over role adjustments
2. If user has multiple roles with adjustments, the highest multiplier is used
3. If no adjustments exist, default 1.0x multiplier is used

### 2. Automated Notification System

**Weekly Staff Notifications (Sundays at 10 AM):**
- All staff with unpaid balances receive a DM
- Shows total unpaid amount, hours, and number of pay periods
- Includes breakdown of recent pay periods (up to 5)
- Sent every Sunday until paid

**Daily Owner Reports (Every day at 9 AM):**
- Owner receives a DM with all staff unpaid balances
- Shows total amount owed across all staff
- Lists top 10 staff by unpaid balance
- Includes total hours and pay period counts
- Helps owner track payroll obligations daily

**Setup Required:**
Add to `.env` file:
```
OWNER_IDS=your_discord_user_id
STAFF_CHANNEL_ID=channel_for_auto_clockout_notifications (optional)
```

### 3. Time Limit Enforcement

**Automatic Clock-Out:**
- Checks every 5 minutes for users exceeding limits
- Daily limit: 5 hours per day (including breaks)
- Weekly limit: 4 days per week (changed from 5)
- Auto-clocks out when limit reached
- Sets 24-hour cooldown automatically
- Sends DM notification to user
- Posts notification in staff channel (if configured)

**Break Time Counting:**
- All time clocked in counts toward daily limit (including breaks)
- Prevents abuse of staying clocked in during long breaks
- Auto-break still triggers after 10 minutes of inactivity
- Time tracking uses total elapsed time, not just active time

**Cooldown System:**
- 24-hour cooldown after reaching daily limit
- User cannot clock in until cooldown expires
- Cooldown tracked in database
- Clear error messages when attempting to clock in during cooldown

### 4. Updated Configuration

**Payroll Config Changes:**
- Default `max_days_per_week` changed from 5 to 4 days
- All existing limits remain: 5 hours/day, 10 min auto-break
- Configuration viewable with `/payroll view`
- Adjustable with `/payroll config` (owner only)

## Database Schema Changes

### New Table: `pay_adjustments`
```sql
CREATE TABLE pay_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  target_id TEXT NOT NULL,          -- User ID or Role ID
  target_type TEXT NOT NULL,         -- 'user' or 'role'
  multiplier REAL NOT NULL,          -- Pay multiplier (0.1 - 5.0)
  reason TEXT NOT NULL,              -- Reason for adjustment
  created_at TEXT NOT NULL,          -- ISO timestamp
  created_by TEXT NOT NULL,          -- User ID who created it
  UNIQUE(guild_id, target_id, target_type)
);
```

## File Changes

### New Files
- `src/services/payrollCron.ts` - Automated notification and enforcement system

### Modified Files
- `src/services/payroll.ts` - Added pay adjustment functions and time tracking
- `src/index.ts` - Added new slash commands and cron initialization

## Usage Examples

### Setting Pay Adjustments

**Increase pay for a hardworking staff member:**
```
/payroll adjustpay
  target_type: User
  user: @JohnDoe
  multiplier: 1.5
  reason: Excellent performance, handling extra responsibilities
```

**Decrease pay for a role during training period:**
```
/payroll adjustpay
  target_type: Role
  role: @Trainee
  multiplier: 0.75
  reason: Training period - reduced pay rate
```

**Give bonus pay to senior staff role:**
```
/payroll adjustpay
  target_type: Role
  role: @Senior Staff
  multiplier: 1.25
  reason: Senior staff bonus - 25% increase
```

### Viewing Balances

**Check your own unpaid balance:**
```
/payroll viewbalance
```

**Owner checking staff member's balance:**
```
/payroll viewbalance
  user: @StaffMember
```

### Managing Adjustments

**List all active adjustments:**
```
/payroll listpay
```

**Remove an adjustment:**
```
/payroll removepay
  target_type: User
  user: @JohnDoe
```

## Notification Examples

### Weekly Staff DM
```
💰 Weekly Unpaid Balance Reminder

You have $487.50 in unpaid earnings.

⏱️ Total Hours: 32.50 hours
📋 Pay Periods: 3 period(s)

📊 Recent Pay Periods
1. 12/1/2024 - 12/7/2024: $150.00 (10.00h)
2. 12/8/2024 - 12/14/2024: $187.50 (12.50h)
3. 12/15/2024 - 12/21/2024: $150.00 (10.00h)

This reminder will be sent weekly until you are paid.
```

### Daily Owner Report
```
📊 Daily Payroll Summary

Total Unpaid: $2,437.50 across 8 staff members

⏱️ Total Unpaid Hours: 162.50 hours
👥 Staff Count: 8

💸 Top Unpaid Staff
1. @JohnDoe: $487.50 (32.50h, 3 period(s))
2. @JaneSmith: $375.00 (25.00h, 2 period(s))
3. @BobJones: $300.00 (20.00h, 2 period(s))
...
```

### Auto Clock-Out Notification
```
⏰ Auto Clock-Out: Time Limit Reached

You've been automatically clocked out after reaching the 5 hour daily limit.

📊 Today's Total: 5.08 hours
⏳ Cooldown: 24 hours

Break time counts toward your daily limit. You can clock in again in 24 hours.
```

## Testing Checklist

Before deploying:
- [ ] Test `/payroll adjustpay` with user target
- [ ] Test `/payroll adjustpay` with role target
- [ ] Test `/payroll listpay` shows adjustments correctly
- [ ] Test `/payroll viewbalance` for staff and owner
- [ ] Test `/payroll removepay` removes adjustments
- [ ] Verify pay calculation uses multipliers correctly
- [ ] Verify auto-clock-out triggers after 5 hours
- [ ] Verify 24-hour cooldown prevents re-clock-in
- [ ] Check that break time counts toward daily limit
- [ ] Verify weekly notifications are scheduled correctly
- [ ] Verify daily owner reports are scheduled correctly
- [ ] Test that user adjustments override role adjustments

## Deployment Steps

1. **Backup Database:**
   ```bash
   scp root@162.243.193.162:/root/SynapseAI/data/db.sqlite3 ./backup-$(date +%Y%m%d).sqlite3
   ```

2. **Build Project:**
   ```bash
   npm run build
   ```

3. **Deploy to Droplet:**
   ```bash
   rsync -av --exclude 'node_modules' --exclude '.git' ./ root@162.243.193.162:/root/SynapseAI/
   ```

4. **Install Dependencies:**
   ```bash
   ssh root@162.243.193.162 "cd /root/SynapseAI && npm install"
   ```

5. **Restart Bot:**
   ```bash
   ssh root@162.243.193.162 "systemctl restart synapseai"
   ```

6. **Verify Running:**
   ```bash
   ssh root@162.243.193.162 "systemctl status synapseai"
   ssh root@162.243.193.162 "journalctl -u synapseai -f"
   ```

## Configuration Notes

### Environment Variables
Ensure these are set in `/root/SynapseAI/.env`:
- `OWNER_IDS` - Comma-separated owner Discord user IDs for daily reports
- `STAFF_CHANNEL_ID` - Optional channel ID for auto-clock-out notifications

### Scheduled Tasks
- Weekly notifications: Sundays at 10:00 AM
- Daily owner reports: Every day at 9:00 AM
- Time limit checks: Every 5 minutes
- Auto-break checks: Every 2 minutes (existing)

## Troubleshooting

**Issue: Notifications not sending**
- Check `OWNER_IDS` is set in `.env`
- Verify bot has permission to DM users
- Check logs: `journalctl -u synapseai -f`

**Issue: Auto-clock-out not working**
- Verify cron service is initialized (check logs for "✅ Payroll cron jobs initialized")
- Check time limit config: `/payroll view`
- Verify break time is counting: test with short shifts

**Issue: Pay multipliers not applying**
- Check adjustment exists: `/payroll listpay`
- Verify calculation: `/payroll viewbalance`
- Check user has correct role (for role-based adjustments)

**Issue: Cooldowns not working**
- Check payroll_cooldowns table in database
- Verify 24-hour period hasn't passed
- Look for error messages in `/clockin` response

## Future Enhancements

Potential additions based on user feedback:
- [ ] Manual override for emergency clock-ins during cooldown
- [ ] Temporary multiplier expiration dates
- [ ] Pay adjustment approval workflow
- [ ] Export payroll reports to CSV
- [ ] Integration with payment systems
- [ ] Shift swap/trade system
- [ ] Bonus pay for specific achievements
- [ ] Tiered role multipliers with promotion system
