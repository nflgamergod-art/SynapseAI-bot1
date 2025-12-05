# 💰 Payday Payment Collection System

## Overview
The payday system streamlines payment collection by automatically DMing all staff with unpaid balances, collecting their payment method preferences and credentials, then forwarding that information to the owner for processing.

---

## How It Works

### 1️⃣ Owner Initiates Payday

**Command:** `/payroll payday`

**What Happens:**
- Bot identifies all staff with unpaid balances
- Sends DM to each staff member with:
  - Amount owed
  - Total hours worked
  - Number of pay periods
  - Payment method selection buttons

**Owner Receives:**
- Summary DM with:
  - Number of DMs sent successfully
  - Number of failed DMs
  - Payday session ID for tracking

---

### 2️⃣ Staff Selects Payment Method

Staff receive a DM with these options:

#### Traditional Payment Methods:
- 💳 **PayPal** - Email address
- 💵 **Cash App** - $Username
- 💰 **Venmo** - @Username

#### Cryptocurrency Options:
- ₿ **Bitcoin (BTC)** - Wallet address
- Ξ **Ethereum (ETH)** - Wallet address
- Ł **Litecoin (LTC)** - Wallet address
- ₮ **USDT (Tether)** - Wallet address + network

**Staff Action:**
1. Click their preferred payment method button
2. Modal appears requesting payment credentials
3. Staff enters their payment details (email, username, wallet address, etc.)
4. Optional: Add notes (e.g., "TRC20 network for USDT")
5. Submit

**Smart Features:**
- If staff previously submitted payment info, it's pre-filled in the form
- Payment method is saved for future paydays
- One submission per payday (prevents duplicate entries)

---

### 3️⃣ Owner Receives Payment Details

**Immediately after staff submits**, owner receives a DM with:

**Payment Information Embed:**
```
💰 Payday Payment Submission

Staff Member: Username (@UserId)

💵 Amount Owed: $125.50
💳 Payment Method: PAYPAL
⏱️ Hours Worked: 8.37h

📝 Payment Details:
staff@email.com

📋 Additional Notes:
(any notes from staff)

Payday ID: payday_1733445600000
User ID: 123456789
```

**What This Includes:**
- Staff member's Discord tag and user ID
- Exact amount to pay (with multipliers applied)
- Payment method chosen
- Payment credentials (email, username, wallet address)
- Any additional notes or instructions
- Payday session ID for tracking
- Hours worked for verification

---

## Database Tables

### `payment_methods`
Stores saved payment preferences for quick reuse:
```sql
- guild_id: Server ID
- user_id: Staff member ID
- payment_type: paypal, cashapp, venmo, btc, eth, ltc, usdt, other
- credentials: Email/username/wallet address
- notes: Optional additional info
- created_at: First saved
- updated_at: Last modified
```

### `payday_submissions`
Tracks each payday submission to prevent duplicates:
```sql
- guild_id: Server ID
- user_id: Staff member ID
- payday_id: Unique session identifier
- payment_type: Method chosen this time
- credentials: Details submitted this time
- amount_owed: Exact payment amount
- submitted_at: Submission timestamp
```

---

## Features

### ✅ Automatic Amount Calculation
- Includes all unpaid pay periods
- Applies pay multipliers (user/role-based)
- Shows hours worked for transparency

### ✅ Payment Method Memory
- Saves preferred payment method
- Pre-fills credentials for returning users
- Staff can change method each payday

### ✅ Duplicate Prevention
- Staff can only submit once per payday
- Shows friendly message if already submitted
- Prevents accidental resubmissions

### ✅ Owner Notification
- Real-time DMs as submissions come in
- All details needed to process payment
- Payday ID for tracking and organization

### ✅ Privacy & Security
- All communication via DMs (private)
- Payment details sent only to owner
- Credentials stored securely in database

---

## Usage Guide

### For Owners

**Step 1: Initiate Payday**
```
/payroll payday
```

**Step 2: Wait for Submissions**
- Staff will receive DMs automatically
- You'll get real-time notifications as they submit
- Each submission includes all payment details

**Step 3: Process Payments**
- Use the payment details from each DM
- Send payments via the specified method
- Mark periods as paid: `/payroll markpaid period_id: <id>`

**Step 4: Track Submissions**
- Payday ID in each notification links all submissions
- User IDs for easy identification
- Amount owed clearly displayed

---

### For Staff

**Step 1: Receive Payday DM**
- You'll get a DM when owner initiates payday
- Shows how much you're owed
- Displays your total hours and pay periods

**Step 2: Select Payment Method**
- Click the button for your preferred method
- Traditional: PayPal, Cash App, Venmo
- Crypto: BTC, ETH, LTC, USDT

**Step 3: Submit Payment Details**
- Modal appears requesting your credentials
- If you've submitted before, your info is pre-filled
- Add any special notes if needed
- Submit the form

**Step 4: Confirmation**
- You'll see a success message
- Payment details sent to owner
- Payment will be processed soon!

---

## Payment Method Details

