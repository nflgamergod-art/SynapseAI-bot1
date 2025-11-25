import { getDB } from './db';

export interface PayrollConfig {
  guild_id: string;
  hourly_rate: number;
  max_hours_per_day: number;
  max_days_per_week: number;
  auto_break_minutes: number;
  is_enabled: boolean;
}

export interface Break {
  id: number;
  shift_id: number;
  break_start: string;
  break_end?: string;
  duration_minutes?: number;
}

export interface PayPeriod {
  id: number;
  guild_id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  total_hours: number;
  total_pay: number;
  paid: boolean;
  paid_at?: string;
}

// Initialize payroll schema
export function initPayrollSchema() {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS payroll_config (
      guild_id TEXT PRIMARY KEY,
      hourly_rate REAL NOT NULL DEFAULT 15.0,
      max_hours_per_day INTEGER NOT NULL DEFAULT 5,
      max_days_per_week INTEGER NOT NULL DEFAULT 4,
      auto_break_minutes INTEGER NOT NULL DEFAULT 10,
      is_enabled INTEGER NOT NULL DEFAULT 1
    );
    
    CREATE TABLE IF NOT EXISTS pay_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      target_type TEXT NOT NULL CHECK(target_type IN ('user', 'role')),
      multiplier REAL NOT NULL DEFAULT 1.0,
      reason TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      UNIQUE(guild_id, target_id, target_type)
    );
    CREATE INDEX IF NOT EXISTS idx_pay_adjustments ON pay_adjustments(guild_id, target_id, target_type);
    
    CREATE TABLE IF NOT EXISTS breaks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL,
      break_start TEXT NOT NULL,
      break_end TEXT,
      duration_minutes INTEGER,
      FOREIGN KEY (shift_id) REFERENCES shifts(id)
    );
    CREATE INDEX IF NOT EXISTS idx_breaks_shift ON breaks(shift_id);
    CREATE INDEX IF NOT EXISTS idx_breaks_active ON breaks(shift_id, break_end);
    
    CREATE TABLE IF NOT EXISTS pay_periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      total_hours REAL NOT NULL,
      total_pay REAL NOT NULL,
      paid INTEGER NOT NULL DEFAULT 0,
      paid_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pay_periods_guild ON pay_periods(guild_id);
    CREATE INDEX IF NOT EXISTS idx_pay_periods_user ON pay_periods(guild_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_pay_periods_paid ON pay_periods(guild_id, paid);
    
    CREATE TABLE IF NOT EXISTS activity_tracker (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      shift_id INTEGER NOT NULL,
      last_activity TEXT NOT NULL,
      UNIQUE(guild_id, user_id, shift_id),
      FOREIGN KEY (shift_id) REFERENCES shifts(id)
    );
    CREATE INDEX IF NOT EXISTS idx_activity_tracker ON activity_tracker(guild_id, user_id);
    
    CREATE TABLE IF NOT EXISTS payroll_cooldowns (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      cooldown_until TEXT NOT NULL,
      PRIMARY KEY (guild_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_payroll_cooldowns ON payroll_cooldowns(guild_id, user_id, cooldown_until);
  `);
}

// Get or create payroll config
export function getPayrollConfig(guildId: string): PayrollConfig {
  const db = getDB();
  let config = db.prepare(`
    SELECT * FROM payroll_config WHERE guild_id = ?
  `).get(guildId) as any;
  
  if (!config) {
    db.prepare(`
      INSERT INTO payroll_config (guild_id, hourly_rate, max_hours_per_day, max_days_per_week, auto_break_minutes, is_enabled)
      VALUES (?, 15.0, 5, 5, 10, 1)
    `).run(guildId);
    
    config = db.prepare(`
      SELECT * FROM payroll_config WHERE guild_id = ?
    `).get(guildId) as any;
  }
  
  return {
    guild_id: config.guild_id,
    hourly_rate: config.hourly_rate,
    max_hours_per_day: config.max_hours_per_day,
    max_days_per_week: config.max_days_per_week,
    auto_break_minutes: config.auto_break_minutes,
    is_enabled: config.is_enabled === 1
  };
}

// Update payroll config
export function updatePayrollConfig(guildId: string, updates: Partial<PayrollConfig>): void {
  const db = getDB();
  const fields: string[] = [];
  const values: any[] = [];
  
  if (updates.hourly_rate !== undefined) {
    fields.push('hourly_rate = ?');
    values.push(updates.hourly_rate);
  }
  if (updates.max_hours_per_day !== undefined) {
    fields.push('max_hours_per_day = ?');
    values.push(updates.max_hours_per_day);
  }
  if (updates.max_days_per_week !== undefined) {
    fields.push('max_days_per_week = ?');
    values.push(updates.max_days_per_week);
  }
  if (updates.auto_break_minutes !== undefined) {
    fields.push('auto_break_minutes = ?');
    values.push(updates.auto_break_minutes);
  }
  if (updates.is_enabled !== undefined) {
    fields.push('is_enabled = ?');
    values.push(updates.is_enabled ? 1 : 0);
  }
  
  if (fields.length === 0) return;
  
  values.push(guildId);
  db.prepare(`
    UPDATE payroll_config
    SET ${fields.join(', ')}
    WHERE guild_id = ?
  `).run(...values);
}

// Check if user can clock in (respecting limits)
export function canClockIn(guildId: string, userId: string): { canClock: boolean; reason?: string } {
  const config = getPayrollConfig(guildId);
  
  if (!config.is_enabled) {
    return { canClock: false, reason: 'Clock-in system is currently disabled by administration.' };
  }
  
  // Check if user is on cooldown
  const cooldownCheck = isOnCooldown(guildId, userId);
  if (cooldownCheck.onCooldown) {
    return { canClock: false, reason: `You're on cooldown for ${cooldownCheck.remainingTime}. You reached your daily limit.` };
  }
  
  const db = getDB();
  const now = new Date();
  
  // Check hours today
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  // Sum net minutes for today's completed shifts (duration - breaks)
  const todayShifts = db.prepare(`
    SELECT id, COALESCE(duration_minutes, 0) as duration_minutes
    FROM shifts
    WHERE guild_id = ? AND user_id = ? AND clock_in >= ? AND clock_out IS NOT NULL
  `).all(guildId, userId, todayStart) as any[];
  let workedMinutesToday = 0;
  for (const s of todayShifts) {
    const b = db.prepare(`
      SELECT COALESCE(SUM(duration_minutes), 0) as total
      FROM breaks
      WHERE shift_id = ? AND break_end IS NOT NULL
    `).get(s.id) as any;
    workedMinutesToday += Math.max(0, s.duration_minutes - (b?.total || 0));
  }
  const todayHours = workedMinutesToday / 60;
  if (todayHours >= config.max_hours_per_day) {
    return { canClock: false, reason: `You've reached the daily limit of ${config.max_hours_per_day} hours.` };
  }
  
  // Check days this week
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
  weekStart.setHours(0, 0, 0, 0);
  
  const daysWorked = db.prepare(`
    SELECT COUNT(DISTINCT DATE(clock_in)) as days
    FROM shifts
    WHERE guild_id = ? AND user_id = ? AND clock_in >= ? AND clock_out IS NOT NULL
  `).get(guildId, userId, weekStart.toISOString()) as any;
  
  if (daysWorked.days >= config.max_days_per_week) {
    return { canClock: false, reason: `You've reached the weekly limit of ${config.max_days_per_week} days.` };
  }
  
  return { canClock: true };
}

// Track user activity
export function trackActivity(guildId: string, userId: string, shiftId: number): void {
  const db = getDB();
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO activity_tracker (guild_id, user_id, shift_id, last_activity)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id, shift_id) 
    DO UPDATE SET last_activity = ?
  `).run(guildId, userId, shiftId, now, now);
}

// Start auto break
export function startAutoBreak(shiftId: number): number {
  const db = getDB();
  const now = new Date().toISOString();
  
  // Check if already on break
  const activeBreak = db.prepare(`
    SELECT id FROM breaks WHERE shift_id = ? AND break_end IS NULL
  `).get(shiftId);
  
  if (activeBreak) return (activeBreak as any).id;
  
  const result = db.prepare(`
    INSERT INTO breaks (shift_id, break_start)
    VALUES (?, ?)
  `).run(shiftId, now);
  
  return result.lastInsertRowid as number;
}

// End auto break
export function endAutoBreak(shiftId: number): void {
  const db = getDB();
  const now = new Date();
  
  const activeBreak = db.prepare(`
    SELECT id, break_start FROM breaks 
    WHERE shift_id = ? AND break_end IS NULL
  `).get(shiftId) as any;
  
  if (!activeBreak) return;
  
  const breakStart = new Date(activeBreak.break_start);
  const durationMs = now.getTime() - breakStart.getTime();
  const durationMinutes = Math.floor(durationMs / 60000);
  
  db.prepare(`
    UPDATE breaks
    SET break_end = ?, duration_minutes = ?
    WHERE id = ?
  `).run(now.toISOString(), durationMinutes, activeBreak.id);
}

// Check for inactive users and auto-break them
export function checkAndAutoBreak(guildId: string): Array<{ userId: string; shiftId: number }> {
  const config = getPayrollConfig(guildId);
  const db = getDB();
  const now = new Date();
  const cutoff = new Date(now.getTime() - config.auto_break_minutes * 60000).toISOString();
  
  const inactive = db.prepare(`
    SELECT a.user_id, a.shift_id, a.last_activity
    FROM activity_tracker a
    JOIN shifts s ON a.shift_id = s.id
    WHERE a.guild_id = ? 
      AND a.last_activity < ?
      AND s.clock_out IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM breaks b 
        WHERE b.shift_id = a.shift_id AND b.break_end IS NULL
      )
  `).all(guildId, cutoff) as any[];
  
  const autoBroken: Array<{ userId: string; shiftId: number }> = [];
  
  for (const user of inactive) {
    startAutoBreak(user.shift_id);
    autoBroken.push({ userId: user.user_id, shiftId: user.shift_id });
  }
  
  return autoBroken;
}

// Get active break for shift
export function getActiveBreak(shiftId: number): Break | null {
  const db = getDB();
  const row = db.prepare(`
    SELECT * FROM breaks WHERE shift_id = ? AND break_end IS NULL
  `).get(shiftId) as any;
  
  if (!row) return null;
  
  return {
    id: row.id,
    shift_id: row.shift_id,
    break_start: row.break_start,
    break_end: row.break_end,
    duration_minutes: row.duration_minutes
  };
}

// Get all breaks for a shift
export function getShiftBreaks(shiftId: number): Break[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT * FROM breaks WHERE shift_id = ? ORDER BY break_start ASC
  `).all(shiftId) as any[];
  
  return rows.map(row => ({
    id: row.id,
    shift_id: row.shift_id,
    break_start: row.break_start,
    break_end: row.break_end,
    duration_minutes: row.duration_minutes
  }));
}

