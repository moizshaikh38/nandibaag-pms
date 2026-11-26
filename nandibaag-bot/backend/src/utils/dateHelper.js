const { format, parseISO, isValid, addDays } = require('date-fns');

const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Extracts YYYY-MM-DD in Resort-local IST (Asia/Kolkata) without double-shifting
 * or UTC off-by-one drift.
 */
function toISTDateString(date) {
  if (!date) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: IST_TIMEZONE }).format(new Date());
  }
  if (typeof date === 'object' && date.dateStr && /^\d{4}-\d{2}-\d{2}$/.test(date.dateStr)) {
    return date.dateStr;
  }
  if (typeof date === 'object' && date.date instanceof Date) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: IST_TIMEZONE }).format(date.date);
  }
  if (typeof date === 'string') {
    const trimmed = date.trim();
    // Pure calendar date 'YYYY-MM-DD' -> keep exact calendar date
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    // ISO timestamp with time/timezone (e.g. '...T18:30:00.000Z') -> convert to IST calendar date
    if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
      const parsed = new Date(trimmed);
      if (isValid(parsed)) {
        return new Intl.DateTimeFormat('en-CA', { timeZone: IST_TIMEZONE }).format(parsed);
      }
    }
    const parsed = new Date(trimmed);
    if (isValid(parsed)) {
      return new Intl.DateTimeFormat('en-CA', { timeZone: IST_TIMEZONE }).format(parsed);
    }
  }
  if (date instanceof Date && isValid(date)) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: IST_TIMEZONE }).format(date);
  }
  return null;
}

function toValidDate(date) {
  if (!date) return new Date();
  if (date && typeof date === 'object' && date.date instanceof Date) {
    return date.date;
  }
  if (typeof date === 'string') {
    const istStr = toISTDateString(date);
    if (istStr) {
      return parseISO(istStr);
    }
    return new Date(date);
  }
  if (date instanceof Date) {
    return date;
  }
  return new Date(date);
}

const WEEKDAY_NAMES_UTC = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const getDayName = (date) => {
  try {
    const istStr = toISTDateString(date);
    if (!istStr) {
      console.error('[DateHelper] Invalid date:', date);
      return 'INVALID';
    }
    const [y, m, d] = istStr.split('-').map(Number);
    // Compute weekday purely from calendar date in UTC (immune to server TZ & DST)
    const dayName = WEEKDAY_NAMES_UTC[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    console.log('[DateHelper] Date:', istStr, '→', dayName);
    return dayName;
  } catch (error) {
    console.error('[DateHelper] Error:', error.message);
    return 'UNKNOWN';
  }
};

const formatDateDDMMYYYY = (date) => {
  try {
    const parsedDate = toValidDate(date);
    if (!isValid(parsedDate)) {
      console.error('[DateHelper] Invalid date:', date);
      return 'INVALID';
    }

    return format(parsedDate, 'dd/MM/yyyy');
  } catch (error) {
    console.error('[DateHelper] Error:', error.message);
    return 'INVALID';
  }
};

const isWeekday = (date) => {
  try {
    const dayName = getDayName(date);
    // Weekend = Friday, Saturday, Sunday (Resort business rule)
    const isWeekend = dayName === 'Friday' || dayName === 'Saturday' || dayName === 'Sunday';

    return !isWeekend;
  } catch (error) {
    console.error('[DateHelper] Error:', error.message);
    return true;
  }
};

const isWeekend = (date) => !isWeekday(date);

const buildDateRangeTable = (startDate, endDate) => {
  try {
    const start = toValidDate(startDate);
    const end = toValidDate(endDate);

    const nights = [];
    let table = '📅 DATE REFERENCE TABLE:\n';
    table += '(Read this table - DO NOT calculate day yourself)\n\n';

    let currentDate = new Date(start);
    let dayCount = 0;

    const isRange = end.getTime() > start.getTime();
    const condition = (cur) => isRange ? cur < end : cur <= end;

    while (condition(currentDate) && dayCount < 365) {
      const dateStr = formatDateDDMMYYYY(currentDate);
      const isoStr = format(currentDate, 'yyyy-MM-dd');
      const dayName = getDayName(currentDate);
      const isWkend = isWeekend(currentDate);
      const typeLabel = isWkend ? 'WEEKEND' : 'WEEKDAY';

      nights.push({
        date: new Date(currentDate),
        dateStr,
        isoStr,
        dayName,
        isWeekend: isWkend,
        isWeekday: !isWkend,
        type: typeLabel
      });

      table += `• ${dateStr} = ${dayName} (${typeLabel})\n`;

      currentDate = addDays(currentDate, 1);
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
    const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: IST_TIMEZONE }).format(new Date());
    const [y, m, d] = dateStr.split('-').map(Number);
    const istDate = parseISO(dateStr);
    istDate.date = istDate;
    istDate.dateStr = dateStr;
    istDate.dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    istDate.dayName = WEEKDAY_NAMES_UTC[istDate.dayOfWeek];

    return istDate;
  } catch (error) {
    console.error('[DateHelper:Today] Error:', error.message);
    return null;
  }
};

const buildCalendarReference = (startDateInput = null) => {
  try {
    const start = startDateInput ? toValidDate(startDateInput) : toValidDate(getTodayIST());
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let lines = [];
    lines.push('CALENDAR REFERENCE (Next 30 Days):');

    for (let i = 0; i < 30; i++) {
      const cur = addDays(start, i);
      const d = format(cur, 'd');
      const m = monthNames[cur.getMonth()];
      const dayName = getDayName(cur);
      const isWkend = isWeekend(cur);
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
  return toValidDate(d);
};

module.exports = {
  getDayName,
  formatDateDDMMYYYY,
  isWeekday,
  isWeekend,
  buildDateRangeTable,
  formatDateTableForPrompt,
  buildCalendarReference,
  normalizeDate,
  toISTDateString,
  getTodayIST
};
