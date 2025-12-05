# 🔍 Complete Feature Verification Guide

## 📋 Overview
This document provides a complete checklist of all bot features with verification steps to ensure everything works correctly.

---

## 💰 Payroll System

### ✅ Clock-In/Out System
**Features:**
- Staff can clock in on scheduled days
- UPT is awarded (+15 min per clock-in)
- Daily/weekly limits enforced
- Auto-break after inactivity
- Activity tracking for break detection

**Verification Steps:**
1. `/clockin` - Should successfully clock in (if scheduled)
2. Check message confirms "+15 min UPT"
3. Send messages to show activity tracking
4. Wait for auto-break minutes (default 10 min) without activity
5. Should auto-break after inactivity
6. Resume activity to end break
7. `/clockout` - Should successfully clock out with duration shown

**Expected Behavior:**
- ✅ Clock-in only works on scheduled days (or with approved request)
- ✅ +15 min UPT added to balance
- ✅ Auto-break triggers after config inactivity period
- ✅ Clock-out shows total duration and break time

---

### ✅ Pay Tracking (NEWLY FIXED)
**Features:**
- Bi-weekly pay calculation (last 14 days)
- Monthly pay calculation (current month)
- Historical monthly pay (last month)
- Pay multipliers applied
- Unpaid balance tracking

**Verification Steps:**
1. `/payroll viewbalance` - Check your pay summary
2. Should show:
   - **Last 14 Days (Bi-Weekly)**: Current 2-week total
   - **This Month**: December 2025 total
   - **Last Month**: November 2025 total
   - **Unpaid Balance**: All-time unpaid total

**Expected Behavior:**
- ✅ Shows actual bi-weekly/monthly totals, not cumulative
- ✅ Pay multiplier applied to all amounts
- ✅ Includes hours worked and shift count
- ✅ Historical data from previous month

**Admin Commands:**
- `/payroll calculate user: @user start_date: YYYY-MM-DD end_date: YYYY-MM-DD` - Create pay period
- `/payroll markpaid period_id: <id>` - Mark period as paid *(FIXED - now shows error if not found)*
- `/payroll unpaid user: @user` - View unpaid periods
- `/payroll history user: @user` - View payment history

---

### ✅ Pay Configuration
**Admin Commands:**
- `/payroll config hourly_rate: 15` - Set hourly pay rate
- `/payroll view` - View current configuration
- `/payroll enable` - Enable clock-in system
- `/payroll disable` - Disable clock-in system

**Verification Steps:**
1. `/payroll view` - Check current settings
2. Verify hourly rate, max hours/day, max days/week
3. Test enable/disable functionality

---

### ✅ Pay Multipliers
**Features:**
- User-specific multipliers (highest priority)
- Role-based multipliers
- Applied to all pay calculations

**Admin Commands:**
- `/payroll adjustpay target_type: user multiplier: 1.5 user: @user reason: "Promotion"` - Set user multiplier
- `/payroll adjustpay target_type: role multiplier: 1.25 role: @role reason: "Senior pay"` - Set role multiplier
- `/payroll listpay` - View all active multipliers
- `/payroll removepay target_type: user user: @user` - Remove multiplier

**Verification Steps:**
1. Set a multiplier for a user: `/payroll adjustpay`
2. Check `/payroll viewbalance` - Should show multiplier applied
3. Verify pay amounts reflect the multiplier

---

## 📅 Scheduling System

### ✅ Weekly Schedule Generation
**Features:**
- Automatic generation every Saturday at 6 PM
- Assigns 3-4 days per week based on availability
- Owner exclusion (you + joycemember)
- DM notifications to all staff
- Posted in staff logs channel

**Verification Steps:**
1. Wait for Saturday 6 PM OR use `/schedule generate` (owner only)
2. Check staff logs channel for schedule post
3. Verify staff receive DMs with personal schedules
4. Confirm owners (you + joycemember) are NOT in schedule

**Expected Behavior:**
- ✅ Schedule covers Sunday-Saturday week
- ✅ Each staff gets 3-4 random days
- ✅ Respects availability preferences
- ✅ Excludes owner IDs: 1272923881052704820, 840586296044421160

---

### ✅ Availability Preferences
**Commands:**
- `/schedule setavailability days: monday,wednesday,friday start_time: 10:00 end_time: 18:00` - Set preferences
- `/schedule myschedule` - View your personal schedule
- `/schedule view` - View full team schedule

