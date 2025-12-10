import { getDB } from './db';

// Initialize scheduling tables
export function initSchedulingSchema() {
  const db = getDB();
  
  // Staff availability preferences
  db.prepare(`
    CREATE TABLE IF NOT EXISTS staff_availability (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      preferred_days TEXT NOT NULL,  -- JSON array: ["monday", "tuesday", ...]
      preferred_times TEXT NOT NULL,  -- JSON object: {"start": "09:00", "end": "17:00"}
      updated_at TEXT NOT NULL,
      UNIQUE(guild_id, user_id)
    )
  `).run();
  
  // Weekly schedule assignments
  db.prepare(`
    CREATE TABLE IF NOT EXISTS staff_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      week_start TEXT NOT NULL,  -- YYYY-MM-DD of the Monday
      assigned_days TEXT NOT NULL,  -- JSON array: ["monday", "wednesday", "friday"]
      created_at TEXT NOT NULL,
      UNIQUE(guild_id, user_id, week_start)
    )
  `).run();
  
  // Shift swap requests
  db.prepare(`
    CREATE TABLE IF NOT EXISTS shift_swap_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      requester_id TEXT NOT NULL,
      target_user_id TEXT,  -- NULL for open drops, specific user_id for direct swaps
      request_type TEXT NOT NULL,  -- 'drop' or 'swap'
      day_to_give TEXT NOT NULL,  -- Day requester wants to give away
      day_to_receive TEXT,  -- Day requester wants in return (for swaps only)
      week_start TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'accepted', 'declined', 'cancelled'
      accepted_by TEXT,  -- User who accepted (for drops)
      created_at TEXT NOT NULL,
      responded_at TEXT
    )
  `).run();
  
  // Work requests (for unscheduled clock-ins)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS work_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      requested_date TEXT NOT NULL,  -- YYYY-MM-DD
      status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'approved', 'denied'
      owner_response TEXT,
      created_at TEXT NOT NULL,
      responded_at TEXT
    )
  `).run();
  
  // UPT (Unpaid Time Off) balances - like Amazon
  db.prepare(`
    CREATE TABLE IF NOT EXISTS upt_balances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      balance_minutes INTEGER NOT NULL DEFAULT 0,  -- UPT in minutes
      last_accrual_date TEXT,  -- Last date UPT was earned
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(guild_id, user_id)
    )
  `).run();
  
  // UPT transaction history
  db.prepare(`
    CREATE TABLE IF NOT EXISTS upt_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      amount_minutes INTEGER NOT NULL,  -- Positive = earned, Negative = used
      reason TEXT NOT NULL,  -- 'accrual', 'late', 'absence', 'manual_adjustment'
      related_date TEXT,  -- Date of shift/absence
      created_at TEXT NOT NULL
    )
  `).run();
  
  // Write-up system
  db.prepare(`
    CREATE TABLE IF NOT EXISTS staff_writeups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      issued_by TEXT NOT NULL,  -- User ID of who issued it
      related_date TEXT,  -- Date of incident
      severity TEXT NOT NULL DEFAULT 'standard',  -- 'standard', 'severe'
      notes TEXT,
      created_at TEXT NOT NULL
    )
  `).run();
  
  // Missed shift tracking (only for SCHEDULED shifts)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS missed_shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      scheduled_date TEXT NOT NULL,  -- YYYY-MM-DD
      week_start TEXT NOT NULL,
      day_of_week TEXT NOT NULL,
      upt_used BOOLEAN NOT NULL DEFAULT 0,  -- Whether UPT covered it
      created_at TEXT NOT NULL
    )
  `).run();
  
  console.log('✅ Scheduling tables initialized');
}

// Get current week's Sunday date
export function getCurrentWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  // day 0 = Sunday, so if it's Sunday return today, otherwise go back to last Sunday
  const diff = day === 0 ? 0 : -day;
  const sunday = new Date(now);
  sunday.setDate(now.getDate() + diff);
  return sunday.toISOString().split('T')[0];
}

