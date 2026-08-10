// Convert ISO date or Date object to dd/mm/yyyy (e.g., 10/08/2026)
export const formatDateDDMMYYYY = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

// Parse input date (from date picker yyyy-mm-dd) to ISO format for backend
export const parseInputDateToISO = (dateString) => {
  if (!dateString) return null;
  return dateString;
};

// Get day name from date (e.g. Monday)
export const getDayName = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { weekday: 'long' });
};

// Format with day name: "10/08/2026 (Monday)"
export const formatDateWithDay = (date) => {
  if (!date) return '';
  const formatted = formatDateDDMMYYYY(date);
  const dayName = getDayName(date);
  return dayName ? `${formatted} (${dayName})` : formatted;
};

export default {
  formatDateDDMMYYYY,
  parseInputDateToISO,
  getDayName,
  formatDateWithDay
};
