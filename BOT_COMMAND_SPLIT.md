# Bot Command Distribution

## Overview
Commands are now split between two bots to exceed Discord's 100-command limit:
- **Total Commands**: 119
- **Main Bot**: 62 commands (core operations)
- **Extra Bot**: 56 commands (secondary features)
- **Unassigned**: 1 command (case - needs assignment)

## Main Bot (synapseai) - Core Operations
**Focus**: Tickets, moderation, support, payroll, staff management

### Command List (62)
- **Core**: help, ping, diagcommands
- **Moderation**: warn, warns, clearwarn, kick, ban, unban, mute, unmute, cases, automod
- **Tickets**: ticket, ticketvoice, ticketsla, tickettag, ticketnote, ticketanalytics, ticketfeedback, ticketrouting, ticketcategory
- **Support**: support, supportstats, supportstart, supportend, supportrate, supportaddhelper, autoresponse, staffexpertise
- **Customer**: customer, mymentions
- **Shifts & Payroll**: clockin, clockout, forceclockout, clearcooldown, shifts, shiftstats, whosonduty, payroll, upt, attendance, schedule
- **Staff**: staffactivity, promotion, violations, suspendstaff, cancelsuspension, suspensions
- **Appeals**: appeal, appealhistory, appeals
- **Config**: setsupportroles, getsupportroles, setsupportintercept, getsupportintercept, setfounderrole
- **Wellness**: wellness, language
- **Reminders**: remind, reminders, cancelreminder

## Extra Bot (synapseai-extra) - Secondary Features
**Focus**: Games, achievements, utilities, advanced config

### Command List (56)
- **Games & Fun**: rpsai, blackjack, joke
- **Giveaways**: giveaway
- **Achievements**: achievements, perks, stats, leaderboard, claimperk, setcolor, requestemoji, prioritysupport, channelsuggestion, voicepriority, perkspanel, setperkrole, givepoints, appealhistory
- **Knowledge Base**: kb, faq
- **Memory**: remember, forget, memories, aliases, history, revert
- **Advanced Config**: manage, cmdpermissions, abusebypass, addbypass, removebypass, setresponserule, listresponserules, delresponserule
- **Mod Config**: setmodlog, getmodlog, clearmodlog, setdefaultmute, getdefaultmute, setquestiontimeout, getquestiontimeout
- **Owner Tools**: setmention, getmention, version, diagai
- **Utilities**: announce, membercount, purge, addrole, removerole
- **Bulk Actions**: bulkban, bulkkick, bulkmute
- **Anti-Nuke**: antinuke
- **Channels**: tempchannels, statschannels

## Configuration

### Environment Variables
Both bots use the same codebase but behave differently based on `IS_SECONDARY_BOT`:
- **Main Bot**: `IS_SECONDARY_BOT` not set or `false`
- **Extra Bot**: `IS_SECONDARY_BOT=true`

### How It Works
1. All 119 commands defined in `src/index.ts`
2. Filter configuration in `src/config/botCommandFilters.ts`
3. At startup, each bot filters commands based on its type
4. Main bot registers its 62 commands
5. Extra bot registers its 56 commands
6. Both stay under Discord's 100-command limit

## Benefits
✅ All 118 commands available across both bots
✅ No more losing features when hitting the limit
✅ Clean separation: operational vs utility commands
✅ Both bots under Discord's 100-command limit
✅ Main bot has all critical features for daily operations
✅ Extra bot has enhanced features and admin tools

## Adding New Commands
When adding commands, assign them to the appropriate bot:

**Add to Main Bot** if it's:
- Moderation action
- Ticket management
- Staff/payroll operation
- Support tracking
- Customer service

**Add to Extra Bot** if it's:
- Game/entertainment
- Achievement system
- Advanced configuration
- Utility/helper tool
- Analytics/reporting

Edit `src/config/botCommandFilters.ts` and add the command name to the appropriate set.
