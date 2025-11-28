# 📋 Attendance & UPT System Documentation

## Overview
Advanced attendance tracking system with UPT (Unpaid Time Off), write-ups, and automatic demotion - similar to Amazon's attendance policy.

---

## 🎯 Key Features

### 1. **UPT (Unpaid Time Off) System**
- Staff earn UPT for showing up to work
- UPT automatically covers absences and lateness
- Prevents demotion if you have enough UPT

### 2. **Write-up System**
- 3 write-ups = automatic demotion
- Write-ups issued for unexcused absences/lateness
- Cleared after demotion

### 3. **Smart Demotion Logic**
- Only demote for missing **SCHEDULED** shifts (not unscheduled days)
- 2 missed scheduled shifts = demotion (if no UPT)
- 3 write-ups = demotion
- UPT can prevent both

### 4. **Owner Exclusion**
- Owners (you + joycemember) are **NOT** added to schedules
- Can clock in/out freely without schedule restrictions

---

## 💳 UPT (Unpaid Time Off)

### How You Earn UPT
- **+15 minutes** for every successful clock-in
- Accumulates slowly over time
- Balance tracked per user

### How UPT is Used

**Late Clock-In:**
- If you're 20 minutes late and have 50 minutes UPT:
  - Auto-deducts 20 minutes
  - You have 30 minutes remaining
  - No write-up issued

- If you're 30 minutes late but only have 15 minutes UPT:
  - Not enough UPT
  - **Write-up issued** (counts toward 3)
  - Warning about demotion risk

**Missed Scheduled Shift:**
- Full shift absence = 300 minutes (5 hours) of UPT
- If you have 300+ minutes:
  - UPT covers the absence
  - No write-up, no missed shift count
- If you don't have enough UPT:
  - Counts as missed shift
  - **Write-up issued (severe)**
  - Counts toward 2-strike demotion

### Checking Your UPT
*Command to be added: `/upt balance`*

---

## ⚠️ Write-up System

### How You Get Write-ups

1. **Late without UPT** (Standard)
   - Clocked in late
   - Insufficient UPT to cover lateness

2. **No-call No-show** (Severe)
   - Scheduled to work but didn't show up
   - Insufficient UPT to cover full shift (480 min)

### Write-up Consequences

```
1 write-up → ⚠️ Warning
2 write-ups → ⚠️⚠️ Final warning
3 write-ups → 📉 Automatic demotion
```

### Viewing Write-ups
*Command to be added: `/writeups view`*

---

## 📉 Demotion System

### When You Get Demoted

**Option 1: Missed Scheduled Shifts**
- Miss 2+ **SCHEDULED** shifts without UPT coverage
- Being absent on unscheduled days does NOT count

**Option 2: Write-ups**
- Accumulate 3 write-ups

### Demotion Tiers
```
Head Support → Support
Support → Trial Support
Trial Support → Member (removed)
```

### After Demotion
- ✅ All write-ups cleared
- ✅ All missed shift counts reset
- ✅ Fresh start
- ⚠️ UPT balance carries over (not reset)

---

## 🗓️ Schedule Enforcement

### Scheduled Days
- You can ONLY clock in on days you're scheduled
- OR if you have an approved work request
- Missing a scheduled shift = consequences (see above)

### Unscheduled Days
- Being inactive on unscheduled days = **NO PENALTY**
- These are treated as your days off
- No write-ups, no demotion risk

### Example
```
Your schedule: Monday, Wednesday, Friday

✅ You're offline Tuesday → NO PENALTY (not scheduled)
✅ You're offline Thursday → NO PENALTY (not scheduled)
❌ You miss Monday → PENALTY (you were scheduled)
```

---

## 🚫 Owner Exclusion

**Excluded from scheduling:**
- Your ID: `1272923881052704820`
- joycemember ID: `1436743881216897025`

**What this means:**
- You won't appear in weekly schedules
- Can clock in any day without restrictions
- No schedule enforcement for owners
- Still tracked for payroll purposes

---

## 📊 Database Tables

### `upt_balances`
- Stores current UPT balance per user
- Tracks last accrual date

