# Phase 1 Advanced Ticket Features

## 🎯 Overview
Phase 1 adds **4 major advanced features** to your ticket system:
- **SLA System with Timers** ⏱️
- **Ticket Tags & Labels** 🏷️
- **Private Staff Notes** 📝
- **Enhanced Analytics Dashboard** 📊

---

## 📋 New Commands

### 1. `/ticketsla` - SLA Management
Configure and monitor Service Level Agreements for response times.

**Subcommands:**
- `/ticketsla set` - Set SLA times
  - `response_time`: Minutes for first response (default: 30)
  - `resolution_time`: Minutes for resolution (default: 180)
  - `priority_response`: Minutes for priority tickets (default: 5)
  
- `/ticketsla view` - View current SLA configuration

- `/ticketsla check` - Check which tickets are breaching SLA

**Example:**
```
/ticketsla set response_time:15 resolution_time:120 priority_response:3
```

---

### 2. `/tickettag` - Tag System
Organize tickets with colored tags for better categorization.

**Subcommands:**
- `/tickettag create` - Create a new tag
  - `name`: Tag name (e.g., "bug", "urgent", "feature")
  - `color`: Red, Blue, Green, Yellow, Purple, Orange
  - `description`: Optional description

- `/tickettag delete` - Remove a tag

- `/tickettag list` - View all available tags

- `/tickettag add` - Add tag to a ticket
  - `ticket_id`: Ticket number
  - `tag`: Tag name

- `/tickettag remove` - Remove tag from ticket

- `/tickettag search` - Find all tickets with specific tag

**Example:**
```
/tickettag create name:bug color:red description:"Bug reports"
/tickettag add ticket_id:119 tag:bug
/tickettag search tag:urgent
```

---

### 3. `/ticketnote` - Private Staff Notes
Add internal notes that only staff can see.

**Subcommands:**
- `/ticketnote add` - Add a private note
  - `ticket_id`: Ticket number
  - `note`: Your internal note

- `/ticketnote view` - View all notes for a ticket
  - `ticket_id`: Ticket number

- `/ticketnote delete` - Delete a note
  - `note_id`: Note ID number

**Example:**
```
/ticketnote add ticket_id:119 note:"User needs account verification"
/ticketnote view ticket_id:119
```

---

### 4. `/ticketanalytics` - Analytics Dashboard
View comprehensive statistics and performance metrics.

**Options:**
- `days`: Number of days to analyze (default: 30, max: 365)

**Metrics Shown:**
- Total tickets (open/closed counts)
- Average response time
- Average resolution time  
- SLA compliance rate (percentage)
- Tickets by category breakdown
- Top 10 most used tags
- Top 5 staff members (by tickets handled + ratings)

**Example:**
```
/ticketanalytics days:7  # Last week stats
/ticketanalytics days:30 # Last month stats
```

---

## 🆕 New Database Tables

### `ticket_notes`
Stores private staff notes for tickets.
```sql
- id: Note ID
- ticket_id: Associated ticket
- user_id: Staff member who wrote the note
- note: Note content
- created_at: Timestamp
```

### `ticket_tags_config`
Stores available tags per guild.
```sql
- id: Tag config ID
- guild_id: Server ID
- name: Tag name
- color: Tag color
- description: Optional description
```

### Enhanced `tickets` table
Added columns:
- `first_response_at`: When staff first responded
- `tags`: JSON array of tag names
- `sla_breach`: Flag if SLA was breached (1/0)

### Enhanced `ticket_configs` table
Added SLA settings:
- `sla_response_time`: Minutes for first response
- `sla_resolution_time`: Minutes for resolution
- `sla_priority_response_time`: Minutes for priority tickets

---

## 🎨 Usage Examples

### Setting Up SLA
1. Configure SLA times for your server:
```
/ticketsla set response_time:30 resolution_time:180 priority_response:5
```

2. Check for breaching tickets regularly:
```
/ticketsla check
```

### Using Tags
1. Create common tags:
```
/tickettag create name:bug color:red description:"Bug reports"
/tickettag create name:feature color:blue description:"Feature requests"
/tickettag create name:urgent color:yellow description:"Urgent priority"
/tickettag create name:resolved color:green description:"Issue resolved"
```

2. Tag tickets as they come in:
```
/tickettag add ticket_id:119 tag:bug
/tickettag add ticket_id:119 tag:urgent
```

3. Search tickets by tag:
```
/tickettag search tag:urgent
```

### Staff Collaboration with Notes
1. Add internal context:
```
/ticketnote add ticket_id:119 note:"User mentioned this also affects mobile app"
```

2. Review notes before responding:
```
/ticketnote view ticket_id:119
```

### Monitoring Performance
1. Weekly review:
```
/ticketanalytics days:7
```

2. Monthly reports:
```
/ticketanalytics days:30
```

---

## 📊 Benefits

### SLA System
- ✅ Track response times automatically
- ✅ Identify overdue tickets instantly
- ✅ Improve customer satisfaction with timely responses
- ✅ Hold staff accountable to response goals

### Tag System
- ✅ Organize tickets by type/category
- ✅ Quick filtering for specific issues
- ✅ Better reporting and analytics
- ✅ Easier to assign specialized staff

### Private Notes
- ✅ Share context between staff members
- ✅ Document troubleshooting steps
- ✅ Keep internal communication organized
- ✅ Better ticket handoffs

### Analytics Dashboard
- ✅ Data-driven decisions
- ✅ Identify trends and patterns
- ✅ Recognize top performers
- ✅ Find areas for improvement

---

## 🚀 Coming in Phase 2

The next update will include:
- **Smart Routing & Auto-Assignment** 🎯
- **Ticket Queue System** 📋  
- **Auto-Reminders & Follow-ups** ⏰
- **Auto-Escalation** 🚨

---

## ⚙️ Technical Notes

- All times are stored in UTC
- Tags are case-insensitive
- Notes are ephemeral (staff-only, never shown to users)
- Analytics calculations exclude closed tickets older than specified days
- SLA breach flags are permanent once set (for historical tracking)

---

## 🔧 Permissions Required

- `/ticketsla` - Requires `Manage Guild` permission
- `/tickettag` - Requires `Manage Messages` permission  
- `/ticketnote` - Requires `Manage Messages` permission
- `/ticketanalytics` - Requires `Manage Guild` permission

---

## 📝 Migration Notes

When you first deploy Phase 1:
1. Existing tickets will have `NULL` for new fields (no data loss)
2. Default SLA times will be set automatically:
   - Response: 30 minutes
   - Resolution: 180 minutes (3 hours)
   - Priority Response: 5 minutes
3. No existing tags by default - create them as needed
4. Old tickets have no notes - start adding as needed

---

**Deployed:** December 8, 2025
**Version:** Phase 1 - Foundation Features