// Get next week's Sunday date
export function getNextWeekStart(): string {
  const currentSunday = new Date(getCurrentWeekStart());
  currentSunday.setDate(currentSunday.getDate() + 7);
  return currentSunday.toISOString().split('T')[0];
}

// Set staff availability preferences
export function setStaffAvailability(
  guildId: string,
  userId: string,
  preferredDays: string[],
  preferredTimes: { start: string; end: string }
): void {
  const db = getDB();
  
  db.prepare(`
    INSERT INTO staff_availability (guild_id, user_id, preferred_days, preferred_times, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      preferred_days = excluded.preferred_days,
      preferred_times = excluded.preferred_times,
      updated_at = excluded.updated_at
  `).run(
    guildId,
    userId,
    JSON.stringify(preferredDays),
    JSON.stringify(preferredTimes),
    new Date().toISOString()
  );
}

// Get staff availability
export function getStaffAvailability(guildId: string, userId: string): {
  preferredDays: string[];
  preferredTimes: { start: string; end: string };
} | null {
  const db = getDB();
  
  const row = db.prepare(`
    SELECT preferred_days, preferred_times FROM staff_availability
    WHERE guild_id = ? AND user_id = ?
  `).get(guildId, userId) as any;
  
  if (!row) return null;
  
  return {
    preferredDays: JSON.parse(row.preferred_days),
    preferredTimes: JSON.parse(row.preferred_times)
  };
}

// Get all staff with availability set
export function getAllStaffAvailability(guildId: string): Array<{
  userId: string;
  preferredDays: string[];
  preferredTimes: { start: string; end: string };
}> {
  const db = getDB();
  
  const rows = db.prepare(`
    SELECT user_id, preferred_days, preferred_times FROM staff_availability
    WHERE guild_id = ?
  `).all(guildId) as any[];
  
  return rows.map(row => ({
    userId: row.user_id,
    preferredDays: JSON.parse(row.preferred_days),
    preferredTimes: JSON.parse(row.preferred_times)
  }));
}

// Generate fair schedule for all staff
export function generateWeeklySchedule(guildId: string, weekStart: string): Map<string, string[]> {
  const staffList = getAllStaffAvailability(guildId);
  const schedule = new Map<string, string[]>();
  
  if (staffList.length === 0) {
    return schedule;
  }
  
  // Owner IDs to exclude from scheduling
  const OWNER_IDS = ['1272923881052704820', '840586296044421160']; // Your ID + joycemember
  
  // Filter out owners from scheduling
  const nonOwnerStaff = staffList.filter(staff => !OWNER_IDS.includes(staff.userId));
  
  if (nonOwnerStaff.length === 0) {
    return schedule;
  }
  
  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayAssignments = new Map<string, string[]>(); // day -> [userIds]
  
  // Initialize day assignments
  daysOfWeek.forEach(day => dayAssignments.set(day, []));
  
  // Sort staff by number of preferred days (fewer preferences = more flexibility)
  const sortedStaff = [...nonOwnerStaff].sort((a, b) => 
    a.preferredDays.length - b.preferredDays.length
  );
  
  // ENSURE ALL STAFF GET SCHEDULED: Assign 3-4 days to EVERY staff member
  for (const staff of sortedStaff) {
    const targetDays = Math.random() < 0.5 ? 3 : 4; // Random between 3-4 days
    const assignedDays: string[] = [];
    
    // Prioritize their preferred days
    const availableDays = staff.preferredDays.filter(day => 
      daysOfWeek.includes(day.toLowerCase())
    );
    
    // Shuffle preferred days for fairness
    const shuffledPreferred = availableDays.sort(() => Math.random() - 0.5);
    
    // Assign from preferred days first
    for (const day of shuffledPreferred) {
      if (assignedDays.length >= targetDays) break;
      
      const dayLower = day.toLowerCase();
      const currentAssigned = dayAssignments.get(dayLower) || [];
      
      // Limit to avoid overloading one day (max 5 staff per day for balance - increased from 3)
      if (currentAssigned.length < 5) {
        assignedDays.push(dayLower);
        currentAssigned.push(staff.userId);
        dayAssignments.set(dayLower, currentAssigned);
      }
    }
    
    // CRITICAL: Ensure minimum days are assigned to ALL staff
    // If still need more days, assign from less-crowded days
    if (assignedDays.length < targetDays) {
      const remainingDays = daysOfWeek
        .filter(day => !assignedDays.includes(day))
        .sort((a, b) => {
          const aCount = dayAssignments.get(a)?.length || 0;
          const bCount = dayAssignments.get(b)?.length || 0;
          return aCount - bCount; // Prefer less crowded days
        });
      
      for (const day of remainingDays) {
        if (assignedDays.length >= targetDays) break;
        assignedDays.push(day);
        const currentAssigned = dayAssignments.get(day) || [];
        currentAssigned.push(staff.userId);
        dayAssignments.set(day, currentAssigned);
      }
    }
    
    // Ensure days are spread out (no 4 consecutive days if possible)
    const sortedDays = assignedDays.sort((a, b) => 
      daysOfWeek.indexOf(a) - daysOfWeek.indexOf(b)
    );
    
    // ALWAYS add staff to schedule map - ensures ALL staff are scheduled
    schedule.set(staff.userId, sortedDays);
  }
  
  return schedule;
}

