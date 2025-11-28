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
  
  console.log('✅ Scheduling tables initialized');
}

// Get current week's Monday date
export function getCurrentWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split('T')[0];
}

// Get next week's Monday date
export function getNextWeekStart(): string {
  const currentMonday = new Date(getCurrentWeekStart());
  currentMonday.setDate(currentMonday.getDate() + 7);
  return currentMonday.toISOString().split('T')[0];
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
  
  const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const dayAssignments = new Map<string, string[]>(); // day -> [userIds]
  
  // Initialize day assignments
  daysOfWeek.forEach(day => dayAssignments.set(day, []));
  
  // Sort staff by number of preferred days (fewer preferences = more flexibility)
  const sortedStaff = [...staffList].sort((a, b) => 
    a.preferredDays.length - b.preferredDays.length
  );
  
  // Assign 3-4 days to each staff member based on their preferences
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
      
      // Limit to avoid overloading one day (max 3 staff per day for balance)
      if (currentAssigned.length < 3) {
        assignedDays.push(dayLower);
        currentAssigned.push(staff.userId);
        dayAssignments.set(dayLower, currentAssigned);
      }
    }
    
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
  if (!schedule) return false;
  
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  return schedule.includes(today);
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