### PayPal
- **Required:** Email address linked to PayPal account
- **Example:** `staff@example.com`
- **Notes:** Must be valid PayPal email

### Cash App
- **Required:** Cash App username with $ symbol
- **Example:** `$StaffUsername`
- **Notes:** Include the $ sign

### Venmo
- **Required:** Venmo username with @ symbol
- **Example:** `@StaffUsername`
- **Notes:** Include the @ sign

### Bitcoin (BTC)
- **Required:** Valid Bitcoin wallet address
- **Formats:** 
  - Legacy: `1A1zP1...`
  - SegWit: `3J98t1...`
  - Native SegWit: `bc1qar0...`
- **Notes:** Double-check address before submitting

### Ethereum (ETH)
- **Required:** Valid Ethereum wallet address
- **Format:** `0x71C7...` (42 characters)
- **Notes:** Case-insensitive, starts with 0x

### Litecoin (LTC)
- **Required:** Valid Litecoin wallet address
- **Formats:**
  - Legacy: `L...`
  - SegWit: `M...`
- **Notes:** Verify address carefully

### USDT (Tether)
- **Required:** Wallet address + network specification
- **Example:** `TRo2n5... (TRC20)`
- **Networks:** TRC20, ERC20, BEP20, etc.
- **Notes:** Network MUST be specified to avoid loss of funds

---

## Error Handling

### Staff Can't Receive DM
- Bot logs the failure
- Owner notified in summary (failed count)
- Owner should contact staff manually

### Already Submitted
- Staff sees friendly message
- Can't submit duplicate entries
- Original submission still valid

### Invalid Credentials
- No validation on submission (flexibility)
- Owner reviews before sending payment
- Staff can update for next payday

---

## Security Considerations

### Privacy
- ✅ All DMs are private (not visible in server)
- ✅ Payment details only sent to owner
- ✅ No public display of credentials

### Data Storage
- ✅ Encrypted database storage
- ✅ Payment methods saved per-user for convenience
- ✅ Submission history for audit trail

### Access Control
- ✅ Only owners can initiate payday
- ✅ Only staff with unpaid balances receive DMs
- ✅ Staff can only submit for themselves

---

## Troubleshooting

### "No staff have unpaid balances"
- No staff have worked hours that need payment
- All existing pay periods are marked as paid
- Generate pay periods first: `/payroll calculate`

### Staff Didn't Receive DM
- Check if staff has DMs from server members enabled
- Bot may be blocked by staff member
- Owner can manually request payment details

### Owner Not Receiving Submissions
- Check owner ID is correct (1272923881052704820)
- Verify bot has permission to DM owner
- Check spam/filtered messages folder

### Staff Can't Submit Credentials
- May have already submitted for this payday
- Modal may have expired (submit within 15 minutes)
- Click button again to get fresh modal

---

## Example Workflow

**Friday Evening - Owner:**
```
/payroll payday
```

**Owner Receives:**
```
💰 Payday Summary
ID: payday_1733445600000

✅ DMs Sent: 5
❌ Failed: 0
📊 Total Staff: 5

You will receive payment details as staff submit them
```

**Staff Members:**
Each receives:
```
💰 Payday - Payment Information Required

Hello StaffMember! It's payday! 🎉

You have $125.50 in unpaid earnings.

Please select your preferred payment method below.

💵 Amount Owed: $125.50
⏱️ Total Hours: 8.37h
📋 Pay Periods: 2

[PayPal] [Cash App] [Venmo]
[Bitcoin] [Ethereum] [Litecoin] [USDT]
```

**Staff Clicks "PayPal":**
Modal appears:
```
PayPal Payment Details

PayPal Email Address:
[staff@example.com]

Additional Notes (Optional):
[                    ]

[Submit]
```

**Staff Submits:**
```
✅ Payment details submitted successfully!

Method: PAYPAL
Amount: $125.50

Your payment information has been sent to the owner.
You will receive payment soon! 💰
```

**Owner Receives (in real-time):**
```
💰 Payday Payment Submission

Staff Member: StaffMember (@123456789)

💵 Amount Owed: $125.50
💳 Payment Method: PAYPAL
⏱️ Hours Worked: 8.37h

📝 Payment Details:
staff@example.com

Payday ID: payday_1733445600000
User ID: 123456789
```

**Owner Processes Payment:**
1. Opens PayPal
2. Sends $125.50 to staff@example.com
3. Marks as paid: `/payroll markpaid period_id: 45`

---

## Future Enhancements

### Potential Features:
- ✨ Batch payment export (CSV format)
- ✨ Payment confirmation system
- ✨ Automatic payment status tracking
- ✨ Integration with payment APIs
- ✨ Payment history for staff
- ✨ Recurring payment method preferences
- ✨ Multi-currency support

---

## Support

For issues with the payday system:
1. Check this documentation first
2. Verify command permissions (owner only)
3. Test with small group before full rollout
4. Contact bot developer if persistent issues

---

*Last Updated: December 5, 2025*
*Version: 1.0*