// Save generated schedule to database
export function saveWeeklySchedule(guildId: string, weekStart: string, schedule: Map<string, string[]>): void {
  const db = getDB();
  
  for (const [userId, days] of schedule.entries()) {
    db.prepare(`
      INSERT INTO staff_schedules (guild_id, user_id, week_start, assigned_days, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(guild_id, user_id, week_start) DO UPDATE SET
        assigned_days = excluded.assigned_days
    `).run(
      guildId,
      userId,
      weekStart,
      JSON.stringify(days),
      new Date().toISOString()
    );
  }
}

// Get staff schedule for current week
export function getStaffSchedule(guildId: string, userId: string, weekStart?: string): string[] | null {
  const db = getDB();
  const week = weekStart || getCurrentWeekStart();
  
  const row = db.prepare(`
    SELECT assigned_days FROM staff_schedules
    WHERE guild_id = ? AND user_id = ? AND week_start = ?
  `).get(guildId, userId, week) as any;
  
  if (!row) return null;
  
  return JSON.parse(row.assigned_days);
}

// Get all schedules for a week
export function getAllSchedulesForWeek(guildId: string, weekStart: string): Map<string, string[]> {
  const db = getDB();
  
  const rows = db.prepare(`
    SELECT user_id, assigned_days FROM staff_schedules
    WHERE guild_id = ? AND week_start = ?
  `).all(guildId, weekStart) as any[];
  
  const schedules = new Map<string, string[]>();
  rows.forEach(row => {
    schedules.set(row.user_id, JSON.parse(row.assigned_days));
  });
  
  return schedules;
}

// Check if staff is scheduled for today
export function isScheduledToday(guildId: string, userId: string): boolean {
  const schedule = getStaffSchedule(guildId, userId);
  
  // If no schedule exists yet, allow clock-in (pre-schedule-system period)
  if (!schedule) return true;
  
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  return schedule.includes(today);
}

// Check if staff is scheduled for a specific date
export function isScheduledForDate(guildId: string, userId: string, date: Date): boolean {
  const schedule = getStaffSchedule(guildId, userId);
  
  // If no schedule exists yet, assume they're allowed
  if (!schedule) return true;
  
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  return schedule.includes(dayName);
}

// Check if scheduling system is active (has schedules generated)
export function hasSchedulesGenerated(guildId: string): boolean {
  const weekStart = getCurrentWeekStart();
  const schedules = getAllSchedulesForWeek(guildId, weekStart);
  return schedules.size > 0;
}

