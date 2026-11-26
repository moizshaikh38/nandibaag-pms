/**
 * Authoritative Pricing Service for Nandibaag Resort
 * Single source of truth for all package pricing, weekday/weekend rules,
 * date-wise breakdowns, warnings, and pricing snapshots.
 *
 * PRICING RULES (2026-11-v1):
 * - WEEKDAY = Mon, Tue, Wed, Thu
 * - WEEKEND = Fri, Sat, Sun (Friday IS a weekend)
 *
 * COUPLE STAY:
 * - Standard Couple rate (2 adults): Weekday ₹5,500 | Weekend ₹6,500
 * - 3 adults: 1 Couple + 1 Extra Adult (₹2,500 wkday / ₹3,000 wkend) + warning
 * - 4 adults: 2 Couples
 * - 5 adults: 2 Couples + 1 Extra Adult (₹2,500 wkday / ₹3,000 wkend) + warning
 * - Children: 0–5 Free | 6–15 ₹1,500/child/night
 *
 * GROUP / FAMILY STAY:
 * - Adults: Weekday ₹2,000/adult/night | Weekend ₹3,000/adult/night
 * - Children: 0–5 Free | 6–10 ₹1,000/child/night | 11+ counted as adults
 *
 * ONE DAY STAY:
 * - Age-independent per-person rate:
 *   - Breakfast to Tea (B->T): Weekday ₹1,000 | Weekend ₹1,250
 *   - Breakfast to Dinner (B->D): Weekday ₹1,250 | Weekend ₹1,500
 * - Optional small-room add-on: ₹2,000 (pricing only, no availability mutation)
 */

const dateHelper = require('../utils/dateHelper');

const PRICING_RULE_VERSION = '2026-11-v1';

const DEFAULT_RATE_CONFIG = Object.freeze({
  couple: Object.freeze({
    weekdayBase: 5500,
    weekendBase: 6500,
    weekdayExtraAdult: 2500,
    weekendExtraAdult: 3000,
    childFreeMaxAge: 5,
    childMaxAge: 15,
    childRate6To15: 1500
  }),
  group: Object.freeze({
    weekdayAdult: 2000,
    weekendAdult: 3000,
    childFreeMaxAge: 5,
    childRate6To10: 1000,
    adultMinAge: 11
  }),
  oneDay: Object.freeze({
    breakfast_tea: Object.freeze({ weekday: 1000, weekend: 1250 }),
    breakfast_dinner: Object.freeze({ weekday: 1250, weekend: 1500 }),
    roomAddon: 2000
  })
});

class PricingValidationError extends Error {
  constructor(message, code = 'PRICING_VALIDATION_ERROR') {
    super(message);
    this.name = 'PricingValidationError';
    this.code = code;
    this.statusCode = 400;
  }
}

function getRateConfig(customConfig = null) {
  if (!customConfig) return DEFAULT_RATE_CONFIG;
  const merged = {
    couple: { ...DEFAULT_RATE_CONFIG.couple, ...(customConfig.couple || {}) },
    group: { ...DEFAULT_RATE_CONFIG.group, ...(customConfig.group || {}) },
    oneDay: {
      breakfast_tea: { ...DEFAULT_RATE_CONFIG.oneDay.breakfast_tea, ...(customConfig.oneDay?.breakfast_tea || {}) },
      breakfast_dinner: { ...DEFAULT_RATE_CONFIG.oneDay.breakfast_dinner, ...(customConfig.oneDay?.breakfast_dinner || {}) },
      roomAddon: customConfig.oneDay?.roomAddon ?? DEFAULT_RATE_CONFIG.oneDay.roomAddon
    }
  };

  const requiredNums = [
    merged.couple.weekdayBase,
    merged.couple.weekendBase,
    merged.couple.weekdayExtraAdult,
    merged.couple.weekendExtraAdult,
    merged.couple.childRate6To15,
    merged.group.weekdayAdult,
    merged.group.weekendAdult,
    merged.group.childRate6To10,
    merged.oneDay.breakfast_tea.weekday,
    merged.oneDay.breakfast_tea.weekend,
    merged.oneDay.breakfast_dinner.weekday,
    merged.oneDay.breakfast_dinner.weekend,
    merged.oneDay.roomAddon
  ];

  for (const val of requiredNums) {
    if (typeof val !== 'number' || !Number.isFinite(val) || val < 0) {
      throw new PricingValidationError('Invalid or missing rate configuration', 'MISSING_RATE_CONFIG');
    }
  }
  return merged;
}

function parseLocalDate(dateInput) {
  return dateHelper.normalizeDate(dateInput);
}

function getDayName(dateInput) {
  return dateHelper.getDayName(dateInput);
}

