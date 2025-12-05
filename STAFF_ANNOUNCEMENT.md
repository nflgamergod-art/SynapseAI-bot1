# 📢 Important Staff Updates - New Scheduling & Attendance System

Hey everyone! 👋

I wanted to take a moment to explain some major updates we're rolling out to make our staffing system more organized and fair for everyone. Please read through this carefully as it affects how you'll work moving forward.

---

## 🗓️ NEW: Weekly Scheduling System

### What's Changing?

Starting **this Sunday (December 1st)**, we're implementing a structured weekly schedule. No more confusion about when you're supposed to work!

### How It Works:

**Every Saturday at 6 PM**, the bot will automatically:
- Generate schedules for the upcoming week (Sunday-Saturday)
- Post the full team schedule in the staff logs channel
- **Send you a DM** with your personal schedule for the week

You'll be assigned **3-4 random days per week** based on your availability preferences.

### Setting Your Availability

**IMPORTANT: Before Saturday, you need to tell the bot your preferred days and times!**

Use this command:
```
/schedule setavailability
```

**Example:**
- **Days:** monday,wednesday,friday (comma-separated, no spaces)
- **Start Time:** 10:00 (24-hour format)
- **End Time:** 18:00 (24-hour format)

The bot will try to schedule you on days you prefer, but it might assign other days if needed for balance.

### Viewing Your Schedule

**Check your schedule anytime:**
- `/schedule myschedule` - See your personal schedule
- `/schedule view` - See the full team schedule

---

## 🚫 Clock-In Changes - Schedule Enforcement

### What's New?

Starting **Sunday morning**, you can **only clock in on days you're scheduled to work**.

### What Happens If You're Not Scheduled?

If you try to clock in on a day you're not scheduled, you'll see two options:

1. **📝 Request to Work Today** - Sends me a request that I can approve or deny
2. **Skip** - Wait for your next scheduled day

If I approve your request, you'll be able to clock in for that day.

### Grace Period

**Until Sunday morning**, everyone can still clock in freely. This gives you time to:
- Set your availability preferences
- Get familiar with the new system
- Ask questions if you're confused

---

## 💳 NEW: UPT System (Unpaid Time Off)

### What is UPT?

Think of UPT as a **protection buffer** - it's time credits you earn that protect you from penalties when life happens.

### How You Earn UPT:

Every time you successfully **clock in**, you earn **15 minutes of UPT**.

Work 20 days? You'll have **300 minutes (5 hours)** of UPT saved up!

### How UPT Protects You:

**If you're running late:**
- Let's say you're 20 minutes late to your shift
- The bot will **automatically deduct 20 minutes** from your UPT balance
- You get a friendly notice, but **no penalty or write-up**
- As long as you have enough UPT, you're protected!

**If you miss a scheduled shift:**
- A full shift = **300 minutes (5 hours)** of UPT
- If you have enough UPT, it covers the absence
- **No write-up, no missed shift count** - you're protected
- If you don't have enough UPT, it counts as a missed shift (more on this below)

### Checking Your UPT:

Use these commands anytime:
- `/upt balance` - See how much UPT you have
- `/upt history` - See when you earned or used UPT

**Example of what you might see:**
```
Your UPT Balance: 4h 30m (270 minutes)

✅ +15 min - Earned for clock-in (Nov 28)
❌ -20 min - Late clock-in (Nov 27)
✅ +15 min - Earned for clock-in (Nov 26)
```

---

## ⚠️ NEW: Write-Up System

### What Are Write-Ups?

Write-ups are formal warnings for attendance issues. **3 write-ups = automatic demotion**.

### How You Get Write-Ups:

1. **Late Without Enough UPT (Standard Write-up)**
   - If you're late but don't have enough UPT to cover it
   - Example: You're 45 minutes late but only have 30 minutes of UPT

2. **No-Call No-Show (Severe Write-up)**
   - You were scheduled to work but didn't show up
   - You don't have enough UPT to cover the full shift (300 minutes)

### Write-Up Counter:

```
1 write-up → ⚠️ Warning
2 write-ups → ⚠️⚠️ Final warning
3 write-ups → 📉 Automatic demotion
```

After you're demoted, your write-ups are cleared and you start fresh.

### Checking Your Write-Ups:

- `/attendance stats` - See your overall attendance record
- `/attendance writeups` - See details of your write-ups

---

## 📉 Attendance & Demotion Rules

### IMPORTANT: Only Scheduled Absences Count!

Let me be crystal clear about this:

**❌ You WILL be penalized for:**
- Missing a day you're **scheduled** to work (without UPT)
- Being late to your shift (without UPT)

**✅ You will NOT be penalized for:**
- Being offline on days you're **not scheduled**
- Taking time off on your days off
- Not working every single day