// Calculate pay for completed shifts
export function calculatePay(guildId: string, userId: string, startDate: string, endDate: string): {
  totalHours: number;
  totalPay: number;
  shifts: number;
} {
  const config = getPayrollConfig(guildId);
  const db = getDB();
  
  const shifts = db.prepare(`
    SELECT id, duration_minutes
    FROM shifts
    WHERE guild_id = ? AND user_id = ? 
      AND clock_in >= ? AND clock_in <= ?
      AND clock_out IS NOT NULL
  `).all(guildId, userId, startDate, endDate) as any[];
  
  let totalMinutes = 0;
  
  for (const shift of shifts) {
    let shiftMinutes = shift.duration_minutes;
    
    // Subtract break time
    const breaks = db.prepare(`
      SELECT COALESCE(SUM(duration_minutes), 0) as total
      FROM breaks
      WHERE shift_id = ? AND break_end IS NOT NULL
    `).get(shift.id) as any;
    
    shiftMinutes -= breaks.total;
    totalMinutes += shiftMinutes;
  }
  
  const totalHours = totalMinutes / 60;
  const totalPay = totalHours * config.hourly_rate;
  
  return {
    totalHours: Math.round(totalHours * 100) / 100,
    totalPay: Math.round(totalPay * 100) / 100,
    shifts: shifts.length
  };
}