**Verification Steps:**
1. Set availability preferences
2. Wait for next schedule generation
3. Verify you're scheduled on preferred days when possible

---

### ✅ Shift Management
**Commands:**
- `/schedule drop day: monday` - Drop a shift (first-come-first-served)
- `/schedule swap give_day: monday receive_day: wednesday target_user: @staff` - Swap with specific person

**Verification Steps:**
1. `/schedule drop day: monday` - Should broadcast to all staff
2. Another staff accepts - shift transfers
3. `/schedule swap` - Target user receives DM to accept/decline
4. If accepted, shifts swap in database

**Expected Behavior:**
- ✅ Dropped shifts can be picked up by anyone
- ✅ Swap requests require approval
- ✅ Both parties notified of results

---

### ✅ Schedule Enforcement
**Features:**
- Can only clock in on scheduled days
- Request-to-work system for unscheduled days
- Owner approval required
- Grace period until Sunday Dec 1

**Verification Steps:**
1. Try to `/clockin` on unscheduled day
2. Should show two buttons:
   - "📝 Request to Work Today" - Sends DM to owner
   - "Skip" - Cancel
3. Owner approves/denies via buttons in DM
4. If approved, staff can clock in

**Expected Behavior:**
- ✅ Blocks clock-in if not scheduled
- ✅ Request system allows exceptions
- ✅ Owners can approve/deny requests
- ✅ Grace period active until Sunday morning

---

## 💳 UPT System

### ✅ UPT Accrual
**How It Works:**
- Earn **15 minutes** per successful clock-in
- Accumulates over time
- Never expires

**Verification Steps:**
1. Clock in successfully
2. Check message: "✅ Clocked in successfully! (+15 min UPT)"
3. `/upt balance` - Verify balance increased by 15 min
4. `/upt history` - See transaction log

**Expected Behavior:**
- ✅ +15 min added every clock-in
- ✅ Balance displayed in hours and minutes
- ✅ History shows all transactions with timestamps

---

### ✅ UPT Deductions
**Automatic Deductions:**
- **Late clock-in**: Deducts minutes late (if enough UPT)
- **Missed shift**: Deducts 300 minutes (5 hours) if enough UPT
- **Protects from write-ups** if sufficient balance

**Verification Steps:**
1. **Test Late Clock-In:**
   - Be scheduled to work
   - Clock in late (e.g., 20 min after shift start)
   - Check if 20 min deducted from UPT
   - Should NOT receive write-up if covered

2. **Test Insufficient UPT (Late):**
   - Have less UPT than minutes late
   - Clock in late
   - Should receive standard write-up
   - Remaining UPT deducted

3. **Test Missed Shift with UPT:**
   - Be scheduled to work
   - Don't clock in
   - At 11:59 PM, cron job checks
   - If you have 300+ min UPT, it covers absence
   - Should NOT count as missed shift

4. **Test Missed Shift without UPT:**
   - Be scheduled to work
   - Have less than 300 min UPT
   - Don't clock in
   - At 11:59 PM, receives severe write-up
   - Counts as missed scheduled shift

**Expected Behavior:**
- ✅ UPT auto-deducts for lateness if available
- ✅ Write-up issued if insufficient UPT
- ✅ 300 min (5 hours) deducted for full missed shift
- ✅ Protection from penalties when UPT covers

---

### ✅ UPT Commands
**User Commands:**
- `/upt balance` - View current UPT balance
- `/upt history` - View transaction history

**Owner Commands:**
- `/upt adjust user: @user amount: 60 type: add reason: "Bonus"` - Manually adjust UPT
- `/upt adjust user: @user amount: 30 type: remove reason: "Correction"` - Remove UPT

**Verification Steps:**
1. `/upt balance` - Should show balance in hours/minutes
2. `/upt history` - Should show recent transactions with ✅/❌ icons
3. Owner adjusts UPT - User should see change reflected

---

## ⚠️ Write-Up & Demotion System

### ✅ Write-Up Issuance
**Types:**
- **Standard Write-Up**: Late without sufficient UPT
- **Severe Write-Up**: No-call no-show (missed shift without UPT)

**Automatic Triggers:**
1. Late clock-in without enough UPT → Standard write-up
2. Missed scheduled shift without UPT (checked at 11:59 PM) → Severe write-up

**Manual Commands (Owner Only):**
- `/attendance issue user: @user severity: standard reason: "Late without UPT"` - Issue write-up
- `/attendance writeups user: @user` - View user's write-ups
- `/attendance clear user: @user` - Clear all write-ups