**Example:**
If your schedule is Monday, Wednesday, Friday:
- Being offline Tuesday = **NO PENALTY** (you weren't scheduled)
- Missing Monday = **PENALTY** (you were scheduled)

### Demotion Triggers:

You'll be automatically demoted if:

**Option 1: Miss 2 Scheduled Shifts**
- You miss 2 days **you were scheduled to work**
- AND you didn't have enough UPT to cover them

**Option 2: Get 3 Write-Ups**
- Accumulate 3 write-ups total
- Mix of late arrivals and no-shows

### Demotion Tiers:

```
Head Support → Support
Support → Trial Support
Trial Support → Member (removed from staff)
```

---

## 🔄 Shift Swapping & Dropping

Life happens! Here's how to handle schedule conflicts:

### Drop a Shift (Open to Anyone):

```
/schedule drop day: monday
```

This broadcasts to all staff, and **first person to accept gets it**.

### Swap with a Specific Person:

```
/schedule swap give_day: monday receive_day: wednesday target_user: @StaffMember
```

Request to swap your Monday for their Wednesday. They get a DM to accept or decline.

---

## 👑 Owner & Leadership Notes

### Who's Excluded from Scheduling?

**Me and joycemember** are excluded from the weekly schedules. We can clock in/out freely without restrictions.

### Manual Adjustments:

I can manually:
- Issue or clear write-ups (`/attendance issue` / `/attendance clear`)
- Adjust UPT balances (`/upt adjust`)
- View detailed attendance reports (`/attendance report @user`)
- Generate schedules manually if needed (`/schedule generate`)

---

## 📊 Quick Reference - Your New Commands

### Schedule Commands:
- `/schedule setavailability` - Set your preferred days/times ⚠️ **DO THIS BEFORE SATURDAY!**
- `/schedule myschedule` - View your personal schedule
- `/schedule view` - View full team schedule
- `/schedule drop` - Drop a shift for others to pick up
- `/schedule swap` - Swap shifts with another staff member

### UPT Commands:
- `/upt balance` - Check your UPT balance
- `/upt history` - View UPT transaction history

### Attendance Commands:
- `/attendance stats` - View your attendance record
- `/attendance writeups` - View your write-ups

---

## ⏰ Timeline

**Today (Friday, Nov 28):**
- Set your availability preferences ASAP!
- Ask questions if anything is unclear
- Continue clocking in normally (grace period)

**Saturday, Nov 29 @ 6 PM:**
- First schedule generates automatically
- You'll get a DM with your days for next week
- Full schedule posted in staff logs

**Sunday, Dec 1 (Morning):**
- **Schedule enforcement begins**
- Can only clock in on scheduled days
- UPT system is active
- Write-up system is active

**Every Saturday @ 6 PM going forward:**
- New schedule generates automatically
- You get a DM with next week's schedule

---

## 💡 Pro Tips

1. **Set Your Availability Early** - The bot schedules based on preferences, so tell it when you prefer to work!

2. **Build Up UPT** - Clock in on time consistently to build a buffer for when you need it.

3. **Check Your Schedule Weekly** - Don't rely on memory, use `/schedule myschedule` to confirm.

4. **Communicate** - If you know you'll miss a shift, try to swap or drop it in advance!

5. **Watch Your Stats** - Use `/attendance stats` regularly to stay aware of your standing.

---

## ❓ FAQ

**Q: What if I can't work a scheduled day?**
A: Use `/schedule drop` to release it, or `/schedule swap` to trade with someone. If it's last-minute and you have UPT, it'll automatically cover you.

**Q: Do I lose UPT if I get demoted?**
A: No! Your UPT balance carries over. Only write-ups and missed shift counts are cleared.

**Q: What if I forget to set availability?**
A: The bot will assign you random days. Set it before Saturday to get your preferred schedule!

**Q: Can I change my availability later?**
A: Yes! Run `/schedule setavailability` again anytime. It'll apply to future schedules.

**Q: What if the bot is wrong about my schedule?**
A: DM me directly and I'll review it. I can manually adjust if needed.

**Q: How do I know if I have write-ups?**
A: The bot will DM you immediately when one is issued. You can also check anytime with `/attendance writeups`.

**Q: What if I'm scheduled but need that day off?**
A: Try to drop or swap the shift in advance. If it's an emergency and you have UPT, it'll cover you automatically.

---

## 📞 Questions?

If anything is confusing or you need help, please:
- DM me directly
- Ask in staff chat
- Test the commands during the grace period (before Sunday)

This system is designed to be **fair and protective** - the UPT system specifically exists so you're not penalized for occasional lateness or emergencies. As long as you show up consistently and clock in on time most days, you'll build up plenty of protection!

Let's make this transition smooth. **Please set your availability before Saturday!** 🙏

Thanks for being part of the team! 💙

---

*Last Updated: November 28, 2025*
