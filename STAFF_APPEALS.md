# Staff Appeal System

## Overview
Staff members who have been suspended or permanently removed can appeal their suspension directly through Discord DMs using the `/appeal` command.

## How It Works

### For Staff Members

#### Submitting an Appeal

1. **Open a DM with the bot** (or use the command in the server)
2. **Use the command:**
   ```
   /appeal type:Staff Suspension/Removal Appeal reason:[Your detailed explanation]
   ```

3. **Write a detailed explanation** including:
   - Why you believe the suspension was unfair or should be reversed
   - What you've learned from the situation
   - Steps you'll take to prevent future issues
   - Any context or mitigating circumstances
   - Your commitment to following server rules

4. **Submit and wait** - You'll receive a confirmation that your appeal was submitted

#### Example Appeal
```
/appeal type:Staff Suspension/Removal Appeal reason:I acknowledge that I made mistakes by being inactive during my last few shifts and not communicating with the team. I've since reorganized my schedule to ensure I can dedicate proper time to my staff duties. I understand the importance of reliability and communication in a support role. I'm committed to being more proactive and would appreciate the opportunity to prove myself again as Trial Support. I've reviewed all server policies and am ready to follow them strictly.
```

### Appeal Notifications

When you submit an appeal:
- ✅ **You get confirmation** the appeal was received
- 📨 **Admins are notified** in the mod log channel
- 📧 **Owner receives DM** with appeal details
- ⏳ **Staff reviews** your explanation

### Appeal Decisions

You'll receive a DM with the decision:

**If Approved:** ✅
```
✅ Your appeal has been approved! (Appeal #123)

Action: Your staff roles have been restored.

Note: [Admin's message about expectations]
```

**If Denied:** ❌
```
❌ Your appeal has been denied. (Appeal #123)

Note: [Admin's explanation]
```

---

## For Administrators

### Viewing Appeals

Use `/appeals view` to see all pending appeals:

```
📨 Pending Appeals

Appeal #123 - staff_suspension
User: @StaffMember
Reason: [Their detailed explanation]
Submitted: 11/10/2025, 3:45 PM

Appeal #124 - ban
User: @User2
Reason: [Their explanation]
Submitted: 11/10/2025, 4:12 PM
```

### Reviewing Appeals

#### Approve an Appeal
```
/appeals approve id:123 note:Welcome back. Please ensure better communication.
```

**What happens:**
- ✅ Staff member's **original roles are restored**
- ✅ Suspension is marked as **resolved**
- ✅ Staff member receives **approval notification**
- ✅ Mod log gets **approval record**

#### Deny an Appeal
```
/appeals deny id:123 note:Need to see more time has passed and behavior improvement.
```

**What happens:**
- ❌ No roles are restored
- ❌ Suspension remains on record
- ❌ Staff member receives **denial notification**
- ❌ Can resubmit after 12 hours

### Appeal Notifications (Admin View)

When a staff member submits an appeal, admins receive:

**In Mod Log Channel:**
```
📨 New Appeal Submitted
@StaffMember has submitted a staff suspension appeal.

Appeal ID: #123
User: @StaffMember
Type: Staff Suspension
Reason/Explanation: [Full detailed explanation from staff member]

Use /appeals approve id:123 or /appeals deny id:123
```

**Owner DM:**
Same notification sent to owner for immediate awareness.

---

## Features

### ✅ Works in DMs
Staff can submit appeals privately via DMs with the bot

### ⏰ Rate Limiting
- One appeal per type every 12 hours
- Prevents spam
- Allows resubmission after cooling period

### 📝 Detailed Explanations
Staff must provide detailed reasoning, not just "Please unban me"

### 🔗 Linked to Suspension
Appeals automatically link to the user's suspension record

### 📊 Full History
All appeals tracked with:
- Submission date
- Appeal reason
- Review decision
- Reviewer
- Review notes

### 🔔 Multi-Channel Notifications
- Staff member gets confirmation
- Mod log channel notified
- Owner receives DM
- Decision sent to staff member

---

## Integration

### With Suspension System
- Appeals automatically detect active/past suspensions
- Links appeal to specific suspension record
- Restores **original roles** (not demoted roles)
- Example: Head Support suspended → Appeals → Gets Head Support back (not Support)

### With Existing Appeals
Staff suspension appeals use the same system as ban/mute/blacklist appeals:
- Same commands (`/appeal`, `/appeals`)
- Same review process
- Same history tracking
- Unified admin interface

---

## Rules & Best Practices

### For Staff Submitting Appeals

**DO:**
- ✅ Be honest and take responsibility
- ✅ Explain what you learned
- ✅ Show commitment to improvement
- ✅ Provide context and details
- ✅ Be respectful and professional

