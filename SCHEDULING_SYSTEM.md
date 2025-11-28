# Staff Scheduling System

## Overview
Comprehensive staff scheduling system with automatic weekly schedule generation, shift swapping, and schedule enforcement.

## Features

### 1. Automatic Weekly Schedule Generation
Every Sunday at 6 PM, the bot automatically generates schedules for the following week.

**How It Works:**
- Each staff member gets 3-4 random days (randomized for fairness)
- Days are assigned based on staff availability preferences
- Schedule considers workload balance across all days
- Days are spread out to avoid consecutive work periods when possible

**Schedule Distribution:**
- Posted to staff logs channel with full weekly view
- Individual DMs sent to each staff member with their personal schedule
- Clear, easy-to-read format with emoji day indicators

### 2. Availability Preferences
Staff can set their preferred working days and times.

**Command:** `/schedule setavailability`

**Parameters:**
- `days`: Comma-separated list (e.g., "monday,wednesday,friday")
- `start_time`: Preferred start time in HH:MM format (e.g., "09:00")
- `end_time`: Preferred end time in HH:MM format (e.g., "17:00")

**Example:**
```
/schedule setavailability
  days: monday,tuesday,thursday,friday
  start_time: 10:00
  end_time: 18:00
```

The bot will prioritize these preferences when generating schedules, but may assign other days if needed for balance.

### 3. Schedule Viewing

**View Full Schedule:** `/schedule view`
- Options: current week or next week
- Shows which staff are working each day
- Accessible to all staff

**View Personal Schedule:** `/schedule myschedule`
- Shows only your assigned days
- Displays week date range
- Reminds you about swap/drop options

### 4. Shift Swapping System

#### Drop a Shift
**Command:** `/schedule drop`

Release a shift for anyone to pick up on a first-come, first-served basis.

**How It Works:**
1. You drop a day you're scheduled for
2. All other staff members get a DM notification
3. First person to accept gets the shift
4. Others get notified it's been picked up
5. Schedule updates automatically

**Example:**
```
/schedule drop
  day: monday
```

#### Swap with Specific Person
**Command:** `/schedule swap`

Request to trade shifts with a specific staff member.

**Parameters:**
- `give_day`: Day you want to give away
- `receive_day`: Day you want in return
- `target_user`: Staff member to swap with

**How It Works:**
1. You send swap request to specific person
2. They get DM with accept/decline buttons
3. If accepted: Both schedules update automatically
4. If declined: You can try with someone else or drop the shift

**Example:**
```
/schedule swap
  give_day: monday
  receive_day: wednesday
  target_user: @JohnDoe
```

**Swap Process:**
- Target user receives DM with clear details
- They see what day they'd give and what they'd receive
- Accept/decline with button click
- Both parties notified of outcome
- Database automatically updates schedules

### 5. Schedule Enforcement

#### Clock-In Protection
Staff can **only** clock in on their scheduled days.

**What Happens When Not Scheduled:**
If you try to clock in on an unscheduled day:
1. Bot shows you're not scheduled
2. Two options appear:
   - **Request to Work Today**: Sends request to owner
   - **Skip**: Dismisses the message

#### Work Request System
When staff request to work on an unscheduled day:

**For Staff:**
1. Click "Request to Work Today" button
2. Request sent to owner immediately
3. Receive DM when owner responds
4. If approved: Can now clock in
5. If denied: Must wait for scheduled day

**For Owner:**
1. Receive DM with staff's request
2. See clear details: who, what date
3. Two buttons: Approve or Deny
4. Staff automatically notified of your decision
5. If approved: Staff can clock in immediately

**Request Tracking:**
- All requests stored in database
- Can see who requested, when, and decision
- Prevents duplicate requests for same day
- Approval valid only for requested day

### 6. Owner Controls

**Manual Schedule Generation:** `/schedule generate`
- Manually trigger schedule generation for next week
- Useful if you need to regenerate early
- Only available to bot owner

**Requirements:**
- Staff must have set availability preferences first
- At least one staff member with preferences needed

## Setup & Configuration

### Environment Variables
Add to `.env`:
```env
OWNER_IDS=your_discord_user_id
STAFF_LOGS_CHANNEL_ID=channel_id_for_schedules
```

### Initial Setup Steps

1. **Staff Set Availability**
   - Each staff member runs `/schedule setavailability`
   - Sets their preferred days and times
   - Must be done before first schedule generation

2. **Wait for Sunday 6 PM**
   - Bot automatically generates first schedule
   - Posted to staff logs channel
   - DMs sent to all staff

3. **Or Generate Manually**
   - Owner can run `/schedule generate` anytime
   - Generates schedule for upcoming week

## Schedule Generation Algorithm

### Fairness & Balance
- Each staff gets 3-4 days (randomized)
- Preferred days prioritized first
- Remaining slots filled from less-crowded days
- Maximum 3 staff per day (configurable)
- Days spread out when possible

### Priority System
1. **Staff with fewer preferences** scheduled first (more flexible)
2. **Preferred days** assigned before other days
3. **Less crowded days** chosen to balance workload
4. **Consecutive days avoided** when possible

### Example Generation
```
Staff A prefers: Mon, Wed, Fri (gets 3 days)
Staff B prefers: Tue, Thu, Sat (gets 4 days)
Staff C prefers: Mon, Tue, Wed (gets 3 days)

Possible Output:
Staff A: Mon, Wed, Fri
Staff B: Tue, Thu, Sat, Sun
Staff C: Mon, Tue, Thu
```

## Database Schema

