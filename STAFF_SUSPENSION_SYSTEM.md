# Staff Suspension & Demotion System

## Overview
Comprehensive staff management system that automatically suspends staff members after accumulating warnings and handles role demotions based on staff hierarchy.

## Features

### 🔴 Automatic Suspension on Warnings
- **3 warnings = automatic suspension**
- Random duration between 4-7 days
- Immediate role removal
- DM notification to user
- Staff channel notification

### 🟡 Role Hierarchy & Demotion
Staff roles follow a hierarchical demotion system:

```
Head Support → Support → Trial Support → Permanent Removal
```

**Demotion Rules:**
- **Head Support** → Demoted to **Support** after suspension
- **Support** → Demoted to **Trial Support** after suspension  
- **Trial Support** → **Permanent removal**, must appeal to return

**Multiple Roles:** If a user has multiple support roles simultaneously, the system:
- Removes ALL support roles during suspension
- After suspension ends, restores ONLY the highest role they had
- Applies demotion (e.g., Head Support → Support)

### ⚙️ Manual Suspension
Use `/suspendstaff` to manually suspend any staff member:
- Custom duration (1-30 days)
- Custom reason
- Same demotion rules apply
- Notifications sent automatically

### ✅ Cancellation
Use `/cancelsuspension` to cancel an active suspension:
- Restores original roles immediately
- No demotion applied
- Notifications sent to user and staff

### 📊 Monitoring
Use `/suspensions` to view all active suspensions:
- User information
- Suspension reason
- End date/time
- Type (temporary vs permanent)

## Commands

### `/suspendstaff`
**Permission Required:** Admin
**Options:**
- `user` - Staff member to suspend
- `duration` - Duration in days (1-30)
- `reason` - Reason for suspension

**Example:**
```
/suspendstaff user:@StaffMember duration:7 reason:Multiple policy violations
```

### `/cancelsuspension`
**Permission Required:** Admin
**Options:**
- `user` - Suspended staff member to reinstate

**Example:**
```
/cancelsuspension user:@StaffMember
```

### `/suspensions`
**Permission Required:** Admin
**Options:** None

Shows list of all active suspensions with details.

## Automatic Processes

### Warning Escalation
When a staff member receives their **3rd warning**:

1. ✅ System checks if user is staff
2. ✅ Generates random suspension duration (4-7 days)
3. ✅ Removes all support roles
4. ✅ Creates suspension record
5. ✅ DMs user with details
6. ✅ Posts to mod log channel
7. ✅ Notifies moderator of automatic suspension

### Suspension Expiry (Hourly Check)
Every hour, the system checks for expired suspensions:

**For temporary suspensions (Head/Support):**
1. ✅ Adds demoted role (one tier lower)
2. ✅ Marks suspension as complete
3. ✅ DMs user about reinstatement
4. ✅ Posts to mod log channel

**For permanent removals (Trial Support):**
1. ✅ Marks suspension as complete
2. ✅ DMs user about appeal requirement
3. ✅ Posts to mod log channel
4. ❌ No roles restored (must appeal)

## User Notifications

### Suspension Notice (DM)
```
🚫 Staff Suspension Notice
You have been suspended from your staff position in [Server Name].

Reason: [Reason]
Duration: [4-7 days / Permanent]
Current Role: [Head Support / Support / Trial Support]
After Suspension: [Demoted to Support / Removed - Must appeal]
```

### Suspension Ended (DM)
**Temporary:**
```
⏰ Suspension Ended
Your suspension period has ended.

Status: You have been demoted to [lower role].
Note: Further violations may result in permanent removal from staff.
```

**Permanent:**
```
🚫 Suspension Period Ended
Your suspension period has ended.

Status: You were permanently removed from staff and must submit an appeal to be considered for reinstatement.
Next Steps: Contact server administrators to appeal your removal.
```

## Staff Channel Notifications

### On Suspension
```
⚠️ Staff Suspension
[User] has been suspended from staff duties.

User: @User
Suspended By: @Moderator / System
Duration: 4-7 days / Permanent
Reason: [Reason]
Previous Role: Head Support / Support / Trial Support
After Suspension: Demoted to Support / Must Appeal
```

### On Expiry
```
⏰ Suspension Expired (Demoted)
[User]'s suspension has ended and they have been demoted.

User: @User
Demoted Role: @Support / @Trial Support
Original Reason: [Reason]
```

## Database Schema

### `staff_suspensions` Table
```sql
CREATE TABLE staff_suspensions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  suspended_by TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  original_roles TEXT NOT NULL,        -- JSON array of role IDs
  demoted_role TEXT,                   -- Role ID to restore after suspension
  is_active INTEGER NOT NULL DEFAULT 1,
  is_permanent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  cancelled_by TEXT
);
```