// Get day name from date
export function getDayName(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
}

// Create shift swap request
export function createShiftSwapRequest(
  guildId: string,
  requesterId: string,
  dayToGive: string,
  requestType: 'drop' | 'swap',
  targetUserId?: string,
  dayToReceive?: string
): number {
  const db = getDB();
  const weekStart = getCurrentWeekStart();
  
  const result = db.prepare(`
    INSERT INTO shift_swap_requests (
      guild_id, requester_id, target_user_id, request_type,
      day_to_give, day_to_receive, week_start, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    guildId,
    requesterId,
    targetUserId || null,
    requestType,
    dayToGive,
    dayToReceive || null,
    weekStart,
    new Date().toISOString()
  );
  
  return result.lastInsertRowid as number;
}

// Get pending swap requests
export function getPendingSwapRequests(guildId: string, weekStart?: string): Array<any> {
  const db = getDB();
  const week = weekStart || getCurrentWeekStart();
  
  return db.prepare(`
    SELECT * FROM shift_swap_requests
    WHERE guild_id = ? AND week_start = ? AND status = 'pending'
    ORDER BY created_at ASC
  `).all(guildId, week) as any[];
}

// Accept shift swap/drop
export function acceptShiftSwap(requestId: number, acceptedBy: string): boolean {
  const db = getDB();
  
  // Get the request details
  const request = db.prepare(`
    SELECT * FROM shift_swap_requests WHERE id = ?
  `).get(requestId) as any;
  
  if (!request || request.status !== 'pending') return false;
  
  // Update request status
  db.prepare(`
    UPDATE shift_swap_requests
    SET status = 'accepted', accepted_by = ?, responded_at = ?
    WHERE id = ?
  `).run(acceptedBy, new Date().toISOString(), requestId);
  
  // Update schedules in database
  const weekStart = request.week_start;
  
  if (request.request_type === 'drop') {
    // Remove day from requester, add to accepter
    const requesterSchedule = getStaffSchedule(request.guild_id, request.requester_id, weekStart) || [];
    const accepterSchedule = getStaffSchedule(request.guild_id, acceptedBy, weekStart) || [];
    
    const newRequesterSchedule = requesterSchedule.filter(d => d !== request.day_to_give);
    const newAccepterSchedule = [...accepterSchedule, request.day_to_give];
    
    saveWeeklySchedule(request.guild_id, weekStart, new Map([
      [request.requester_id, newRequesterSchedule],
      [acceptedBy, newAccepterSchedule]
    ]));
  } else if (request.request_type === 'swap' && request.target_user_id) {
    // Swap days between requester and target
    const requesterSchedule = getStaffSchedule(request.guild_id, request.requester_id, weekStart) || [];
    const targetSchedule = getStaffSchedule(request.guild_id, request.target_user_id, weekStart) || [];
    
    const newRequesterSchedule = requesterSchedule
      .filter(d => d !== request.day_to_give)
      .concat(request.day_to_receive || []);
    
    const newTargetSchedule = targetSchedule
      .filter(d => d !== request.day_to_receive)
      .concat(request.day_to_give);
    
    saveWeeklySchedule(request.guild_id, weekStart, new Map([
      [request.requester_id, newRequesterSchedule],
      [request.target_user_id, newTargetSchedule]
    ]));
  }
  
  return true;
}

// Decline shift swap
export function declineShiftSwap(requestId: number): boolean {
  const db = getDB();
  
  const result = db.prepare(`
    UPDATE shift_swap_requests
    SET status = 'declined', responded_at = ?
    WHERE id = ? AND status = 'pending'
  `).run(new Date().toISOString(), requestId);
  
  return result.changes > 0;
}

// Create work request (unscheduled clock-in)
export function createWorkRequest(guildId: string, userId: string, requestedDate: string): number {
  const db = getDB();
  
  const result = db.prepare(`
    INSERT INTO work_requests (guild_id, user_id, requested_date, status, created_at)
    VALUES (?, ?, ?, 'pending', ?)
  `).run(guildId, userId, requestedDate, new Date().toISOString());
  
  return result.lastInsertRowid as number;
}

// Get pending work requests
export function getPendingWorkRequests(guildId: string): Array<any> {
  const db = getDB();
  
  return db.prepare(`
    SELECT * FROM work_requests
    WHERE guild_id = ? AND status = 'pending'
    ORDER BY created_at ASC
  `).all(guildId) as any[];
}

// Respond to work request
export function respondToWorkRequest(requestId: number, approved: boolean, ownerResponse?: string): boolean {
  const db = getDB();
  
  const status = approved ? 'approved' : 'denied';
  
  const result = db.prepare(`
    UPDATE work_requests
    SET status = ?, owner_response = ?, responded_at = ?
    WHERE id = ? AND status = 'pending'
  `).run(status, ownerResponse || null, new Date().toISOString(), requestId);
  
  return result.changes > 0;
}

// Get work request by ID
export function getWorkRequest(requestId: number): any {
  const db = getDB();
  
  return db.prepare(`
    SELECT * FROM work_requests WHERE id = ?
  `).get(requestId);
}

// Check if user has approved work request for today
export function hasApprovedWorkRequestToday(guildId: string, userId: string): boolean {
  const db = getDB();
  const today = new Date().toISOString().split('T')[0];
  
  const row = db.prepare(`
    SELECT id FROM work_requests
    WHERE guild_id = ? AND user_id = ? AND requested_date = ? AND status = 'approved'
  `).get(guildId, userId, today);
  
  return !!row;
}

// Get shift swap request by ID
export function getShiftSwapRequest(requestId: number): any {
  const db = getDB();
  
  return db.prepare(`
    SELECT * FROM shift_swap_requests WHERE id = ?
  `).get(requestId);
}

// Cancel shift swap request
export function cancelShiftSwapRequest(requestId: number): boolean {
  const db = getDB();
  
  const result = db.prepare(`
    UPDATE shift_swap_requests
    SET status = 'cancelled'
    WHERE id = ? AND status = 'pending'
  `).run(requestId);
  
  return result.changes > 0;
}

// ============ UPT (Unpaid Time Off) System ============

// Get UPT balance for a user
export function getUPTBalance(guildId: string, userId: string): number {
  const db = getDB();
  
  const row = db.prepare(`
    SELECT balance_minutes FROM upt_balances
    WHERE guild_id = ? AND user_id = ?
  `).get(guildId, userId) as any;
  
  return row ? row.balance_minutes : 0;
}

// Initialize UPT balance for new staff
export function initializeUPTBalance(guildId: string, userId: string): void {
  const db = getDB();
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT OR IGNORE INTO upt_balances (guild_id, user_id, balance_minutes, created_at, updated_at)
    VALUES (?, ?, 0, ?, ?)
  `).run(guildId, userId, now, now);
}

