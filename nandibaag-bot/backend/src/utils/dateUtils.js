/**
 * Date Utility Helpers
 * Standardizes date formatting across PMS backend and bot utilities.
 */

const formatDateToDDMMYYYY = (date) => {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

const formatDateToISO = (date) => {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0]; // yyyy-mm-dd
};

const parseInputDate = (dateString) => {
  if (!dateString) return null;
  const d = new Date(dateString.includes('T') ? dateString : dateString + 'T00:00:00Z');
  return isNaN(d.getTime()) ? null : d;
};

const getDayName = (date) => {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { 
    weekday: 'long'
  });
};

const isWeekday = (date) => {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  const day = d.toLocaleDateString('en-GB', { 
    weekday: 'short'
  });
  return ['Mon', 'Tue', 'Wed', 'Thu'].includes(day);
};

module.exports = {
  formatDateToDDMMYYYY,
  formatDateToISO,
  parseInputDate,
  getDayName,
  isWeekday
};