// Create pay period
export function createPayPeriod(
  guildId: string,
  userId: string,
  startDate: string,
  endDate: string
): number {
  const payData = calculatePay(guildId, userId, startDate, endDate);
  const db = getDB();
  
  const result = db.prepare(`
    INSERT INTO pay_periods (guild_id, user_id, start_date, end_date, total_hours, total_pay, paid, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `).run(guildId, userId, startDate, endDate, payData.totalHours, payData.totalPay, new Date().toISOString());
  
  return result.lastInsertRowid as number;
}

// Mark pay period as paid
export function markPayPeriodPaid(payPeriodId: number): void {
  const db = getDB();
  db.prepare(`
    UPDATE pay_periods
    SET paid = 1, paid_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), payPeriodId);
}

// Get unpaid pay periods
export function getUnpaidPayPeriods(guildId: string, userId?: string): PayPeriod[] {
  const db = getDB();
  const query = userId
    ? `SELECT * FROM pay_periods WHERE guild_id = ? AND user_id = ? AND paid = 0 ORDER BY end_date DESC`
    : `SELECT * FROM pay_periods WHERE guild_id = ? AND paid = 0 ORDER BY end_date DESC`;
  
  const params = userId ? [guildId, userId] : [guildId];
  const rows = db.prepare(query).all(...params) as any[];
  
  return rows.map(row => ({
    id: row.id,
    guild_id: row.guild_id,
    user_id: row.user_id,
    start_date: row.start_date,
    end_date: row.end_date,
    total_hours: row.total_hours,
    total_pay: row.total_pay,
    paid: row.paid === 1,
    paid_at: row.paid_at
  }));
}

// Get all pay periods for user
export function getUserPayPeriods(guildId: string, userId: string, limit: number = 10): PayPeriod[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT * FROM pay_periods 
    WHERE guild_id = ? AND user_id = ?
    ORDER BY end_date DESC
    LIMIT ?
  `).all(guildId, userId, limit) as any[];
  
  return rows.map(row => ({
    id: row.id,
    guild_id: row.guild_id,
    user_id: row.user_id,
    start_date: row.start_date,
    end_date: row.end_date,
    total_hours: row.total_hours,
    total_pay: row.total_pay,
    paid: row.paid === 1,
    paid_at: row.paid_at
  }));
}