### `upt_transactions`
- History of all UPT earned/used
- Reasons: accrual, late, absence

### `staff_writeups`
- All write-ups issued
- Severity levels (standard/severe)
- Issued by, reason, date

### `missed_shifts`
- Tracks only SCHEDULED shift absences
- Whether UPT covered it
- Used for 2-strike demotion rule

---

## 🔄 Automatic Processes

### Daily (End of Day)
- Check who was scheduled today
- Find who didn't clock in
- Auto-process missed shifts:
  - Deduct UPT if available (480 min)
  - Issue write-up if insufficient UPT
  - Track missed shift count
  - Auto-demote if threshold reached

### On Clock-In
- Award 15 minutes of UPT
- Check if late → auto-deduct UPT or issue write-up

---

## 💡 Examples

### Example 1: Good Attendance with UPT
```
Day 1: Clock in on time → +15 min UPT (15 total)
Day 2: Clock in on time → +15 min UPT (30 total)
Day 3: 20 min late → -20 min UPT (10 remaining)
Day 4: Clock in on time → +15 min UPT (25 total)
Status: ✅ No write-ups, no penalties
```

### Example 2: Insufficient UPT
```
Day 1: Clock in on time → +15 min UPT (15 total)
Day 2: Miss scheduled shift → Need 480 min, only have 15
Result: ❌ Write-up issued (1/3), Missed shift (1/2)

Day 3: Clock in on time → +15 min UPT (30 total)
Day 4: 45 min late → Need 45 min, only have 30
Result: ❌ Write-up issued (2/3)

Day 5: Miss scheduled shift again
Result: 📉 DEMOTED (2 missed shifts)
```

### Example 3: Write-up Demotion
```
Week 1: Late without UPT → Write-up 1/3
Week 2: Late without UPT → Write-up 2/3  
Week 3: Late without UPT → Write-up 3/3
Result: 📉 DEMOTED (3 write-ups)
```

---

## 🎮 Commands (To Be Implemented)

### For Staff
- `/upt balance` - Check your UPT balance
- `/upt history` - See UPT transaction history
- `/writeups view` - See your write-ups
- `/attendance stats` - View your attendance record

### For Owners/Admins
- `/writeup issue @user <reason>` - Manually issue write-up
- `/writeup clear @user` - Clear all write-ups
- `/upt adjust @user <minutes>` - Manually adjust UPT
- `/attendance report @user` - View detailed attendance report

---

## ⚙️ Configuration

### UPT Accrual Rate
**Current:** 15 minutes per shift
**Location:** `attendanceTracking.ts` → `accrueUPT()`

### Full Shift Duration
**Current:** 300 minutes (5 hours)
**Location:** `attendanceTracking.ts` → `FULL_SHIFT_MINUTES`

### Demotion Thresholds
- **Missed shifts:** 2
- **Write-ups:** 3

### Owner IDs
**Location:** `scheduling.ts` → `generateWeeklySchedule()`
```typescript
const OWNER_IDS = ['1272923881052704820', '1436743881216897025'];
```

---

## 🔧 Integration Points

### Called on Clock-In
```typescript
import { handleClockIn, handleLateClockIn } from './services/attendanceTracking';

// On successful clock-in
handleClockIn(guildId, userId);

// If late (e.g., 25 minutes)
await handleLateClockIn(guildId, userId, 25, client);
```

### Called Daily (Cron Job)
```typescript
import { checkMissedShiftsForToday } from './services/attendanceTracking';

// Run at end of each day (e.g., 11:59 PM)
await checkMissedShiftsForToday(guildId, client);
```

---

## 📝 Notes

- UPT balance persists even after demotion (not reset)
- Write-ups and missed shifts are cleared after demotion
- Owners never appear in schedules or face enforcement
- Only SCHEDULED absences count toward demotion
- System automatically handles all enforcement

---

## 🚀 Next Steps

1. Integrate clock-in system with `handleClockIn()` and `handleLateClockIn()`
2. Add daily cron job for `checkMissedShiftsForToday()`
3. Create commands for viewing UPT/write-ups
4. Test with sample scenarios
5. Deploy to production
