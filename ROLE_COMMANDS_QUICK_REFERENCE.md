# Staff Role Commands - Quick Reference

## Setup Commands

```bash
# Apply presets to your staff roles
/cmdpermissions preset role:@Trial Support preset:trial_support
/cmdpermissions preset role:@Support preset:support
/cmdpermissions preset role:@Head Support preset:head_support
```

---

## Command Breakdown by Role

### 🟢 Trial Support (11 Commands)
```
ticket, mute, unmute, warn, warns, history, case, cases,
supportstart, supportend, whosonduty
```

**Purpose:** Entry-level support with basic moderation tools

---

### 🔵 Support (22 Commands)
```
Trial Support commands +
kick, clearwarn, supportaddhelper, supportrate, supportstats,
appeals, appealhistory, remind, reminders, cancelreminder, updatecase
```

**Purpose:** Full-time support with expanded capabilities

---

### 🟣 Head Support (33 Commands)
```
Support commands +
ban, unban, addrole, removerole, purge, announce,
suspendstaff, cancelsuspension, suspensions,
getdefaultmute, getquestiontimeout, getmodlog,
tempchannels, listresponserules
```

**Purpose:** Support leadership with team management authority

---

## Command Categories

### Basic Moderation (Trial Support+)
- `mute` / `unmute` - Temporary user timeout
- `warn` - Issue warnings
- `warns` - View warning history
- `history` - View moderation history
- `case` / `cases` - View moderation cases

### Advanced Moderation (Support+)
- `kick` - Remove users from server
- `clearwarn` - Remove warnings

### High-Level Moderation (Head Support+)
- `ban` / `unban` - Permanent removal/restoration
- `purge` - Bulk delete messages

### Support Operations (All Staff)
- `ticket` - Ticket system management
- `supportstart` / `supportend` - Clock in/out
- `whosonduty` - View active support staff

### Support Management (Support+)
- `supportaddhelper` - Add helpers to sessions
- `supportrate` - Rate support quality
- `supportstats` - View performance metrics

### Appeals (Support+)
- `appeals` - Review user appeals
- `appealhistory` - View appeal records

### Staff Management (Head Support Only)
- `suspendstaff` - Suspend staff members
- `cancelsuspension` - Remove suspensions
- `suspensions` - View active suspensions

### Server Management (Head Support Only)
- `addrole` / `removerole` - Manage user roles
- `announce` - Official announcements
- `tempchannels` - Manage temp channels

### Configuration View (Head Support Only)
- `getdefaultmute` - View mute settings
- `getquestiontimeout` - View timeout settings
- `getmodlog` - View modlog configuration
- `listresponserules` - View automated responses

### Organization (Support+)
- `remind` / `reminders` / `cancelreminder` - Set follow-ups
- `updatecase` - Edit moderation cases

---

## Permission Philosophy

### Trial Support
**Philosophy:** Can handle tickets and basic moderation, but cannot make permanent changes. Perfect for learning the ropes.

**Can Do:**
- ✅ Mute disruptive users (temporary)
- ✅ Warn rule breakers
- ✅ Handle support tickets
- ✅ Track their support hours

**Cannot Do:**
- ❌ Kick or ban users
- ❌ Manage other staff
- ❌ Change server settings
- ❌ Delete large amounts of messages

---

### Support
**Philosophy:** Trusted full-time staff who handle complex issues and can review appeals. Can kick but not ban.

**Can Do:**
- ✅ Everything Trial Support can do
- ✅ Kick problematic users
- ✅ Review and process appeals
- ✅ Clear warnings when appropriate
- ✅ Update case information
- ✅ Set reminders for follow-ups

**Cannot Do:**
- ❌ Ban users (escalate to Head Support)
- ❌ Suspend other staff members
- ❌ Make server announcements
- ❌ Manage roles

---

### Head Support
**Philosophy:** Leadership with full authority over support operations and team management. The "boss" of the support team.

**Can Do:**
- ✅ Everything Support can do
- ✅ Ban and unban users
- ✅ Suspend staff for violations
- ✅ Manage user roles
- ✅ Make official announcements
- ✅ View all server configurations
- ✅ Manage temporary channels

**Cannot Do:**
- ❌ Change server configurations (settings like mute duration, modlog channel)
- ❌ Modify automod rules
- ❌ Bulk moderation actions (bulkban, bulkkick)

---

## Examples

### Promoting Trial Support to Support
1. Remove Trial Support role
2. Add Support role
3. Permissions automatically update (they now have 22 commands instead of 11)

### Temporarily Limiting Head Support
```bash
# Remove ban permission temporarily
/cmdpermissions remove role:@Head Support commands:ban,unban
```

### Giving Trial Support Extra Permission
```bash
# Let them kick users if they're doing well
/cmdpermissions add role:@Trial Support commands:kick
```

### Checking What Someone Can Do
```bash
/cmdpermissions list role:@Support
```

---

## Quick Comparison Table

| Command | Trial Support | Support | Head Support |
|---------|--------------|---------|--------------|
| `ticket` | ✅ | ✅ | ✅ |
| `mute`/`unmute` | ✅ | ✅ | ✅ |
| `warn` | ✅ | ✅ | ✅ |
| `kick` | ❌ | ✅ | ✅ |
| `ban` | ❌ | ❌ | ✅ |
| `appeals` | ❌ | ✅ | ✅ |
| `suspendstaff` | ❌ | ❌ | ✅ |
| `announce` | ❌ | ❌ | ✅ |
| `addrole` | ❌ | ❌ | ✅ |
| `purge` | ❌ | ❌ | ✅ |

---

## Common Questions

**Q: Why can't Support ban users?**
A: Bans are permanent and serious. Only Head Support (leadership) should have this power. Support can kick users (which is reversible) and escalate to Head Support for bans.

**Q: Why can Head Support view but not change settings?**
A: Configuration commands (`setmodlog`, `setdefaultmute`) should only be accessible to Admins/Owner. Head Support can *view* settings to understand how the bot works, but can't change them.

**Q: Can I customize these?**
A: Yes! These are presets. Use `/cmdpermissions add` or `/cmdpermissions remove` to customize. Just be careful not to give too much power to lower roles.

**Q: What if Trial Support needs kick temporarily?**
A: Just add it: `/cmdpermissions add role:@Trial Support commands:kick`
Then remove it later: `/cmdpermissions remove role:@Trial Support commands:kick`

**Q: Do permissions stack with Discord roles?**
A: No. If someone has both Trial Support and Support roles, they get commands from BOTH. But the bot's command system only checks if at least one role has permission.

---

## Need the Full Guide?

See `STAFF_ROLE_PERMISSIONS.md` for the complete documentation with setup examples, best practices, and troubleshooting.
