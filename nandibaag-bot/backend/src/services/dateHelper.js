/**
 * Date Helper Service — Single Source of Truth for All Date/Day Calculations
 * 
 * This module ensures that:
 * 1. All date calculations use IST (Asia/Kolkata) timezone consistently.
 * 2. Day-of-week names are computed in CODE, never guessed by the LLM.
 * 3. A ready-made date table is injected into the system prompt so the AI
 *    only reads it — never computes it.
 * 4. The same logic backs both pricing calculations and the AI's displayed
 *    day names, guaranteeing they can never disagree.
 *
 * WEEKDAY = Mon, Tue, Wed, Thu
 * WEEKEND = Fri, Sat, Sun  ← Friday IS a weekend
 */

const IST_TZ = 'Asia/Kolkata';

/**
 * Returns the current date/time in IST as a Date-like object.
 * Uses Intl to extract IST components so it works on any server timezone.
 */
const getTodayIST = () => {
  const now = new Date();
  // Extract IST date parts via Intl
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);

  const year = parseInt(parts.find(p => p.type === 'year').value, 10);
  const month = parseInt(parts.find(p => p.type === 'month').value, 10) - 1;
  const day = parseInt(parts.find(p => p.type === 'day').value, 10);

  return new Date(year, month, day);
};

/**
 * Returns the full day name for a date (e.g. "Monday", "Friday").
 * Always uses IST-aware calculation via getDay() on a timezone-normalized date.
 */
const getDayName = (dateInput) => {
  const d = normalizeDate(dateInput);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return dayNames[d.getDay()];
};

/**
 * Returns the short day name (e.g. "Mon", "Fri").
 */
const getShortDayName = (dateInput) => {
  const d = normalizeDate(dateInput);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return dayNames[d.getDay()];
};

/**
 * Returns true if the date is a weekday (Mon–Thu).
 */
const isWeekday = (dateInput) => {
  const d = normalizeDate(dateInput);
  const day = d.getDay();
  // Mon=1, Tue=2, Wed=3, Thu=4
  return day >= 1 && day <= 4;
};

/**
 * Returns true if the date is a weekend (Fri, Sat, Sun).
 */
const isWeekend = (dateInput) => {
  return !isWeekday(dateInput);
};

/**
 * Normalizes any date input (Date object, ISO string, etc.) to a local midnight Date.
 * This prevents timezone-shift issues when parsing "2026-08-15" strings.
 */
function normalizeDate(dateInput) {
  if (dateInput instanceof Date) {
    return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate());
  }
  if (typeof dateInput === 'string') {
    const cleanStr = dateInput.split('T')[0];
    const parts = cleanStr.split('-');
    if (parts.length === 3) {
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
  }
  const d = new Date(dateInput);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Builds an exact night-by-night breakdown for any check-in/check-out range.
 * Each entry lists the date, day name, and WEEKDAY/WEEKEND classification.
 *
 * @param {Date|string} checkInDate
 * @param {Date|string} checkOutDate
 * @returns {Array<{date: string, isoDate: string, dayName: string, type: string}>}
 */
const buildDateRangeTable = (checkInDate, checkOutDate) => {
  const nights = [];
  let current = normalizeDate(checkInDate);
  const end = normalizeDate(checkOutDate);

  while (current < end) {
    const dayName = getDayName(current);
    const weekend = isWeekend(current);
    const day = current.getDate();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[current.getMonth()];

    // Ordinal suffix
    let suffix = 'th';
    if (day === 1 || day === 21 || day === 31) suffix = 'st';
    else if (day === 2 || day === 22) suffix = 'nd';
    else if (day === 3 || day === 23) suffix = 'rd';

    nights.push({
      date: `${day}${suffix} ${month}`,
      isoDate: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`,
      dayName,
      type: weekend ? 'WEEKEND' : 'WEEKDAY'
    });

    current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
  }

  return nights;
};

/**
 * Generates a 30-day calendar reference table from today for the system prompt.
 * This replaces the old hardcoded "August 2026 Calendar Reference" block.
 */
const buildCalendarReference = (fromDate) => {
  const start = fromDate ? normalizeDate(fromDate) : getTodayIST();
  const lines = [];

  for (let i = 0; i < 30; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const dayName = getDayName(d);
    const shortDay = getShortDayName(d);
    const day = d.getDate();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[d.getMonth()];
    const wknd = isWeekend(d);
    const type = wknd ? 'WEEKEND' : 'WEEKDAY';
    const coupleRate = wknd ? '₹6,500' : '₹5,500';
    const groupRate = wknd ? '₹3,000' : '₹2,000';

    lines.push(`- ${day} ${month} (${shortDay}) = ${type} (${coupleRate} couple / ${groupRate} group)`);
  }

  return `Next 30 Days Calendar Reference (auto-generated, DO NOT override):\n${lines.join('\n')}`;
};

/**
 * Formats a date range table as plain text for injection into the system prompt.
 * The AI is instructed to READ this table exactly — never re-compute it.
 *
 * @param {Date|string} checkInDate
 * @param {Date|string} checkOutDate
 * @returns {string}
 */
const formatDateTableForPrompt = (checkInDate, checkOutDate) => {
  const nights = buildDateRangeTable(checkInDate, checkOutDate);

  if (nights.length === 0) return '';

  let table = `EXACT DATE TABLE FOR THIS STAY (already calculated — DO NOT recalculate, DO NOT guess, just use this):\n`;
  nights.forEach(n => {
    table += `- ${n.date} (${n.dayName}) = ${n.type}\n`;
  });

  const weekdayCount = nights.filter(n => n.type === 'WEEKDAY').length;
  const weekendCount = nights.filter(n => n.type === 'WEEKEND').length;
  table += `Total nights: ${nights.length} (${weekdayCount} weekday + ${weekendCount} weekend)\n`;
  table += `\nIMPORTANT: Use the day names and WEEKDAY/WEEKEND types from this table EXACTLY. Do NOT calculate or guess day names yourself — you are frequently wrong when you try.`;

  return table;
};

module.exports = {
  getTodayIST,
  getDayName,
  getShortDayName,
  isWeekday,
  isWeekend,
  normalizeDate,
  buildDateRangeTable,
  buildCalendarReference,
  formatDateTableForPrompt
};
