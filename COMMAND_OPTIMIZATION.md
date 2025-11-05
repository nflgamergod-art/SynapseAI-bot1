# Command Optimization Plan

**Current Count:** 115 commands
**Target:** ≤100 commands
**Need to remove:** 15+ commands

## Duplicates to Remove (9 commands saved)

### 1. Warning Commands - Keep only `warns`
- ❌ `checkwarn` - Same as warns
- ❌ `warnings` - Same as warns  
- ❌ `checkwarnings` - Same as warns

### 2. Joke Commands - Merge into one
- ❌ `dadjoke` - Merge into joke command with type option

### 3. Ping Commands - Keep only `ping`
- ❌ `pong` - Just an alias

### 4. List Commands - Merge similar ones
- ❌ `listwhitelist` + `listblacklist` + `listbypass` → Merge into `manage` command
- ❌ `listopentickets` → Merge into `ticket list`

## Owner Commands to Consider Removing (Low Priority Features)

### AI Configuration (Can use config files instead)
- ❌ `setgeminikey` - Use env vars
- ❌ `setopenai` - Use env vars
- ❌ `setprovider` - Use env vars
- ❌ `setmodel` - Use env vars
- ❌ `setmodelpreset` - Use env vars

### Advanced Analytics (Nice-to-have)
- ❌ `patterns` - Advanced feature
- ❌ `insights` - Advanced feature  
- ❌ `checkins` - Advanced feature
- ❌ `sentiment` - Advanced feature

### Founder Management (Specific use case)
- ❌ `setfounderrole` - Specific feature
- ❌ `addfounder` - Specific feature
- ❌ `removefounder` - Specific feature
- ❌ `getfounders` - Specific feature

## Keep Essential Commands (Core Functionality)

### Staff Management
- ✅ `clockin`, `clockout`, `shifts`, `shiftstats`, `whosonduty`
- ✅ `support`, `supportstats`, `supportstart`, `supportend`

### Moderation
- ✅ `ban`, `kick`, `mute`, `warn`, `unmute`
- ✅ `case`, `cases`, `updatecase`
- ✅ `purge`, `addrole`, `removerole`

### Core Features
- ✅ `help`, `ping`, `redeploy`
- ✅ `ticket`, `kb`, `achievements`, `perks`
- ✅ `cmdpermissions`, `automod`

Would you like me to implement these changes?