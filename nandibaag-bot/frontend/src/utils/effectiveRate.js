/**
 * Derive effective rate dynamically from finalTotal and applicable guest/night denominator.
 * Never mutates stored totals or creates redundant financial fields.
 */
export function computeEffectiveRate({ quote, packageType, adults, childrenAges = [], finalTotal }) {
  if (!quote) return null;

  const pkg = quote.packageType || packageType || 'couple';
  const calculatedTotal = Number(quote.calculatedTotal ?? quote.totalAmount ?? 0);
  const parsedFinal = Number(finalTotal);
  const activeTotal = Number.isFinite(parsedFinal) && parsedFinal >= 0 ? parsedFinal : calculatedTotal;

  if (pkg === 'oneDay') {
    const rawAdults = Math.max(0, Number(adults) || 0);
    const childCount = Array.isArray(childrenAges) ? childrenAges.length : 0;
    const guestDenom = quote.guestSummary?.effectiveAdults ?? (rawAdults + childCount);
    const originalRate = Number(
      quote.dailyBreakdown?.[0]?.perPersonRate ??
      quote.snapshot?.ratesApplied?.oneDayPerPersonRate ??
      (guestDenom > 0 ? Math.round((calculatedTotal / guestDenom) * 100) / 100 : 0)
    );
    const effectiveRate = guestDenom > 0
      ? Math.round((activeTotal / guestDenom) * 100) / 100
      : null;

    return {
      pricingModel: 'per_person',
      applicableGuestCount: guestDenom,
      nights: 0,
      unitLabel: '/ person',
      originalRate,
      effectiveRate
    };
  }

  const nights = Math.max(1, Number(quote.nights || 1));
  if (pkg === 'group') {
    const rawAdults = Math.max(0, Number(adults) || 0);
    const ages = Array.isArray(childrenAges) ? childrenAges.map(Number) : [];
    const promotedAdults = ages.filter(a => Number.isFinite(a) && a >= 11).length;
    const chargeableChildren = ages.filter(a => Number.isFinite(a) && a >= 6 && a <= 10).length;
    const effectiveAdults = quote.guestSummary?.effectiveAdults ?? (rawAdults + promotedAdults);
    const usedChargeableChildren = quote.guestSummary?.chargeableChildren ?? chargeableChildren;

    // Free children (0-5) are excluded from the paying guest denominator
    const applicableGuestCount = usedChargeableChildren === 0
      ? effectiveAdults
      : (effectiveAdults + usedChargeableChildren);
    const denom = applicableGuestCount * nights;
    const originalRate = denom > 0 ? Math.round((calculatedTotal / denom) * 100) / 100 : null;
    const effectiveRate = denom > 0 ? Math.round((activeTotal / denom) * 100) / 100 : null;
    const unitLabel = usedChargeableChildren === 0
      ? (nights > 1 ? '/ adult / night' : '/ adult')
      : (nights > 1 ? '/ paying guest / night' : '/ paying guest');

    return {
      pricingModel: 'per_person',
      applicableGuestCount,
      nights,
      unitLabel,
      originalRate,
      effectiveRate
    };
  }

  // Couple Stay is package/room-based (not per-person)
  return {
    pricingModel: 'package_per_night',
    applicableGuestCount: null,
    nights,
    unitLabel: '/ night',
    originalRate: Math.round((calculatedTotal / nights) * 100) / 100,
    effectiveRate: Math.round((activeTotal / nights) * 100) / 100
  };
}