**Verification Steps:**
1. **Auto Write-Up (Late):**
   - Have insufficient UPT
   - Clock in late
   - Should receive DM notification
   - `/attendance writeups` should show it

2. **Auto Write-Up (Missed Shift):**
   - Be scheduled, don't clock in, have insufficient UPT
   - At 11:59 PM, check for severe write-up
   - Should receive DM notification

3. **Manual Write-Up:**
   - Owner issues: `/attendance issue`
   - User receives DM immediately
   - Appears in `/attendance stats` and `/attendance writeups`

**Expected Behavior:**
- ✅ User notified via DM immediately
- ✅ Write-up count increases
- ✅ Appears in attendance stats
- ✅ Includes timestamp, severity, reason

---

### ✅ Automatic Demotion
**Triggers:**
- **3 write-ups total** (any combination of standard/severe)
- **2 missed scheduled shifts** (only shifts without UPT coverage)

**Demotion Tiers:**
```
Head Support → Support
Support → Trial Support
Trial Support → Member (removed from staff)
```

**Verification Steps:**
1. **3 Write-Up Test:**
   - User accumulates 3 write-ups
   - Should auto-demote on 3rd write-up
   - Role changed to lower tier
   - Write-ups cleared
   - Missed shifts cleared
   - User receives DM notification

2. **2 Missed Shift Test:**
   - User misses 2 scheduled shifts (without UPT)
   - Should auto-demote after 2nd miss
   - Same role change, clearing, notification

**Expected Behavior:**
- ✅ Demotion triggered at exactly 3 write-ups
- ✅ Demotion triggered at exactly 2 missed scheduled shifts
- ✅ Roles updated automatically
- ✅ Write-ups and missed shifts reset after demotion
- ✅ UPT balance PRESERVED (not cleared)
- ✅ User notified via DM with reason

---

### ✅ Attendance Stats
**Commands:**
- `/attendance stats` - View your attendance record
- `/attendance stats user: @user` - View another user's record (owner only)
- `/attendance writeups` - View your write-up details
- `/attendance report user: @user` - Detailed admin report (owner only)

**Verification Steps:**
1. `/attendance stats` - Should show:
   - Total write-ups
   - Missed scheduled shifts count
   - Current UPT balance
   - Warning if close to demotion

2. `/attendance writeups` - Should show:
   - List of all write-ups
   - Severity level
   - Reason
   - Timestamp

3. `/attendance report @user` (owner) - Should show:
   - Complete attendance overview
   - All write-ups with details
   - Missed shifts list
   - UPT balance and history
   - User thumbnail

---

## 🔄 Daily Automation (Cron Jobs)

### ✅ Missed Shift Check (11:59 PM Daily)
**What It Does:**
- Checks all scheduled staff for today
- Identifies who didn't clock in
- Deducts 300 min UPT if available, OR
- Issues severe write-up if insufficient UPT
- Sends DM notifications
- Records missed scheduled shift
- Triggers auto-demotion if threshold reached

**Verification Steps:**
1. Check bot logs at 11:59 PM for:
   ```
   🔍 Running daily missed shift check...
   ⚠️ User <@userId> missed their scheduled shift today!
   ```

2. Verify staff who missed shift receive:
   - DM notification if write-up issued
   - UPT deduction if they had enough
   - Missed shift recorded in database

3. Check `/attendance stats` for affected users

**Expected Behavior:**
- ✅ Runs automatically at 11:59 PM every day
- ✅ Only checks SCHEDULED shifts (not unscheduled days)
- ✅ UPT protection applied if available
- ✅ Write-ups issued if UPT insufficient
- ✅ Demotion triggered if 2nd missed shift

---

### ✅ Schedule Generation (6:00 PM Every Saturday)
**What It Does:**
- Generates schedules for upcoming Sunday-Saturday week
- Assigns 3-4 days per staff based on availability
- Excludes owners from schedule
- Posts to staff logs channel
- Sends DM to each staff member

**Verification Steps:**
1. Wait for Saturday 6:00 PM
2. Check bot logs:
   ```
   📋 Generating weekly schedules for guild...
   ✅ Schedule generated and posted
   ```

3. Verify:
   - Staff logs channel receives schedule embed
   - Each staff gets DM with personal schedule
   - Owners not included

---

### ✅ Activity Tracking & Auto-Break
**What It Does:**
- Tracks message activity while clocked in
- After configured inactivity (default 10 min), starts break
- When activity resumes, ends break
- Break time excluded from pay calculations