**DON'T:**
- ❌ Make excuses without accountability
- ❌ Be rude or entitled
- ❌ Spam multiple appeals
- ❌ Write one-sentence appeals
- ❌ Blame others without acknowledging your role

### For Admins Reviewing Appeals

**Consider:**
- Time since suspension
- Severity of original offense
- Staff member's history
- Quality of appeal explanation
- Behavior since suspension
- Server's current needs

**Best Practices:**
- Review appeals promptly (within 24-48 hours)
- Provide constructive feedback in notes
- Be consistent with similar cases
- Document decisions clearly
- Give second chances when warranted
- Maintain firm boundaries for serious violations

---

## Example Scenarios

### Scenario 1: Trial Support Auto-Removed (3rd Warning)

**Staff Member:**
- Trial Support warned 3 times
- Auto-suspended 7 days
- After suspension: Permanent removal
- Must appeal to return

**Appeal Process:**
1. Waits for suspension to end
2. Submits detailed appeal explaining growth
3. Admin reviews, sees improved behavior
4. Approved → Gets Trial Support role back
5. Fresh start with clear expectations

### Scenario 2: Head Support Suspended Manually

**Staff Member:**
- Head Support manually suspended 14 days for policy violation
- After suspension: Would become Support
- Decides to appeal during suspension

**Appeal Process:**
1. Submits appeal explaining circumstances
2. Admin reviews, decides suspension was harsh
3. Approved → Cancels suspension early
4. Gets Head Support role restored immediately
5. No demotion applied

### Scenario 3: Support Suspended, Appeal Denied

**Staff Member:**
- Support suspended for multiple issues
- After 7 days, becomes Trial Support
- Submits immediate appeal

**Appeal Process:**
1. Submits brief, excuse-filled appeal
2. Admin reviews, sees no accountability
3. Denied with note explaining why
4. Must wait 12 hours to resubmit
5. Can try again with better explanation

---

## Commands Reference

### `/appeal`
**Available to:** Everyone (including in DMs)
**Rate Limit:** 1 per 12 hours per type

**Options:**
- `type`: Staff Suspension/Removal Appeal
- `reason`: Detailed explanation (required)

### `/appeals view`
**Available to:** Admins
**Shows:** All pending appeals with details

### `/appeals approve`
**Available to:** Admins
**Options:**
- `id`: Appeal ID number
- `note`: Optional message to staff member

**Actions:**
- Restores original staff roles
- Resolves suspension
- Notifies staff member
- Logs to mod channel

### `/appeals deny`
**Available to:** Admins
**Options:**
- `id`: Appeal ID number
- `note`: Optional explanation

**Actions:**
- Does not restore roles
- Notifies staff member
- Logs decision

---

## FAQ

**Q: Can I appeal while still suspended?**
A: Yes! You can submit an appeal at any time, even during an active suspension.

**Q: What if I was permanently removed as Trial Support?**
A: You can still appeal. If approved, you'll get your Trial Support role back.

**Q: How long until I hear back?**
A: Admins typically review appeals within 24-48 hours. Check your DMs for the decision.

**Q: Can I appeal multiple times?**
A: Yes, but you must wait 12 hours between submissions. Use this time to write a better appeal.

**Q: What roles do I get back if approved?**
A: Your **original roles** from before the suspension. No demotion is applied.

**Q: Do I need to appeal if my suspension time is over?**
A: If you were permanently removed (Trial Support), yes. Otherwise, you'll automatically get demoted roles when suspension ends.

**Q: Can I see my appeal history?**
A: Admins can see your history with `/appealhistory user:@you`. Ask an admin if you need this information.

**Q: What happens to my suspension record if approved?**
A: The suspension record remains (for tracking) but is marked as resolved. Your roles are fully restored.

---

## Technical Details

### Database
- Appeals stored in `appeals` table
- `appeal_type`: 'staff_suspension'
- `suspension_id`: Links to suspension record
- Full history maintained

### Permissions
- Anyone can submit appeals (including in DMs)
- Only admins can review (`hasCommandAccess` check)
- Owner always notified via DM

### Notifications
- Mod log channel (if configured)
- Owner DM (if `OWNER_USER_ID` set)
- Staff member DM (on submission and decision)

---

## Setup Requirements

1. **Configure mod log channel:**
   ```
   /setmodlog channel:#mod-log
   ```

2. **Set owner ID in .env:**
   ```
   OWNER_USER_ID=your_discord_user_id
   ```

3. **Ensure bot has DM permissions**
   - Users must allow DMs from server members
   - Bot needs ability to send DMs

4. **Grant admin access to reviewers**
   - Use `/cmdpermissions` to configure who can review appeals

---

This system provides fair, transparent, and efficient staff appeal handling with complete tracking and accountability.
