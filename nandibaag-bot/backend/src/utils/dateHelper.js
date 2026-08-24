/**
 * dateHelper.js — Single Source of Truth for Day-of-Week and Weekend Logic
 *
 * BUSINESS RULE (Nandibaag Resort):
 *   WEEKEND = Friday (5), Saturday (6), Sunday (0)
 *   WEEKDAY = Monday (1), Tuesday (2), Wednesday (3), Thursday (4)
 *
 * All date computations extract true calendar date components to avoid
 * IST/UTC timezone boundary bugs across strings, local Dates, and UTC Dates.
 */

function extractDateComponents(date) {
  if (typeof date === 'string') {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return {
        year: Number(match[1]),
        month: Number(match[2]) - 1,
        day: Number(match[3])
      };
    }
    date = new Date(date);
  }
  if (date && typeof date === 'object' && date.date instanceof Date) {
    date = date.date;
  }
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return null;
  }
  if (date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0) {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth(),
      day: date.getUTCDate()
    };
  } else {
    return {
      year: date.getFullYear(),
      month: date.getMonth(),
      day: date.getDate()
    };
  }
}

function getCanonicalUTCDate(date) {
  const c = extractDateComponents(date);
  if (!c) return null;
  return new Date(Date.UTC(c.year, c.month, c.day));
}

const getDayName = (date) => {
  try {
    const utcDate = getCanonicalUTCDate(date);
    if (!utcDate) {
      console.error('[DateHelper:DayName] Invalid date:', date);
      return 'INVALID';
    }

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = utcDate.getUTCDay();
    return days[dayOfWeek];
  } catch (error) {
    console.error('[DateHelper:DayName] Error:', error.message);
    return 'UNKNOWN';
  }
};

const formatDateDDMMYYYY = (date) => {
  try {
    const utcDate = getCanonicalUTCDate(date);
    if (!utcDate) {
      console.error('[DateHelper:Format] Invalid date:', date);
      return 'INVALID';
    }

    const day = String(utcDate.getUTCDate()).padStart(2, '0');
    const month = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
    const year = utcDate.getUTCFullYear();

    return `${day}/${month}/${year}`;
  } catch (error) {
    console.error('[DateHelper:Format] Error:', error.message);
    return 'INVALID';
  }
};

/**
 * BUSINESS RULE: Weekend = Friday (5), Saturday (6), Sunday (0)
 *                Weekday = Monday (1), Tuesday (2), Wednesday (3), Thursday (4)
 */
const isWeekday = (date) => {
  try {
    const utcDate = getCanonicalUTCDate(date);
    if (!utcDate) return true;

    const dayOfWeek = utcDate.getUTCDay();
    // Weekend = Friday (5), Saturday (6), Sunday (0)
    const isWkend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;

    return !isWkend;
  } catch (error) {
    console.error('[DateHelper:IsWeekday] Error:', error.message);
    return true;
  }
};

/**
 * Weekend = Friday (5), Saturday (6), Sunday (0)
 */
const isWeekendFn = (d) => !isWeekday(d);

/**
 * Build array of night breakdown objects between startDate and endDate.
 * Dual array-string: functions both as an Array of nights AND formats to table string when coerced to string.
 */
const buildDateRangeTable = (startDate, endDate) => {
  try {
    const start = getCanonicalUTCDate(startDate);
    const end = getCanonicalUTCDate(endDate);

    if (!start || !end) {
      const fallback = [];
      fallback.toString = () => 'ERROR: Could not build date table\n';
      return fallback;
    }

    const nights = [];
    let table = '📅 DATE REFERENCE TABLE:\n';
    table += '(Read this table - DO NOT calculate day yourself)\n\n';

    let currentDate = new Date(start);
    let dayCount = 0;

    const isRange = end.getTime() > start.getTime();
    const condition = (cur) => isRange ? cur < end : cur <= end;

    while (condition(currentDate) && dayCount < 365) {
      const dateStr = formatDateDDMMYYYY(currentDate);
      const isoStr = currentDate.toISOString().split('T')[0];
      const dayName = getDayName(currentDate);
      const dayOfWeek = currentDate.getUTCDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;
      const typeLabel = isWeekend ? 'WEEKEND' : 'WEEKDAY';

      nights.push({
        date: new Date(currentDate),
        dateStr,
        isoStr,
        dayName,
        dayOfWeek,
        isWeekend,
        isWeekday: !isWeekend,
        type: typeLabel
      });

      table += `• ${dateStr} = ${dayName} (${typeLabel})\n`;

      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      dayCount++;
    }

    table += `\nTotal nights: ${nights.length}\n`;
    table += '⚠️ CRITICAL: Use this table above to determine day-of-week. DO NOT recalculate day yourself.\n';

    nights.toString = () => table;
    nights.valueOf = () => table;
    nights.includes = function(searchVal) {
      if (typeof searchVal === 'string') return table.includes(searchVal);
      return Array.prototype.includes.call(this, searchVal);
    };

    return nights;
  } catch (error) {
    console.error('[DateHelper:Table] Error:', error.message);
    const fallback = [];
    fallback.toString = () => 'ERROR: Could not build date table\n';
    return fallback;
  }
};

const formatDateTableForPrompt = (startDate, endDate) => {
  const nights = buildDateRangeTable(startDate, endDate);
  const nightCount = nights.length;
  let text = '📅 STAY DATES BREAKDOWN (DO NOT recalculate, use these exact days & rates):\n';
  nights.forEach((n) => {
    text += `  • ${n.dayName} (${n.dateStr}) — ${n.type}\n`;
  });
  text += `  Total nights: ${nightCount}\n`;
  return text;
};

const getTodayIST = () => {
  try {
    const now = new Date();
    const istDate = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    istDate.date = istDate;
    istDate.dateStr = istDate.toISOString().split('T')[0];
    istDate.dayName = getDayName(istDate);
    istDate.dayOfWeek = istDate.getUTCDay();

    return istDate;
  } catch (error) {
    console.error('[DateHelper:Today] Error:', error.message);
    return null;
  }
};

const buildCalendarReference = (startDateInput = null) => {
  try {
    const start = startDateInput ? getCanonicalUTCDate(startDateInput) : getCanonicalUTCDate(getTodayIST());
    if (!start) return '';

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let lines = [];
    lines.push('CALENDAR REFERENCE (Next 30 Days):');

    for (let i = 0; i < 30; i++) {
      const cur = new Date(start);
      cur.setUTCDate(cur.getUTCDate() + i);
      const d = cur.getUTCDate();
      const m = monthNames[cur.getUTCMonth()];
      const dayName = getDayName(cur);
      const isWkend = isWeekendFn(cur);
      const type = isWkend ? 'WEEKEND' : 'WEEKDAY';
      const coupleRate = isWkend ? '₹6,500' : '₹5,500';
      const groupRate = isWkend ? '₹3,000' : '₹2,000';

      lines.push(`- ${d} ${m}: ${dayName} (${type}) | couple: ${coupleRate} | group: ${groupRate}/person`);
    }
    return lines.join('\n');
  } catch (error) {
    console.error('[DateHelper:Calendar] Error:', error.message);
    return '';
  }
};

const normalizeDate = (d) => {
  if (typeof d === 'string') return new Date(d);
  return d;
};

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