// Clean up activity tracker when shift ends
export function cleanupActivityTracker(shiftId: number): void {
  const db = getDB();
  db.prepare(`DELETE FROM activity_tracker WHERE shift_id = ?`).run(shiftId);
}

// Force clock out a user (owner command)
export function forceClockOut(guildId: string, userId: string): { success: boolean; message: string; duration?: number } {
  const db = getDB();
  
  const active = db.prepare(`
    SELECT id, clock_in FROM shifts
    WHERE guild_id = ? AND user_id = ? AND clock_out IS NULL
  `).get(guildId, userId) as any;
  
  if (!active) {
    return { success: false, message: 'User is not clocked in!' };
  }
  
  // End any active break first
  endAutoBreak(active.id);
  
  const now = new Date();
  const clockIn = new Date(active.clock_in);
  const durationMs = now.getTime() - clockIn.getTime();
  const durationMinutes = Math.floor(durationMs / 60000);
  
  db.prepare(`
    UPDATE shifts
    SET clock_out = ?, duration_minutes = ?
    WHERE id = ?
  `).run(now.toISOString(), durationMinutes, active.id);
  
  // Clean up activity tracker
  cleanupActivityTracker(active.id);
  
  return { success: true, message: 'User clocked out successfully!', duration: durationMinutes };
}