**Indexes:**
- `idx_suspensions_user` - Fast lookup by user
- `idx_suspensions_active` - Fast expiry checks

## Integration with Existing Systems

### ✅ Warnings System
- Hooks into `/warn` command
- Checks warning count after each warning
- Auto-triggers suspension at 3 warnings

### ✅ Support Roles
- Uses existing support role configuration
- Respects role hierarchy from `supportRoles.json`
- Compatible with `/setsupportroles`

### ✅ Mod Log
- Posts to configured mod log channel
- Uses existing `sendToModLog` infrastructure

### ✅ Appeals System
- Trial support members must use existing appeals
- Suspension history visible in appeal reviews

## Configuration

### Support Roles Setup
First, configure your support roles using `/setsupportroles`:
```
/setsupportroles head:@HeadSupport support:@Support trial:@TrialSupport
```

### Mod Log Channel
Configure where suspension notifications are posted:
```
/setmodlog channel:#mod-log
```

## Edge Cases Handled

### ✅ User leaves server during suspension
- Suspension marked as resolved
- No role changes attempted

### ✅ Multiple suspensions
- Only one active suspension per user
- Cannot suspend already suspended user

### ✅ Multiple support roles
- System removes ALL support roles
- Restores highest role after demotion
- Example: User with both Support + Trial Support roles → Suspended → Gets Trial Support after

### ✅ Role deleted during suspension
- Handles missing role gracefully
- Logs error but continues processing

### ✅ Bot restart during suspension
- Cron resumes checking on startup
- All suspensions processed normally

## Testing Checklist

- [ ] Give staff member 3 warnings → Auto-suspended
- [ ] Manual suspend Head Support → Gets Support role after
- [ ] Manual suspend Support → Gets Trial Support after
- [ ] Manual suspend Trial Support → Permanent removal
- [ ] Cancel suspension → Original roles restored
- [ ] Multiple roles → Correct handling
- [ ] Suspension expiry → Roles restored correctly
- [ ] Trial support expiry → No roles, must appeal
- [ ] DM notifications working
- [ ] Mod log notifications working
- [ ] `/suspensions` command shows active suspensions

## Best Practices

### For Administrators
1. **Review warnings before 3rd warning** - Talk to staff member first
2. **Use manual suspension for immediate action** - Don't wait for warnings
3. **Document reasons clearly** - Important for appeals
4. **Check `/suspensions` regularly** - Monitor active cases
5. **Use cancellation sparingly** - Undermines disciplinary process

### For Staff Management
1. **Trial support is probationary** - Third suspension = permanent removal
2. **Escalating consequences** - Demotion serves as warning
3. **Appeal process available** - Give permanently removed staff chance to return
4. **Consistent enforcement** - System applies same rules to all

## Troubleshooting

### Suspension not auto-triggering at 3 warnings
- Check mod log channel is configured
- Verify support roles are set up
- Check bot has permission to manage roles

### Roles not restoring after expiry
- Cron may be delayed (runs hourly)
- Check bot has manage roles permission
- Verify demoted role still exists

### User not receiving DMs
- User may have DMs disabled
- Notifications still post to mod log

### Cannot cancel suspension
- Verify suspension is active
- Check you have admin permissions
- Try `/suspensions` to confirm ID

## Technical Details

### Cron Schedule
- **Expiry checks:** Every 60 minutes
- **Initial check:** 2 minutes after bot startup
- **Warning checks:** Real-time on `/warn` command

### Files Modified
- `src/services/staffSuspension.ts` - Core suspension logic
- `src/services/db.ts` - Database schema
- `src/services/achievementCron.ts` - Expiry checking
- `src/index.ts` - Command handlers and warning integration

### Dependencies
- Existing support roles system
- Warnings service
- Mod log configuration
- Discord.js role management

## Appeals System

### Staff Can Appeal Suspensions
Staff members who are suspended or permanently removed can appeal using:
```
/appeal type:Staff Suspension/Removal Appeal reason:[Detailed explanation]
```

**Features:**
- ✅ Works in DMs with the bot
- ✅ Admins notified in mod log + owner DM
- ✅ Review with `/appeals approve` or `/appeals deny`
- ✅ Approved appeals restore **original roles** (no demotion)
- ✅ 12-hour cooldown between submissions
- ✅ Full tracking and history

**See [STAFF_APPEALS.md](./STAFF_APPEALS.md) for complete appeals documentation.**

## Future Enhancements

Possible additions:
- [x] Suspension appeals command ✅ **COMPLETED**
- [ ] Suspension history per user
- [ ] Configurable warning thresholds
- [ ] Configurable suspension durations
- [ ] Email notifications
- [ ] Suspension reason templates
- [x] Auto-unsuspend on appeal approval ✅ **COMPLETED**
