/**
 * Defensive Sanitization Layer for BookingDraft objects before Mongoose DB persistence.
 * Prevents schema validation crashes from unexpected free-text parsing structures (e.g. raw numbers in kids array).
 */
function sanitizeBookingDraft(draft) {
  if (!draft || typeof draft !== 'object') {
    return {
      bookingType: null,
      date: null,
      nights: 1,
      adults: null,
      kids: [],
      availabilityChecked: false,
      availabilityConfirmed: false,
      roomPreference: 'not_applicable',
      suggestedCombination: null
    };
  }

  const safe = { ...draft };

  // 1. Kids: Ensure array of objects [{ age: Number }], never raw numbers or invalid shapes
  if (Array.isArray(safe.kids)) {
    safe.kids = safe.kids
      .map(k => {
        if (typeof k === 'number' && !isNaN(k)) return { age: k };
        if (k && typeof k === 'object' && 'age' in k && typeof k.age === 'number' && !isNaN(k.age)) return { age: k.age };
        return null;
      })
      .filter(Boolean);
  } else {
    safe.kids = [];
  }

  // 2. Date: Ensure valid YYYY-MM-DD date string or null
  if (safe.date) {
    const parsed = new Date(safe.date);
    if (isNaN(parsed.getTime())) {
      console.warn('[Sanitize] Invalid date detected, resetting to null:', safe.date);
      safe.date = null;
    } else {
      safe.date = parsed.toISOString().split('T')[0];
    }
  } else {
    safe.date = null;
  }

  // 3. Nights: Ensure positive integer
  if (safe.nights !== undefined && safe.nights !== null) {
    const n = parseInt(safe.nights, 10);
    safe.nights = (!isNaN(n) && n > 0) ? n : 1;
  } else {
    safe.nights = 1;
  }

  // 4. Adults: Ensure positive integer or null
  if (safe.adults !== undefined && safe.adults !== null) {
    const a = parseInt(safe.adults, 10);
    safe.adults = (!isNaN(a) && a > 0) ? a : null;
  } else {
    safe.adults = null;
  }

  // 5. BookingType: Ensure valid enum or null
  const validTypes = ['couple', 'group', 'picnic', null];
  if (!validTypes.includes(safe.bookingType)) {
    safe.bookingType = null;
  }

  // 6. State Machine & Name fields
  safe.kidsSpecified = Boolean(safe.kidsSpecified || (Array.isArray(safe.kids) && safe.kids.length > 0));
  safe.customerName = typeof safe.customerName === 'string' ? safe.customerName.trim() : null;
  safe.nameRequested = Boolean(safe.nameRequested);
  safe.bookingStep = typeof safe.bookingStep === 'number' ? safe.bookingStep : 1;

  return safe;
}

module.exports = { sanitizeBookingDraft };