// Accrue UPT for working a shift (earn 15 minutes per shift worked)
export function accrueUPT(guildId: string, userId: string, minutes: number = 15): void {
  const db = getDB();
  const now = new Date().toISOString();
  const today = now.split('T')[0];
  
  // Initialize if doesn't exist
  initializeUPTBalance(guildId, userId);
  
  // Update balance
  db.prepare(`
    UPDATE upt_balances
    SET balance_minutes = balance_minutes + ?,
        last_accrual_date = ?,
        updated_at = ?
    WHERE guild_id = ? AND user_id = ?
  `).run(minutes, today, now, guildId, userId);
  
  // Log transaction
  db.prepare(`
    INSERT INTO upt_transactions (guild_id, user_id, amount_minutes, reason, related_date, created_at)
    VALUES (?, ?, ?, 'accrual', ?, ?)
  `).run(guildId, userId, minutes, today, now);
}

// Deduct UPT (for lateness or absence)
export function deductUPT(guildId: string, userId: string, minutes: number, reason: string, relatedDate?: string): boolean {
  const db = getDB();
  const now = new Date().toISOString();
  
  const balance = getUPTBalance(guildId, userId);
  
  if (balance < minutes) {
    return false; // Not enough UPT
  }
  
  // Deduct balance
  db.prepare(`
    UPDATE upt_balances
    SET balance_minutes = balance_minutes - ?,
        updated_at = ?
    WHERE guild_id = ? AND user_id = ?
  `).run(minutes, now, guildId, userId);
  
  // Log transaction
  db.prepare(`
    INSERT INTO upt_transactions (guild_id, user_id, amount_minutes, reason, related_date, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(guildId, userId, -minutes, reason, relatedDate || now.split('T')[0], now);
  
  return true;
}

// Get UPT transaction history
export function getUPTHistory(guildId: string, userId: string, limit: number = 20): Array<any> {
  const db = getDB();
  
  return db.prepare(`
    SELECT * FROM upt_transactions
    WHERE guild_id = ? AND user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(guildId, userId, limit) as any[];
}

// ============ Write-up System ============

// Issue a write-up
export function issueWriteup(
  guildId: string,
  userId: string,
  reason: string,
  issuedBy: string,
  severity: 'standard' | 'severe' = 'standard',
  notes?: string,
  relatedDate?: string
): number {
  const db = getDB();
  const now = new Date().toISOString();
  
  const result = db.prepare(`
    INSERT INTO staff_writeups (guild_id, user_id, reason, issued_by, severity, notes, related_date, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(guildId, userId, reason, issuedBy, severity, notes || null, relatedDate || now.split('T')[0], now);
  
  return result.lastInsertRowid as number;
}

// Get write-up count for user
export function getWriteupCount(guildId: string, userId: string): number {
  const db = getDB();
  
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM staff_writeups
    WHERE guild_id = ? AND user_id = ?
  `).get(guildId, userId) as any;
  
  return row.count;
}

// Get all write-ups for user
export function getUserWriteups(guildId: string, userId: string): Array<any> {
  const db = getDB();
  
  return db.prepare(`
    SELECT * FROM staff_writeups
    WHERE guild_id = ? AND user_id = ?
    ORDER BY created_at DESC
  `).all(guildId, userId) as any[];
}

// Clear all write-ups for user (after demotion or manual clear)
export function clearWriteups(guildId: string, userId: string): void {
  const db = getDB();
  
  db.prepare(`
    DELETE FROM staff_writeups
    WHERE guild_id = ? AND user_id = ?
  `).run(guildId, userId);
}

// ============ Missed Shift Tracking ============

// Record a missed shift (only for SCHEDULED shifts)
export function recordMissedShift(
  guildId: string,
  userId: string,
  scheduledDate: string,
  weekStart: string,
  dayOfWeek: string,
  uptUsed: boolean = false
): void {
  const db = getDB();
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO missed_shifts (guild_id, user_id, scheduled_date, week_start, day_of_week, upt_used, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(guildId, userId, scheduledDate, weekStart, dayOfWeek, uptUsed ? 1 : 0, now);
}

// Get missed SCHEDULED shift count (for demotion purposes)
export function getMissedScheduledShiftCount(guildId: string, userId: string): number {
  const db = getDB();
  
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM missed_shifts
    WHERE guild_id = ? AND user_id = ? AND upt_used = 0
  `).get(guildId, userId) as any;
  
  return row.count;
}

// Clear missed shifts (after demotion or reset)
export function clearMissedShifts(guildId: string, userId: string): void {
  const db = getDB();
  
  db.prepare(`
    DELETE FROM missed_shifts
    WHERE guild_id = ? AND user_id = ?
  `).run(guildId, userId);
}