function isWeekend(dateInput) {
  const result = dateHelper.isWeekend(dateInput);
  const dayName = getDayName(dateInput);
  console.log(`[WeekendCheck] ${dateInput} (${dayName}) = ${result}`);
  return result;
}

function isWeekday(dateInput) {
  const result = dateHelper.isWeekday(dateInput);
  const dayName = getDayName(dateInput);
  console.log(`[WeekdayCheck] ${dateInput} (${dayName}) = ${result}`);
  return result;
}

function formatDateShort(dateInput) {
  const istStr = dateHelper.toISTDateString(dateInput);
  if (!istStr) return '';
  const [, m, d] = istStr.split('-').map(Number);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const suffix = (d >= 11 && d <= 13) ? 'th'
    : d % 10 === 1 ? 'st'
    : d % 10 === 2 ? 'nd'
    : d % 10 === 3 ? 'rd'
    : 'th';
  return `${d}${suffix} ${monthNames[m - 1]}`;
}

function addDaysToISTString(istStr, days) {
  const [y, m, d] = istStr.split('-').map(Number);
  const utcMs = Date.UTC(y, m - 1, d) + days * 86400000;
  const next = new Date(utcMs);
  const ny = next.getUTCFullYear();
  const nm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const nd = String(next.getUTCDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

function normalizePackageType(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new PricingValidationError('packageType is required');
  }
  const key = raw.trim().toLowerCase();
  if (key === 'couple') return 'couple';
  if (key === 'group' || key === 'family' || key === 'overnight') return 'group';
  if (['oneday', 'one-day', 'one_day', 'one-day-picnic', 'picnic', 'dayuse'].includes(key)) {
    return 'oneDay';
  }
  throw new PricingValidationError(`Unsupported packageType: ${raw}`);
}

function normalizeMealOption(raw) {
  if (!raw) return 'breakfast_dinner';
  const key = String(raw).trim().toLowerCase();
  if (['b->t', 'b-t', 'bt', 'breakfast_tea', 'breakfast-to-tea', '1000'].includes(key)) {
    return 'breakfast_tea';
  }
  if (['b->d', 'b-d', 'bd', 'breakfast_dinner', 'breakfast-to-dinner', '1250'].includes(key)) {
    return 'breakfast_dinner';
  }
  throw new PricingValidationError(`Unsupported mealOption for One Day package: ${raw}`);
}

function normalizeChildAges(kidsInput) {
  if (kidsInput === undefined || kidsInput === null) return [];
  if (!Array.isArray(kidsInput)) {
    throw new PricingValidationError('childrenAges / kids must be an array of ages');
  }
  return kidsInput.map((item, idx) => {
    const rawAge = (typeof item === 'object' && item !== null) ? item.age : item;
    if (rawAge === undefined || rawAge === null || rawAge === '') {
      throw new PricingValidationError(`Child #${idx + 1} age is required`);
    }
    const age = Number(rawAge);
    if (!Number.isFinite(age) || !Number.isInteger(age) || age < 0 || age > 120) {
      throw new PricingValidationError(`Invalid child age at index ${idx}: ${rawAge}`);
    }
    return age;
  });
}

function validateAndApplyOverrides(rateOverridesInput, actor = null) {
  if (!rateOverridesInput || typeof rateOverridesInput !== 'object') {
    return { hasOverrides: false, overridesMap: {}, entries: [] };
  }

  const OVERRIDE_FIELDS = [
    'coupleBaseRate',
    'coupleBaseRateWeekday',
    'coupleBaseRateWeekend',
    'extraAdultRate',
    'extraAdultRateWeekday',
    'extraAdultRateWeekend',
    'groupAdultRate',
    'groupAdultRateWeekday',
    'groupAdultRateWeekend',
    'childRate',
    'childRateWeekday',
    'childRateWeekend',
    'oneDayPerPersonRate',
    'roomAddonRate'
  ];

  const overridesMap = {};
  for (const field of OVERRIDE_FIELDS) {
    const val = rateOverridesInput[field];
    if (val !== undefined && val !== null && val !== '') {
      const num = Number(val);
      if (!Number.isFinite(num) || num < 0) {
        throw new PricingValidationError(`Invalid rate override for ${field}: must be a non-negative number`, 'INVALID_RATE_OVERRIDE');
      }
      overridesMap[field] = num;
    }
  }

  const hasOverrides = Object.keys(overridesMap).length > 0;
  if (!hasOverrides) {
    return { hasOverrides: false, overridesMap: {}, entries: [] };
  }

  const reason = String(rateOverridesInput.reason || '').trim();

  return {
    hasOverrides: true,
    overridesMap,
    reason,
    overriddenBy: actor || rateOverridesInput.actor || null,
    overriddenAt: new Date().toISOString()
  };
}

function validateAndApplyDiscount(discountInput, subtotalAfterOverrides, actor = null) {
  if (!discountInput || typeof discountInput !== 'object' || !discountInput.type || discountInput.type === 'none') {
    return {
      discountObj: { type: 'none', value: 0, amount: 0, reason: '', appliedBy: null, appliedAt: null },
      discountAmount: 0,
      finalTotal: subtotalAfterOverrides
    };
  }

  const type = String(discountInput.type).trim().toLowerCase();
  if (!['fixed', 'percentage'].includes(type)) {
    throw new PricingValidationError(`Invalid discount type: ${discountInput.type}`, 'INVALID_DISCOUNT');
  }

  const value = Number(discountInput.value);
  if (!Number.isFinite(value) || value < 0) {
    throw new PricingValidationError('Discount value must be a non-negative number', 'INVALID_DISCOUNT');
  }
  if (type === 'percentage' && value > 100) {
    throw new PricingValidationError('Percentage discount cannot exceed 100%', 'INVALID_DISCOUNT');
  }

  const discountAmount = type === 'percentage'
    ? Math.round((subtotalAfterOverrides * value) / 100)
    : Math.round(value);

  if (discountAmount > subtotalAfterOverrides) {
    throw new PricingValidationError('Discount cannot exceed booking subtotal', 'EXCESSIVE_DISCOUNT');
  }

  const finalTotal = Math.max(0, subtotalAfterOverrides - discountAmount);
  return {
    discountObj: {
      type,
      value,
      amount: discountAmount,
      reason: String(discountInput.reason || '').trim(),
      appliedBy: actor || discountInput.actor || null,
      appliedAt: new Date().toISOString()
    },
    discountAmount,
    finalTotal
  };
}

/**
 * Authoritative deterministic pricing engine.
 * Never trusts any client-supplied totalAmount.
 */
function calculateBookingQuote(input = {}) {
  const rates = getRateConfig(input.rateConfig || null);
  const packageType = normalizePackageType(input.packageType);
  const actor = input.actor || null;
  const overrideState = validateAndApplyOverrides(input.rateOverrides, actor);

  const checkInStr = input.checkInDate ? dateHelper.toISTDateString(input.checkInDate) : null;
  if (!checkInStr) {
    throw new PricingValidationError('Valid checkInDate is required');
  }

  let checkOutStr = input.checkOutDate ? dateHelper.toISTDateString(input.checkOutDate) : null;
  if (input.checkOutDate && !checkOutStr) {
    throw new PricingValidationError('Invalid checkOutDate');
  }

  const rawAdults = Number(input.adults);
  if (!Number.isInteger(rawAdults) || rawAdults < 1) {
    throw new PricingValidationError('adults must be an integer >= 1');
  }

  const childAges = normalizeChildAges(input.childrenAges !== undefined ? input.childrenAges : input.kids);
  const warnings = [];
  const warningAcknowledged = Boolean(input.acknowledgeCoupleWarning);

  // ── ONE DAY STAY ────────────────────────────────────────────────────────
  if (packageType === 'oneDay') {
    const mealOption = normalizeMealOption(input.mealOption);
    const roomAddonEnabled = Boolean(
      input.roomAddon === true ||
      input.roomAddon?.enabled === true
    );
    const defaultRoomAddonAmount = roomAddonEnabled ? rates.oneDay.roomAddon : 0;
    const appliedRoomAddonRate = roomAddonEnabled
      ? (overrideState.overridesMap.roomAddonRate ?? rates.oneDay.roomAddon)
      : 0;

    if (checkOutStr && checkOutStr < checkInStr) {
      throw new PricingValidationError('checkOutDate cannot be before checkInDate');
    }
    if (!checkOutStr) checkOutStr = checkInStr;

    const weekend = isWeekend(checkInStr);
    const dayName = getDayName(checkInStr);
    const rateCategory = weekend ? 'WEEKEND' : 'WEEKDAY';
    const defaultPerPersonRate = weekend
      ? rates.oneDay[mealOption].weekend
      : rates.oneDay[mealOption].weekday;
    const appliedPerPersonRate = overrideState.overridesMap.oneDayPerPersonRate ?? defaultPerPersonRate;

    const totalGuests = rawAdults + childAges.length;
    const originalTotal = (totalGuests * defaultPerPersonRate) + defaultRoomAddonAmount;
    const guestSubtotal = totalGuests * appliedPerPersonRate;
    const subtotalAfterOverrides = guestSubtotal + appliedRoomAddonRate;
    const { discountObj, discountAmount, finalTotal: totalAmount } = validateAndApplyDiscount(
      input.discount,
      subtotalAfterOverrides,
      actor
    );

    const overrideRecords = [];
    if (overrideState.overridesMap.oneDayPerPersonRate !== undefined) {
      overrideRecords.push({
        field: 'oneDayPerPersonRate',
        category: `${packageType}:${mealOption}`,
        date: checkInStr,
        originalRate: defaultPerPersonRate,
        overriddenRate: appliedPerPersonRate,
        reason: overrideState.reason,
        overriddenBy: overrideState.overriddenBy,
        overriddenAt: overrideState.overriddenAt
      });
    }
    if (roomAddonEnabled && overrideState.overridesMap.roomAddonRate !== undefined) {
      overrideRecords.push({
        field: 'roomAddonRate',
        category: 'oneDay:roomAddon',
        date: checkInStr,
        originalRate: rates.oneDay.roomAddon,
        overriddenRate: appliedRoomAddonRate,
        reason: overrideState.reason,
        overriddenBy: overrideState.overriddenBy,
        overriddenAt: overrideState.overriddenAt
      });
    }

    const dailyBreakdown = [{
      date: checkInStr,
      dateShort: formatDateShort(checkInStr),
      dayName,
      rateCategory,
      packageType: 'oneDay',
      mealOption,
      guestCounts: {
        adults: rawAdults,
        children: childAges.length,
        totalGuests
      },
      perPersonRate: appliedPerPersonRate,
      defaultPerPersonRate,
      adultPricing: rawAdults * appliedPerPersonRate,
      childPricing: childAges.length * appliedPerPersonRate,
      extraAdultPricing: 0,
      addOns: appliedRoomAddonRate,
      dailySubtotal: subtotalAfterOverrides
    }];

    const calculatedAt = new Date().toISOString();
    const snapshot = {
      pricingRuleVersion: PRICING_RULE_VERSION,
      packageType: 'oneDay',
      mealOption,
      checkInDate: checkInStr,
      checkOutDate: checkOutStr,
      nights: 0,
      weekdayNights: 0,
      weekendNights: 0,
      guestCounts: {
        inputAdults: rawAdults,
        inputChildren: childAges.length,
        effectiveAdults: totalGuests,
        chargeableChildren: 0,
        freeChildren: 0,
        childAges
      },
      ratesApplied: {
        oneDayPerPersonRate: defaultPerPersonRate,
        roomAddonRate: roomAddonEnabled ? rates.oneDay.roomAddon : 0
      },
      rateOverrides: overrideRecords,
      discount: discountObj,
      originalTotal,
      subtotalAfterOverrides,
      discountAmount,
      breakdown: dailyBreakdown,
      addOns: {
        smallRoom: { enabled: roomAddonEnabled, amount: appliedRoomAddonRate, defaultAmount: defaultRoomAddonAmount }
      },
      warnings,
      warningAcknowledged,
      quotedTotal: totalAmount,
      calculatedAt
    };

    const mealLabel = mealOption === 'breakfast_tea' ? 'Breakfast to High Tea' : 'Breakfast to Dinner';
    const formatted = `✅ BOOKING QUOTE / SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 DATE:
${formatDateShort(checkInStr)} (${dayName}) — Day Picnic

👥 GUESTS:
${totalGuests} ${totalGuests === 1 ? 'Person' : 'People'}

🏨 PACKAGE:
DAY PICNIC (${mealLabel})

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 PRICING BREAKDOWN:
- Day Picnic (${mealLabel}): ${totalGuests} × ₹${appliedPerPersonRate.toLocaleString('en-IN')} = ₹${guestSubtotal.toLocaleString('en-IN')}${roomAddonEnabled ? `\n- Small Room Add-on: ₹${appliedRoomAddonRate.toLocaleString('en-IN')}` : ''}${discountAmount > 0 ? `\n- Discount: -₹${discountAmount.toLocaleString('en-IN')}` : ''}

────────────────────────────
TOTAL: ₹${totalAmount.toLocaleString('en-IN')}

✓ Includes: ${mealOption === 'breakfast_tea' ? 'Breakfast + Lunch + High Tea + Activities' : 'Breakfast + Lunch + High Tea + Dinner + Activities'}
✓ Vegetarian only

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📞 To confirm this booking, please call us:
9257657664

Our team will complete your booking! 🎉`;

    return {
      pricingRuleVersion: PRICING_RULE_VERSION,
      packageType: 'oneDay',
      mealOption,
      checkInDate: checkInStr,
      checkOutDate: checkOutStr,
      nights: 0,
      guestSummary: snapshot.guestCounts,
      warnings,
      dailyBreakdown,
      addOns: snapshot.addOns,
      originalTotal,
      subtotalAfterOverrides,
      discountAmount,
      discount: discountObj,
      rateOverrides: overrideRecords,
      totalAmount,
      snapshot,
      formatted
    };
  }

  // ── OVERNIGHT STAYS (COUPLE / GROUP) ────────────────────────────────────
  if (!checkOutStr) {
    checkOutStr = addDaysToISTString(checkInStr, 1);
  }
  if (checkOutStr <= checkInStr) {
    throw new PricingValidationError('checkOutDate must be after checkInDate for overnight stays');
  }

  let coupleCount = 0;
  let extraAdults = 0;
  let effectiveAdults = rawAdults;
  let chargeableChildren = 0;
  let freeChildren = 0;

  if (packageType === 'couple') {
    if (rawAdults > 5) {
      throw new PricingValidationError('Couple Stay supports up to 5 adults; use Group Stay for 6+ adults');
    }
    for (const age of childAges) {
      if (age > rates.couple.childMaxAge) {
        throw new PricingValidationError(`Child aged ${age} exceeds Couple Stay child limit (0–15); count guests aged 16+ as adults`);
      }
      if (age <= rates.couple.childFreeMaxAge) freeChildren++;
      else chargeableChildren++;
    }

    if (rawAdults <= 2) {
      coupleCount = 1;
      extraAdults = 0;
    } else if (rawAdults === 3) {
      coupleCount = 1;
      extraAdults = 1;
      warnings.push({
        code: 'COUPLE_3_ADULTS',
        message: 'Couple Stay with 3 adults includes 1 extra adult charge (₹2,500 weekday / ₹3,000 weekend). Please acknowledge before proceeding.',
        requiresAcknowledgment: true
      });
    } else if (rawAdults === 4) {
      coupleCount = 2;
      extraAdults = 0;
    } else if (rawAdults === 5) {
      coupleCount = 2;
      extraAdults = 1;
      warnings.push({
        code: 'COUPLE_5_ADULTS',
        message: 'Couple Stay with 5 adults includes 1 extra adult charge (₹2,500 weekday / ₹3,000 weekend). Please acknowledge before proceeding.',
        requiresAcknowledgment: true
      });
    }
  } else {
    // Group / Family Stay: 0-5 free, 6-10 child rate, 11+ counted as adults
    let promotedAdults = 0;
    for (const age of childAges) {
      if (age <= rates.group.childFreeMaxAge) freeChildren++;
      else if (age < rates.group.adultMinAge) chargeableChildren++;
      else promotedAdults++;
    }
    effectiveAdults = rawAdults + promotedAdults;
  }

  const dailyBreakdown = [];
  let weekdayNights = 0;
  let weekendNights = 0;
  let weekdayTotal = 0;
  let weekendTotal = 0;
  let originalTotal = 0;
  let subtotalAfterOverrides = 0;
  const overrideRecords = [];
  const recordedOverrideKeys = new Set();

  let curStr = checkInStr;
  let guard = 0;
  while (curStr < checkOutStr && guard < 365) {
    const weekend = isWeekend(curStr);
    const dayName = getDayName(curStr);
    const rateCategory = weekend ? 'WEEKEND' : 'WEEKDAY';

    let baseOrAdultRate = 0;
    let defaultBaseOrAdultRate = 0;
    let adultPricing = 0;
    let extraAdultPricing = 0;
    let childPricing = 0;
    let defaultNightTotal = 0;

    if (packageType === 'couple') {
      defaultBaseOrAdultRate = weekend ? rates.couple.weekendBase : rates.couple.weekdayBase;
      const defaultExtraRate = weekend ? rates.couple.weekendExtraAdult : rates.couple.weekdayExtraAdult;
      const defaultChildRate = rates.couple.childRate6To15;

      const coupleOverride = weekend
        ? (overrideState.overridesMap.coupleBaseRateWeekend ?? overrideState.overridesMap.coupleBaseRate)
        : (overrideState.overridesMap.coupleBaseRateWeekday ?? overrideState.overridesMap.coupleBaseRate);
      const extraOverride = weekend
        ? (overrideState.overridesMap.extraAdultRateWeekend ?? overrideState.overridesMap.extraAdultRate)
        : (overrideState.overridesMap.extraAdultRateWeekday ?? overrideState.overridesMap.extraAdultRate);
      const childOverride = weekend
        ? (overrideState.overridesMap.childRateWeekend ?? overrideState.overridesMap.childRate)
        : (overrideState.overridesMap.childRateWeekday ?? overrideState.overridesMap.childRate);

      baseOrAdultRate = coupleOverride ?? defaultBaseOrAdultRate;
      const appliedExtraRate = extraOverride ?? defaultExtraRate;
      const appliedChildRate = childOverride ?? defaultChildRate;

      adultPricing = coupleCount * baseOrAdultRate;
      extraAdultPricing = extraAdults * appliedExtraRate;
      childPricing = chargeableChildren * appliedChildRate;

      defaultNightTotal = (coupleCount * defaultBaseOrAdultRate) +
        (extraAdults * defaultExtraRate) +
        (chargeableChildren * defaultChildRate);

      if (overrideState.overridesMap.coupleBaseRate !== undefined && !recordedOverrideKeys.has(`coupleBaseRate:${rateCategory}`)) {
        recordedOverrideKeys.add(`coupleBaseRate:${rateCategory}`);
        overrideRecords.push({
          field: 'coupleBaseRate',
          category: `couple:${rateCategory}`,
          date: curStr,
          originalRate: defaultBaseOrAdultRate,
          overriddenRate: baseOrAdultRate,
          reason: overrideState.reason,
          overriddenBy: overrideState.overriddenBy,
          overriddenAt: overrideState.overriddenAt
        });
      }
      if (extraAdults > 0 && overrideState.overridesMap.extraAdultRate !== undefined && !recordedOverrideKeys.has(`extraAdultRate:${rateCategory}`)) {
        recordedOverrideKeys.add(`extraAdultRate:${rateCategory}`);
        overrideRecords.push({
          field: 'extraAdultRate',
          category: `couple:extraAdult:${rateCategory}`,
          date: curStr,
          originalRate: defaultExtraRate,
          overriddenRate: appliedExtraRate,
          reason: overrideState.reason,
          overriddenBy: overrideState.overriddenBy,
          overriddenAt: overrideState.overriddenAt
        });
      }
      if (chargeableChildren > 0 && overrideState.overridesMap.childRate !== undefined && !recordedOverrideKeys.has('couple:childRate')) {
        recordedOverrideKeys.add('couple:childRate');
        overrideRecords.push({
          field: 'childRate',
          category: 'couple:child6To15',
          date: curStr,
          originalRate: defaultChildRate,
          overriddenRate: appliedChildRate,
          reason: overrideState.reason,
          overriddenBy: overrideState.overriddenBy,
          overriddenAt: overrideState.overriddenAt
        });
      }
    } else {
      defaultBaseOrAdultRate = weekend ? rates.group.weekendAdult : rates.group.weekdayAdult;
      const defaultChildRate = rates.group.childRate6To10;

      const groupAdultOverride = weekend
        ? (overrideState.overridesMap.groupAdultRateWeekend ?? overrideState.overridesMap.groupAdultRate)
        : (overrideState.overridesMap.groupAdultRateWeekday ?? overrideState.overridesMap.groupAdultRate);
      const groupChildOverride = weekend
        ? (overrideState.overridesMap.childRateWeekend ?? overrideState.overridesMap.childRate)
        : (overrideState.overridesMap.childRateWeekday ?? overrideState.overridesMap.childRate);

      baseOrAdultRate = groupAdultOverride ?? defaultBaseOrAdultRate;
      const appliedChildRate = groupChildOverride ?? defaultChildRate;

      adultPricing = effectiveAdults * baseOrAdultRate;
      childPricing = chargeableChildren * appliedChildRate;

      defaultNightTotal = (effectiveAdults * defaultBaseOrAdultRate) +
        (chargeableChildren * defaultChildRate);

      if (overrideState.overridesMap.groupAdultRate !== undefined && !recordedOverrideKeys.has(`groupAdultRate:${rateCategory}`)) {
        recordedOverrideKeys.add(`groupAdultRate:${rateCategory}`);
        overrideRecords.push({
          field: 'groupAdultRate',
          category: `group:${rateCategory}`,
          date: curStr,
          originalRate: defaultBaseOrAdultRate,
          overriddenRate: baseOrAdultRate,
          reason: overrideState.reason,
          overriddenBy: overrideState.overriddenBy,
          overriddenAt: overrideState.overriddenAt
        });
      }
      if (chargeableChildren > 0 && overrideState.overridesMap.childRate !== undefined && !recordedOverrideKeys.has('group:childRate')) {
        recordedOverrideKeys.add('group:childRate');
        overrideRecords.push({
          field: 'childRate',
          category: 'group:child6To10',
          date: curStr,
          originalRate: defaultChildRate,
          overriddenRate: appliedChildRate,
          reason: overrideState.reason,
          overriddenBy: overrideState.overriddenBy,
          overriddenAt: overrideState.overriddenAt
        });
      }
    }

    const dailySubtotal = adultPricing + extraAdultPricing + childPricing;
    originalTotal += defaultNightTotal;

    if (weekend) {
      weekendNights++;
      weekendTotal += dailySubtotal;
    } else {
      weekdayNights++;
      weekdayTotal += dailySubtotal;
    }
    subtotalAfterOverrides += dailySubtotal;

    dailyBreakdown.push({
      date: curStr,
      dateShort: formatDateShort(curStr),
      dayName,
      rateCategory,
      packageType,
      guestCounts: {
        inputAdults: rawAdults,
        effectiveAdults,
        coupleCount,
        extraAdults,
        chargeableChildren,
        freeChildren
      },
      roomRate: baseOrAdultRate,
      defaultRoomRate: defaultBaseOrAdultRate,
      adultPricing,
      extraAdultPricing,
      childPricing,
      addOns: 0,
      dailySubtotal
    });

    curStr = addDaysToISTString(curStr, 1);
    guard++;
  }

  const { discountObj, discountAmount, finalTotal: totalAmount } = validateAndApplyDiscount(
    input.discount,
    subtotalAfterOverrides,
    actor
  );

  const totalNights = weekdayNights + weekendNights;
  const calculatedAt = new Date().toISOString();
  const snapshot = {
    pricingRuleVersion: PRICING_RULE_VERSION,
    packageType,
    mealOption: null,
    checkInDate: checkInStr,
    checkOutDate: checkOutStr,
    nights: totalNights,
    weekdayNights,
    weekendNights,
    guestCounts: {
      inputAdults: rawAdults,
      inputChildren: childAges.length,
      effectiveAdults,
      coupleCount,
      extraAdults,
      chargeableChildren,
      freeChildren,
      childAges
    },
    ratesApplied: packageType === 'couple'
      ? {
          coupleBaseWeekday: rates.couple.weekdayBase,
          coupleBaseWeekend: rates.couple.weekendBase,
          extraAdultWeekday: rates.couple.weekdayExtraAdult,
          extraAdultWeekend: rates.couple.weekendExtraAdult,
          childRate: rates.couple.childRate6To15
        }
      : {
          groupAdultWeekday: rates.group.weekdayAdult,
          groupAdultWeekend: rates.group.weekendAdult,
          childRate: rates.group.childRate6To10
        },
    rateOverrides: overrideRecords,
    discount: discountObj,
    originalTotal,
    subtotalAfterOverrides,
    discountAmount,
    breakdown: dailyBreakdown,
    addOns: {
      smallRoom: { enabled: false, amount: 0 }
    },
    warnings,
    warningAcknowledged,
    quotedTotal: totalAmount,
    calculatedAt
  };

  const breakdownLines = dailyBreakdown.map((n) => {
    if (packageType === 'couple') {
      let line = `${n.dayName} (${n.dateShort}) - ${n.rateCategory}:\n${coupleCount} Couple${coupleCount > 1 ? 's' : ''} × ₹${n.roomRate.toLocaleString('en-IN')}`;
      if (extraAdults > 0) {
        line += ` + ${extraAdults} Extra Adult (₹${n.extraAdultPricing.toLocaleString('en-IN')})`;
      }
      if (childAges.length > 0) {
        line += n.childPricing > 0
          ? ` + ${childAges.length} Kid${childAges.length > 1 ? 's' : ''} (₹${n.childPricing.toLocaleString('en-IN')})`
          : ` + ${childAges.length} Kid${childAges.length > 1 ? 's' : ''} (FREE)`;
      }
      line += ` = ₹${n.dailySubtotal.toLocaleString('en-IN')}`;
      return line;
    }
    let line = `${n.dayName} (${n.dateShort}) - ${n.rateCategory}:\n${effectiveAdults} Adults × ₹${n.roomRate.toLocaleString('en-IN')}`;
    if (chargeableChildren > 0 || freeChildren > 0) {
      line += n.childPricing > 0
        ? ` + ${chargeableChildren + freeChildren} Kid${chargeableChildren + freeChildren > 1 ? 's' : ''} (₹${n.childPricing.toLocaleString('en-IN')})`
        : ` + ${freeChildren} Kid${freeChildren > 1 ? 's' : ''} (FREE)`;
    }
    line += ` = ₹${n.dailySubtotal.toLocaleString('en-IN')}`;
    return line;
  });

  const roomType = packageType === 'couple' ? 'COUPLE STAY' : 'GROUP STAY';
  const guestStr = `${rawAdults} Adults${coupleCount > 0 && packageType === 'couple' ? ` (${coupleCount} ${coupleCount === 1 ? 'Couple' : 'Couples'}${extraAdults > 0 ? ` + ${extraAdults} Extra Adult` : ''})` : ''}${childAges.length > 0 ? ` + ${childAges.length} ${childAges.length === 1 ? 'Kid' : 'Kids'}` : ''}`;

  const formatted = `✅ BOOKING QUOTE / SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 DATES:
${formatDateShort(checkInStr)} (${getDayName(checkInStr)}) → ${formatDateShort(checkOutStr)} (${getDayName(checkOutStr)})
${totalNights} Night${totalNights > 1 ? 's' : ''}

👥 GUESTS:
${guestStr}

🏨 PACKAGE:
${roomType}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 PRICING BREAKDOWN:

${breakdownLines.join('\n\n')}

────────────────────────────
TOTAL: ₹${totalAmount.toLocaleString('en-IN')}

✓ Includes: All Meals + Activities
✓ Vegetarian only

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📞 To confirm this booking, please call us:
9257657664

Our team will complete your booking! 🎉`;

  return {
    pricingRuleVersion: PRICING_RULE_VERSION,
    packageType,
    mealOption: null,
    checkInDate: checkInStr,
    checkOutDate: checkOutStr,
    nights: totalNights,
    weekdayNights,
    weekendNights,
    weekdayTotal,
    weekendTotal,
    guestSummary: snapshot.guestCounts,
    warnings,
    dailyBreakdown,
    addOns: snapshot.addOns,
    originalTotal,
    subtotalAfterOverrides,
    discountAmount,
    discount: discountObj,
    rateOverrides: overrideRecords,
    totalAmount,
    snapshot,
    formatted
  };
}

/**
 * Legacy wrapper for WhatsApp bot & existing test scripts.
 * Delegates to calculateBookingQuote().
 */
function calculatePricing(checkInInput, checkOutInput, adultCountOrGuestCount = 2, kidsOrStayType = [], stayTypeHint = 'auto', options = {}) {
  let adultCount = 2;
  let kids = [];
  let stayType = stayTypeHint;
  let mealOption = options?.mealOption || 'breakfast_dinner';

  if (typeof adultCountOrGuestCount === 'object' && adultCountOrGuestCount !== null) {
    adultCount = adultCountOrGuestCount.adults || adultCountOrGuestCount.guestCount || 2;
    kids = Array.isArray(adultCountOrGuestCount.kids) ? adultCountOrGuestCount.kids : [];
    if (adultCountOrGuestCount.stayType) stayType = adultCountOrGuestCount.stayType;
    if (adultCountOrGuestCount.mealOption) mealOption = adultCountOrGuestCount.mealOption;
  } else {
    adultCount = Math.max(1, parseInt(adultCountOrGuestCount, 10) || 2);
    if (Array.isArray(kidsOrStayType)) {
      kids = kidsOrStayType;
    } else if (typeof kidsOrStayType === 'string' && kidsOrStayType !== 'auto') {
      stayType = kidsOrStayType;
    }
  }

  const numGuests = adultCount + kids.length;
  if (stayType === 'auto' || !stayType) {
    stayType = (adultCount <= 2 && numGuests <= 4) ? 'couple' : 'group';
  }

  const quote = calculateBookingQuote({
    packageType: stayType,
    checkInDate: checkInInput,
    checkOutDate: checkOutInput,
    adults: adultCount,
    kids,
    mealOption,
    roomAddon: options?.roomAddon
  });

  if (quote.packageType === 'oneDay') {
    return {
      raw: {
        stayType: 'picnic',
        mealOption: quote.mealOption,
        mealRate: quote.snapshot.ratesApplied.oneDayPerPersonRate,
        guestCount: numGuests,
        adultCount,
        coupleCount: Math.ceil(adultCount / 2),
        kids,
        totalNights: 0,
        weekdayNights: 0,
        weekdayRate: 0,
        weekdayTotal: 0,
        weekendNights: 0,
        weekendRate: 0,
        weekendTotal: 0,
        grandTotal: quote.totalAmount,
        warnings: quote.warnings,
        snapshot: quote.snapshot
      },
      formatted: quote.formatted
    };
  }

  return {
    raw: {
      stayType: quote.packageType,
      guestCount: numGuests,
      adultCount,
      coupleCount: quote.guestSummary.coupleCount || 0,
      kids,
      totalNights: quote.nights,
      weekdayNights: quote.weekdayNights,
      weekendNights: quote.weekendNights,
      weekdayTotal: quote.weekdayTotal,
      weekendTotal: quote.weekendTotal,
      grandTotal: quote.totalAmount,
      warnings: quote.warnings,
      snapshot: quote.snapshot
    },
    formatted: quote.formatted
  };
}

/**
 * Legacy wrapper for calculateBookingPrice — delegates to calculateBookingQuote().
 */
const calculateBookingPrice = (checkInDate, checkOutDate, packageType, adults = 2, kids = 0) => {
  const kidsArr = Array.isArray(kids)
    ? kids
    : Array.from({ length: Number(kids || 0) }, () => 8);

  const quote = calculateBookingQuote({
    packageType: packageType || 'group',
    checkInDate,
    checkOutDate,
    adults: Number(adults),
    kids: kidsArr
  });

  return {
    totalPrice: quote.totalAmount,
    breakdown: quote.dailyBreakdown,
    nights: quote.nights,
    quote
  };
};

module.exports = {
  PRICING_RULE_VERSION,
  DEFAULT_RATE_CONFIG,
  PricingValidationError,
  getRateConfig,
  isWeekend,
  isWeekday,
  getDayName,
  parseLocalDate,
  calculateBookingQuote,
  calculatePricing,
  calculateBookingPrice,
  formatDateShort
};