**Verification Steps:**
1. Clock in
2. Send messages to show activity
3. Stop activity for 10+ minutes
4. Bot should auto-break (check activity_tracker table)
5. Resume activity
6. Break should end automatically

**Expected Behavior:**
- ✅ Activity tracked per message sent
- ✅ Auto-break after inactivity period
- ✅ Break ends on activity resume
- ✅ Break duration excluded from shift pay

---

## 🔧 Owner/Admin Commands

### ✅ Payroll Management
- `/payroll config` - Set hourly rate, limits, auto-break time
- `/payroll calculate` - Create pay period for date range
- `/payroll markpaid period_id: <id>` - Mark period as paid *(FIXED)*
- `/payroll unpaid` - View all unpaid periods
- `/payroll history user: @user` - View payment history
- `/payroll adjustpay` - Set pay multipliers
- `/payroll removepay` - Remove pay multipliers
- `/payroll listpay` - View all multipliers
- `/payroll reset user: @user days: 30` - Reset user's hours
- `/payroll enable` / `/payroll disable` - Toggle system

### ✅ Attendance Management
- `/attendance issue user: @user severity: standard reason: "Late"` - Issue write-up
- `/attendance clear user: @user` - Clear all write-ups
- `/attendance report user: @user` - Detailed report
- `/upt adjust` - Manually adjust UPT balance

### ✅ Schedule Management
- `/schedule generate` - Manually generate schedule
- `/schedule view` - View current schedule
- Approve/deny work requests via DM buttons

---

## 🐛 Known Issues & Fixes Applied

### ✅ FIXED: markpaid not working
**Issue:** Command didn't show error if period not found
**Fix:** Now returns boolean and shows appropriate error message

### ✅ FIXED: Pay tracking showing cumulative totals
**Issue:** Only showed sum of all unpaid periods
**Fix:** Added bi-weekly, monthly, and last month calculations with multipliers applied

---

## 📊 Testing Checklist

Use this checklist to verify all features:

### Payroll ✓
- [ ] Clock in/out works
- [ ] +15 min UPT awarded per clock-in
- [ ] Daily/weekly limits enforced
- [ ] Auto-break after inactivity
- [ ] `/payroll viewbalance` shows bi-weekly/monthly totals
- [ ] `/payroll markpaid` works and shows errors
- [ ] Pay multipliers apply correctly

### Scheduling ✓
- [ ] Schedule generates Saturday 6 PM
- [ ] Owners excluded from schedule
- [ ] DMs sent to all staff
- [ ] Posted to staff logs
- [ ] Availability preferences respected
- [ ] Drop/swap shifts work
- [ ] Clock-in enforcement active (Sunday+)
- [ ] Request-to-work system functional

### UPT System ✓
- [ ] UPT earned on clock-in
- [ ] Auto-deducts for lateness (if available)
- [ ] Auto-deducts for missed shift (if available)
- [ ] Write-up issued if insufficient UPT
- [ ] `/upt balance` and `/upt history` work
- [ ] Manual adjustments work (owner)

### Write-Ups & Demotion ✓
- [ ] Standard write-up for late without UPT
- [ ] Severe write-up for missed shift without UPT
- [ ] User notified via DM
- [ ] 3 write-ups triggers demotion
- [ ] 2 missed shifts triggers demotion
- [ ] Roles update correctly
- [ ] Write-ups/missed shifts cleared after demotion
- [ ] UPT preserved after demotion
- [ ] `/attendance stats` shows correct info

### Daily Automation ✓
- [ ] 11:59 PM missed shift check runs
- [ ] Saturday 6 PM schedule generation runs
- [ ] Activity tracking works
- [ ] Auto-break after inactivity

---

## 🎯 Success Criteria

All features working if:
1. ✅ Clock-in system enforces schedule
2. ✅ UPT accrues and protects from penalties
3. ✅ Write-ups issued automatically when appropriate
4. ✅ Demotion triggers at 3 write-ups or 2 missed shifts
5. ✅ Schedule generates every Saturday
6. ✅ Daily cron checks missed shifts at 11:59 PM
7. ✅ Pay tracking shows bi-weekly/monthly totals
8. ✅ markpaid command works correctly
9. ✅ All commands respond appropriately
10. ✅ DM notifications sent for all actions

---

*Last Updated: December 5, 2025*
*All fixes applied and ready for production testing*