// Check if user has reached daily limit and should be auto-clocked-out
export function checkDailyLimitReached(guildId: string, userId: string, currentShiftId: number): boolean {
  const config = getPayrollConfig(guildId);
  const db = getDB();
  const now = new Date();
  
  // Get current shift info
  const shift = db.prepare(`
    SELECT clock_in FROM shifts WHERE id = ? AND clock_out IS NULL
  `).get(currentShiftId) as any;
  
  if (!shift) return false;
  
  // Calculate net working time for the current shift (exclude breaks)
  const clockIn = new Date(shift.clock_in);
  const elapsedMinutes = Math.floor((now.getTime() - clockIn.getTime()) / 60000);
  const completedBreaks = db.prepare(`
    SELECT COALESCE(SUM(duration_minutes), 0) as total FROM breaks WHERE shift_id = ? AND break_end IS NOT NULL
  `).get(currentShiftId) as any;
  const activeBreak = db.prepare(`
    SELECT break_start FROM breaks WHERE shift_id = ? AND break_end IS NULL
  `).get(currentShiftId) as any;
  const activeBreakMinutes = activeBreak ? Math.floor((now.getTime() - new Date(activeBreak.break_start).getTime()) / 60000) : 0;
  const netMinutes = Math.max(0, elapsedMinutes - (completedBreaks?.total || 0) - activeBreakMinutes);
  const netHours = netMinutes / 60;

  // Check if current shift has reached the limit based on net hours (no breaks)
  if (netHours >= config.max_hours_per_day) {
    return true;
  }
  
  return false;
}

// Set 24h clock-in cooldown
export function set24HourCooldown(guildId: string, userId: string): void {
  const db = getDB();
  const cooldownUntil = new Date();
  cooldownUntil.setHours(cooldownUntil.getHours() + 24);
  
  db.prepare(`
    INSERT INTO payroll_cooldowns (guild_id, user_id, cooldown_until)
    VALUES (?, ?, ?)
    ON CONFLICT(guild_id, user_id)
    DO UPDATE SET cooldown_until = ?
  `).run(guildId, userId, cooldownUntil.toISOString(), cooldownUntil.toISOString());
}

// Check if user is on cooldown
export function isOnCooldown(guildId: string, userId: string): { onCooldown: boolean; remainingTime?: string } {
  const db = getDB();
  const now = new Date();
  
  const cooldown = db.prepare(`
    SELECT cooldown_until FROM payroll_cooldowns
    WHERE guild_id = ? AND user_id = ?
  `).get(guildId, userId) as any;
  
  if (!cooldown) return { onCooldown: false };
  
  const cooldownUntil = new Date(cooldown.cooldown_until);
  if (now >= cooldownUntil) {
    // Cooldown expired, clean up
    db.prepare(`DELETE FROM payroll_cooldowns WHERE guild_id = ? AND user_id = ?`).run(guildId, userId);
    return { onCooldown: false };
  }
  
  const remainingMs = cooldownUntil.getTime() - now.getTime();
  const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
  const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
  const remainingTime = `${remainingHours}h ${remainingMinutes}m`;
  
  return { onCooldown: true, remainingTime };
}

