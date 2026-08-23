const getDayName = (date) => {
  try {
    if (date && typeof date === 'object' && date.date instanceof Date) {
      date = date.date;
    }
    if (typeof date === 'string') {
      date = new Date(date);
    }

    if (!(date instanceof Date) || isNaN(date)) {
      console.error('[DateHelper:DayName] Invalid date:', date);
      return 'INVALID';
    }

    // CRITICAL: Use ISO string to avoid timezone issues
    const dateISO = date.toISOString().split('T')[0]; // YYYY-MM-DD
    
    console.log('[DateHelper:DayName] Date:', dateISO);

    // Array of days (Sunday = 0, Monday = 1, etc.)
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Get day of week (0-6)
    const dayOfWeek = date.getUTCDay(); // Use UTC to avoid timezone
    const dayName = days[dayOfWeek];

    console.log('[DateHelper:DayName] Day of week:', dayOfWeek, '→', dayName);

    return dayName;
  } catch (error) {
    console.error('[DateHelper:DayName] Error:', error.message);
    return 'UNKNOWN';
  }
};

const formatDateDDMMYYYY = (date) => {
  try {
    if (date && typeof date === 'object' && date.date instanceof Date) {
      date = date.date;
    }
    if (typeof date === 'string') {
      date = new Date(date);
    }

    if (!(date instanceof Date) || isNaN(date)) {
      console.error('[DateHelper:Format] Invalid date:', date);
      return 'INVALID';
    }

    // Use UTC to avoid timezone issues
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();

    return `${day}/${month}/${year}`;
  } catch (error) {
    console.error('[DateHelper:Format] Error:', error.message);
    return 'INVALID';
  }
};

const isWeekday = (date) => {
  try {
    if (date && typeof date === 'object' && date.date instanceof Date) {
      date = date.date;
    }
    if (typeof date === 'string') {
      date = new Date(date);
    }

    const dayOfWeek = date.getUTCDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
    
    console.log('[DateHelper:IsWeekday] Date:', formatDateDDMMYYYY(date), 'Day:', dayOfWeek, 'Weekday:', !isWeekend);

    return !isWeekend;
  } catch (error) {
    console.error('[DateHelper:IsWeekday] Error:', error.message);
    return true; // Default to weekday on error
  }
};

// CRITICAL: Build accurate date table for system prompt
const buildDateRangeTable = (startDate, endDate) => {
  try {
    console.log('[DateHelper:Table] Building date table');

    if (startDate && typeof startDate === 'object' && startDate.date instanceof Date) {
      startDate = startDate.date;
    }
    if (endDate && typeof endDate === 'object' && endDate.date instanceof Date) {
      endDate = endDate.date;
    }

    let start = new Date(startDate);
    let end = new Date(endDate);

    // Use UTC
    start = new Date(start.toISOString().split('T')[0]);
    end = new Date(end.toISOString().split('T')[0]);

    console.log('[DateHelper:Table] Start:', formatDateDDMMYYYY(start));
    console.log('[DateHelper:Table] End:', formatDateDDMMYYYY(end));

    let table = '';
    table += '📅 DATE REFERENCE TABLE:\n';
    table += '(Read this table - DO NOT calculate day yourself)\n\n';

    let currentDate = new Date(start);
    let dayCount = 0;

    while (currentDate <= end && dayCount < 365) { // Safety limit
      const dateStr = formatDateDDMMYYYY(currentDate);
      const dayName = getDayName(currentDate);
      const dayOfWeek = currentDate.getUTCDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const typeLabel = isWeekend ? 'WEEKEND' : 'WEEKDAY';

      table += `• ${dateStr} = ${dayName} (${typeLabel})\n`;

      console.log(`[DateHelper:Table] ${dateStr} → ${dayName} (${typeLabel})`);

      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      dayCount++;
    }

    table += '\n⚠️ CRITICAL: Use this table above to determine day-of-week.\n';
    table += 'DO NOT calculate day yourself. READ from this table only.\n';

    return table;
  } catch (error) {
    console.error('[DateHelper:Table] Error:', error.message);
    return 'ERROR: Could not build date table\n';
  }
};

const getTodayIST = () => {
  try {
    // Get today's date in IST (India Standard Time = UTC+5:30)
    const now = new Date();
    const istDate = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);

    const dateStr = istDate.toISOString().split('T')[0];
    const dayName = getDayName(istDate);

    console.log('[DateHelper:Today] IST date:', dateStr, dayName);

    return {
      date: istDate,
      dateStr,
      dayName,
      dayOfWeek: istDate.getUTCDay()
    };
  } catch (error) {
    console.error('[DateHelper:Today] Error:', error.message);
    return null;
  }
};

// Helper aliases for backwards compatibility with existing codebase
const formatDateTableForPrompt = (startDate, endDate) => buildDateRangeTable(startDate, endDate);
const buildCalendarReference = () => {
  const today = getTodayIST();
  if (!today) return '';
  const futureDate = new Date(today.date);
  futureDate.setUTCDate(futureDate.getUTCDate() + 60);
  return buildDateRangeTable(today.date, futureDate);
};
const normalizeDate = (d) => {
  if (typeof d === 'string') return new Date(d);
  return d;
};
const isWeekendFn = (d) => !isWeekday(d);

module.exports = {
  getDayName,
  formatDateDDMMYYYY,
  isWeekday,
  isWeekend: isWeekendFn,
  buildDateRangeTable,
  formatDateTableForPrompt,
  buildCalendarReference,
  normalizeDate,
  getTodayIST
};
