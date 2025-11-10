# Staff Role-Based Permissions Guide

## Overview
SynapseAI has a comprehensive role-based command permission system that allows you to control which commands each staff role can use. This ensures staff members have access to exactly what they need for their role.

## Staff Role Hierarchy

### 🟢 Trial Support (Entry Level)
**Purpose:** New support staff learning the ropes
**Access Level:** Basic support and moderation tools

**Allowed Commands:**
- `ticket` - Create, view, and manage support tickets
- `mute` / `unmute` - Temporary user moderation
- `warn` - Issue warnings to users
- `warns` - View user warning history
- `history` - View user moderation history
- `case` - View specific moderation cases
- `cases` - View all moderation cases
- `supportstart` - Clock in for support duty
- `supportend` - Clock out from support duty
- `whosonduty` - See who is currently on support

**Why These Commands?**
Trial Support members need the bare minimum to handle basic tickets and user issues. They can warn users, temporarily mute problematic members, and track their support hours. They cannot permanently ban or kick users, ensuring new staff don't make irreversible mistakes.

---

### 🔵 Support (Full-Time Staff)
**Purpose:** Experienced support staff handling day-to-day operations
**Access Level:** Expanded moderation and support management

**All Trial Support Commands PLUS:**
- `kick` - Remove disruptive users from the server
- `clearwarn` - Remove warnings from users
- `supportaddhelper` - Add helpers to support sessions
- `supportrate` - Rate support interactions
- `supportstats` - View support performance statistics
- `appeals` - Review user appeals
- `appealhistory` - View appeal history
- `remind` / `reminders` / `cancelreminder` - Set follow-up reminders
- `updatecase` - Update moderation case details

**Why These Commands?**
Full Support staff are experienced and trusted to handle more complex situations. They can kick users (not ban), manage their support helpers, review appeals, and update case details. Reminders help them follow up on pending issues.

---

### 🟣 Head Support (Leadership)
**Purpose:** Support team leaders managing operations
**Access Level:** Full support capabilities + team management

**All Support Commands PLUS:**
- `ban` / `unban` - Permanent user removal and restoration
- `addrole` / `removerole` - Manage user roles
- `purge` - Clean up channels by bulk-deleting messages
- `announce` - Send official server announcements
- `suspendstaff` - Suspend staff members for violations
- `cancelsuspension` - Remove staff suspensions
- `suspensions` - View all active staff suspensions
- `getdefaultmute` - View mute duration settings
- `getquestiontimeout` - View timeout settings
- `getmodlog` - View modlog channel configuration
- `tempchannels` - Manage temporary channels
- `listresponserules` - View automated response rules

**Why These Commands?**
Head Support leads the team and needs authority to ban users, manage staff discipline through suspensions, assign roles, and make announcements. They can view (but not change) server configurations to understand how systems work. They handle escalated issues that regular support can't resolve.

---

### 🔴 Moderator
**Purpose:** Full moderation staff (separate from support)
**Access Level:** Complete moderation toolkit

Moderators have access to all moderation commands including bulk actions (`bulkban`, `bulkkick`, `bulkmute`) and automod configuration.

---

### ⚫ Admin
**Purpose:** Server administrators
**Access Level:** All commands including configuration

Admins have unrestricted access to every command in the bot.

---

## Setting Up Role Permissions

### Quick Setup Using Presets

The easiest way to configure permissions is using presets:

```
/cmdpermissions preset role:@Trial Support preset:trial_support
/cmdpermissions preset role:@Support preset:support
/cmdpermissions preset role:@Head Support preset:head_support
```

This instantly gives each role the appropriate commands for their level.

### Manual Configuration

#### Add Individual Commands
```
/cmdpermissions add role:@Support commands:kick,ban,purge
```

#### Remove Commands
```
/cmdpermissions remove role:@Trial Support commands:ban
```

#### View Role Permissions
```
/cmdpermissions list role:@Support
```

#### Clear All Permissions
```
/cmdpermissions clear role:@Support
```

### View Command Panel
```
/cmdpermissions panel
```

Shows a comprehensive overview of the permission system.

---

## Permission Inheritance

**Important:** Roles do NOT automatically inherit permissions. If you want Head Support to have all Support commands, you must either:
1. Apply the `head_support` preset (which includes those commands)
2. Manually add them using `/cmdpermissions add`

---

## How Permissions Work

1. **Owner Bypass:** Server owner always has access to all commands
2. **Admin Bypass:** Users with `Administrator` permission bypass restrictions
3. **Role Check:** If not owner/admin, the bot checks if any of the user's roles have permission for that command
4. **Deny by Default:** If no role has permission, the command is blocked

---

## Best Practices

### ✅ DO:
- Use presets for initial setup (saves time)
- Review permissions regularly
- Add specific commands as staff members prove themselves
- Keep Trial Support permissions minimal
- Document any custom permission changes

### ❌ DON'T:
- Give Trial Support access to `ban` or `kick` commands
- Grant access to configuration commands (`setmodlog`, `setdefaultmute`) to support staff
- Forget to update permissions when promoting staff
- Give everyone `admin` preset permissions

---

## Common Scenarios

### Promoting Trial Support → Support
```
/cmdpermissions preset role:@Support preset:support
```
Remove their Trial Support role and assign Support role.

### Temporary Additional Permissions
```
/cmdpermissions add role:@Support commands:announce
```
Add specific commands without changing their preset.

### Emergency Restriction
```
/cmdpermissions remove role:@Support commands:kick,ban
```
Quickly remove dangerous commands if needed.

### Audit Permissions
```
/cmdpermissions list role:@Head Support
```
See exactly what a role can do.

---

## Available Presets

| Preset | Commands | Best For |
|--------|----------|----------|
| `trial_support` | 11 commands | New support staff |
| `support` | 22 commands | Full-time support |
| `head_support` | 33 commands | Support leadership |
| `moderator` | 20+ commands | Dedicated moderation team |
| `admin` | All commands | Server administrators |

---

## Troubleshooting

**"I can't use a command!"**
- Check if your role has permission: `/cmdpermissions list role:@YourRole`
- Ask an admin to add the command: `/cmdpermissions add role:@YourRole commands:commandname`

**"Permissions aren't working!"**
- Verify the role is assigned to the user
- Check if they have Admin permission (bypasses system)
- Ensure permissions were actually added: `/cmdpermissions list`

**"I want custom permissions!"**
- Start with a preset, then use `add`/`remove` to customize
- Document your changes so you remember what you modified

---

## Security Notes

🔒 **Only server owners and administrators can manage command permissions.**

🔒 **The command permission system does NOT override Discord's native permissions.** If someone can't view a channel due to Discord permissions, bot commands won't change that.

🔒 **Staff suspensions automatically prevent suspended staff from using commands** regardless of role permissions.

---

## Example Setup Script

Here's a complete setup for a typical support team:

```
# Set up Trial Support
/cmdpermissions preset role:@Trial Support preset:trial_support

# Set up Support
/cmdpermissions preset role:@Support preset:support

# Set up Head Support
/cmdpermissions preset role:@Head Support preset:head_support

# Verify everything
/cmdpermissions list role:@Trial Support
/cmdpermissions list role:@Support
/cmdpermissions list role:@Head Support
```

---

## Need Help?

If you need to customize permissions beyond these presets, you can manually add/remove commands. Remember that presets are just starting points - you can always fine-tune them to match your server's specific needs!

Contact your server owner or check `/cmdpermissions panel` for more information.