// Reset user's payroll hours (delete shifts within time period)
export function resetPayrollHours(guildId: string, userId: string, days: number = 30): { deletedShifts: number; deletedHours: number } {
  const db = getDB();
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(now.getDate() - days);
  
  // Get total hours before deletion
  const totalMinutes = db.prepare(`
    SELECT COALESCE(SUM(duration_minutes), 0) as total
    FROM shifts
    WHERE guild_id = ? AND user_id = ? AND clock_in >= ? AND clock_out IS NOT NULL
  `).get(guildId, userId, startDate.toISOString()) as any;
  
  // Count shifts to be deleted
  const shiftCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM shifts
    WHERE guild_id = ? AND user_id = ? AND clock_in >= ?
  `).get(guildId, userId, startDate.toISOString()) as any;
  
  // Get shift IDs to delete breaks
  const shiftIds = db.prepare(`
    SELECT id FROM shifts
    WHERE guild_id = ? AND user_id = ? AND clock_in >= ?
  `).all(guildId, userId, startDate.toISOString()) as any[];
  
  // Delete breaks associated with these shifts
  for (const shift of shiftIds) {
    db.prepare(`DELETE FROM breaks WHERE shift_id = ?`).run(shift.id);
    db.prepare(`DELETE FROM activity_tracker WHERE shift_id = ?`).run(shift.id);
  }
  
  // Delete shifts
  db.prepare(`
    DELETE FROM shifts
    WHERE guild_id = ? AND user_id = ? AND clock_in >= ?
  `).run(guildId, userId, startDate.toISOString());
  
  // Delete unpaid pay periods for this user in this time range
  db.prepare(`
    DELETE FROM pay_periods
    WHERE guild_id = ? AND user_id = ? AND paid = 0 AND start_date >= ?
  `).run(guildId, userId, startDate.toISOString());
  
  // Clear cooldown if exists
  db.prepare(`DELETE FROM payroll_cooldowns WHERE guild_id = ? AND user_id = ?`).run(guildId, userId);
  
  return {
    deletedShifts: shiftCount.count,
    deletedHours: Math.round((totalMinutes.total / 60) * 100) / 100
  };
}

// Set or update pay adjustment for user or role
export function setPayAdjustment(
  guildId: string,
  targetId: string,
  targetType: 'user' | 'role',
  multiplier: number,
  reason: string,
  createdBy: string
): void {
  const db = getDB();
  db.prepare(`
    INSERT INTO pay_adjustments (guild_id, target_id, target_type, multiplier, reason, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, target_id, target_type)
    DO UPDATE SET multiplier = ?, reason = ?, created_at = ?, created_by = ?
  `).run(
    guildId, targetId, targetType, multiplier, reason, new Date().toISOString(), createdBy,
    multiplier, reason, new Date().toISOString(), createdBy
  );
}

// Get pay adjustment for specific target
export function getPayAdjustment(guildId: string, targetId: string, targetType: 'user' | 'role'): number | null {
  const db = getDB();
  const row = db.prepare(`
    SELECT multiplier FROM pay_adjustments
    WHERE guild_id = ? AND target_id = ? AND target_type = ?
  `).get(guildId, targetId, targetType) as any;
  
  return row ? row.multiplier : null;
}

// Get effective pay multiplier for a user (considers user and all their roles)
export function getEffectivePayMultiplier(guildId: string, userId: string, roleIds: string[]): number {
  const db = getDB();
  
  // Check user-specific adjustment first (highest priority)
  const userAdj = getPayAdjustment(guildId, userId, 'user');
  if (userAdj !== null) return userAdj;
  
  // Check role adjustments (use highest multiplier)
  let highestMultiplier = 1.0;
  for (const roleId of roleIds) {
    const roleAdj = getPayAdjustment(guildId, roleId, 'role');
    if (roleAdj !== null && roleAdj > highestMultiplier) {
      highestMultiplier = roleAdj;
    }
  }
  
  return highestMultiplier;
}

// List all pay adjustments
export function listPayAdjustments(guildId: string): Array<{
  targetId: string;
  targetType: 'user' | 'role';
  multiplier: number;
  reason: string;
  createdAt: string;
  createdBy: string;
}> {
  const db = getDB();
  const rows = db.prepare(`
    SELECT target_id, target_type, multiplier, reason, created_at, created_by
    FROM pay_adjustments
    WHERE guild_id = ?
    ORDER BY created_at DESC
  `).all(guildId) as any[];
  
  return rows.map(row => ({
    targetId: row.target_id,
    targetType: row.target_type,
    multiplier: row.multiplier,
    reason: row.reason,
    createdAt: row.created_at,
    createdBy: row.created_by
  }));
}

// Remove pay adjustment
export function removePayAdjustment(guildId: string, targetId: string, targetType: 'user' | 'role'): boolean {
  const db = getDB();
  const result = db.prepare(`
    DELETE FROM pay_adjustments
    WHERE guild_id = ? AND target_id = ? AND target_type = ?
  `).run(guildId, targetId, targetType);
  
  return result.changes > 0;
}

// Calculate pay with multiplier applied
export function calculatePayWithMultiplier(
  guildId: string,
  userId: string,
  roleIds: string[],
  startDate: string,
  endDate: string
): {
  totalHours: number;
  basePay: number;
  multiplier: number;
  totalPay: number;
  shifts: number;
} {
  const basePayData = calculatePay(guildId, userId, startDate, endDate);
  const multiplier = getEffectivePayMultiplier(guildId, userId, roleIds);
  const adjustedPay = basePayData.totalPay * multiplier;
  
  return {
    totalHours: basePayData.totalHours,
    basePay: basePayData.totalPay,
    multiplier,
    totalPay: Math.round(adjustedPay * 100) / 100,
    shifts: basePayData.shifts
  };
}

// Get total unpaid balance for user across all pay periods
export function getTotalUnpaidBalance(guildId: string, userId: string): {
  totalPay: number;
  totalHours: number;
  periods: number;
} {
  const db = getDB();
  const result = db.prepare(`
    SELECT 
      COALESCE(SUM(total_pay), 0) as total_pay,
      COALESCE(SUM(total_hours), 0) as total_hours,
      COUNT(*) as periods
    FROM pay_periods
    WHERE guild_id = ? AND user_id = ? AND paid = 0
  `).get(guildId, userId) as any;
  
  return {
    totalPay: Math.round(result.total_pay * 100) / 100,
    totalHours: Math.round(result.total_hours * 100) / 100,
    periods: result.periods
  };
}

// Get all users with unpaid balances (for owner's daily report)
export function getAllUnpaidBalances(guildId: string): Array<{
  userId: string;
  totalPay: number;
  totalHours: number;
  periods: number;
}> {
  const db = getDB();
  const rows = db.prepare(`
    SELECT 
      user_id,
      COALESCE(SUM(total_pay), 0) as total_pay,
      COALESCE(SUM(total_hours), 0) as total_hours,
      COUNT(*) as periods
    FROM pay_periods
    WHERE guild_id = ? AND paid = 0
    GROUP BY user_id
    ORDER BY total_pay DESC
  `).all(guildId) as any[];
  
  return rows.map(row => ({
    userId: row.user_id,
    totalPay: Math.round(row.total_pay * 100) / 100,
    totalHours: Math.round(row.total_hours * 100) / 100,
    periods: row.periods
  }));
}

// Check if break time counts toward daily limit (it does!)
export function getTodayNetWorkingMinutes(guildId: string, userId: string, includeActiveShift: boolean = true): number {
  const db = getDB();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  
  // Get completed shifts today
  const completedShifts = db.prepare(`
    SELECT id, duration_minutes
    FROM shifts
    WHERE guild_id = ? AND user_id = ? AND clock_in >= ? AND clock_out IS NOT NULL
  `).all(guildId, userId, todayStart) as any[];
  
  let totalMinutes = 0;
  
  // For completed shifts: duration includes break time, so total shift time is counted
  for (const shift of completedShifts) {
    totalMinutes += shift.duration_minutes || 0;
  }
  
  // Include active shift if requested
  if (includeActiveShift) {
    const activeShift = db.prepare(`
      SELECT id, clock_in FROM shifts
      WHERE guild_id = ? AND user_id = ? AND clock_out IS NULL
    `).get(guildId, userId) as any;
    
    if (activeShift) {
      const clockIn = new Date(activeShift.clock_in);
      const elapsedMinutes = Math.floor((now.getTime() - clockIn.getTime()) / 60000);
      totalMinutes += elapsedMinutes;
    }
  }
  
  return totalMinutes;
}

// Initialize on import
initPayrollSchema();