### staff_availability
Stores preferred days and times for each staff member.
- `guild_id`: Server ID
- `user_id`: Staff member Discord ID
- `preferred_days`: JSON array of day names
- `preferred_times`: JSON object with start/end times
- `updated_at`: Last update timestamp

### staff_schedules
Stores weekly schedule assignments.
- `guild_id`: Server ID
- `user_id`: Staff member Discord ID
- `week_start`: Monday date (YYYY-MM-DD)
- `assigned_days`: JSON array of assigned days
- `created_at`: Schedule creation timestamp

### shift_swap_requests
Tracks all swap/drop requests.
- `guild_id`: Server ID
- `requester_id`: Who requested the swap
- `target_user_id`: Who it's for (NULL for drops)
- `request_type`: 'drop' or 'swap'
- `day_to_give`: Day being given away
- `day_to_receive`: Day wanted in return (swaps only)
- `week_start`: Which week
- `status`: 'pending', 'accepted', 'declined', 'cancelled'
- `accepted_by`: Who accepted (for drops)
- `created_at`, `responded_at`: Timestamps

### work_requests
Tracks unscheduled work requests.
- `guild_id`: Server ID
- `user_id`: Staff member requesting
- `requested_date`: Date they want to work (YYYY-MM-DD)
- `status`: 'pending', 'approved', 'denied'
- `owner_response`: Optional note from owner
- `created_at`, `responded_at`: Timestamps

## Usage Examples

### Setting Up for the First Time

**Step 1 - Staff sets availability:**
```
/schedule setavailability
  days: monday,wednesday,friday
  start_time: 10:00
  end_time: 18:00
```

**Step 2 - Owner generates schedule (optional):**
```
/schedule generate
```

**Step 3 - Staff views their schedule:**
```
/schedule myschedule
```

### Dropping a Shift

**Scenario:** Can't work Monday, want to drop it

```
/schedule drop day: monday
```

**Result:**
- All staff get DM: "Shift available - Monday"
- First to click "Pick Up Shift" gets it
- Your schedule updates: Monday removed
- Their schedule updates: Monday added

### Swapping Shifts

**Scenario:** Prefer Wednesday instead of Monday, trade with Sarah

```
/schedule swap
  give_day: monday
  receive_day: wednesday
  target_user: @Sarah
```

**Result:**
- Sarah gets DM with swap details
- She clicks Accept or Decline
- If accepted: You get Wednesday, she gets Monday
- Both schedules update automatically

### Requesting to Work (Unscheduled Day)

**Scenario:** Try to clock in on Tuesday, but you're not scheduled

1. Run `/clockin`
2. Bot says: "You are not scheduled today"
3. Click "Request to Work Today"
4. Owner gets DM with your request
5. Owner clicks Approve or Deny
6. You get DM with their decision
7. If approved: Run `/clockin` again successfully

## Scheduling Tips

### For Staff
- Set realistic availability preferences
- Update availability if schedule changes
- Use swap feature instead of just dropping
- Request specific people when possible (faster)
- Check schedule each Sunday evening

### For Owners
- Respond to work requests promptly
- Monitor staff logs channel for schedule posts
- Can regenerate schedule if needed
- Approve emergency work requests when reasonable
- Consider staff preferences when possible

## Automation Details

### Weekly Generation (Sunday 6 PM)
- Automatically runs every Sunday
- Generates schedule for following week (Monday-Sunday)
- Posts to configured staff logs channel
- Sends DM to each scheduled staff member
- Logs generation activity to console

### Schedule Format
```
📅 Weekly Staff Schedule
Week of MM/DD/YYYY - MM/DD/YYYY

📘 Monday
@User1, @User2, @User3

📗 Tuesday
@User2, @User4

📙 Wednesday
@User1, @User3, @User5

... (continues for each day)
```

### Personal DM Format
```
📅 Your Work Schedule
Week of MM/DD/YYYY - MM/DD/YYYY

You are scheduled to work 4 day(s) this week:

🗓️ Your Days
📘 Monday
📙 Wednesday
📔 Friday
📒 Sunday

💡 Need to Make Changes?
• /schedule swap - Request to swap with another staff
• /schedule drop - Drop a shift for others to pick up
• /schedule view - View the full weekly schedule

You can only clock in on your scheduled days
```

## Troubleshooting

**Issue: Not getting scheduled**
- Check if you set availability: `/schedule setavailability`
- Verify preferences are realistic
- Ask owner to regenerate: `/schedule generate`

**Issue: Can't clock in**
- Check if today is your scheduled day: `/schedule myschedule`
- If not scheduled, use work request feature
- Wait for owner approval

**Issue: Swap request not received**
- Verify target user has DMs enabled
- Try dropping shift instead for open pickup
- Contact them directly as backup

**Issue: Schedule not posted**
- Verify `STAFF_LOGS_CHANNEL_ID` is set correctly
- Check bot has permission to post in channel
- Owner can manually generate: `/schedule generate`

**Issue: No one picking up dropped shift**
- Staff might not have DMs enabled
- Try swapping with specific person instead
- Ask in staff channel

## Future Enhancements

Potential additions:
- [ ] Recurring availability patterns (same each week)
- [ ] Blackout dates (vacation/unavailable periods)
- [ ] Shift preferences by time of day
- [ ] Minimum/maximum days per week per person
- [ ] Trading system with approval chains
- [ ] Schedule statistics and analytics
- [ ] Export schedules to calendar format
- [ ] SMS notifications for schedule changes
- [ ] Shift reminder notifications
- [ ] Late/no-show tracking integration
