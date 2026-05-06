/**
 * Format a credit balance for display. Whole numbers render without
 * decimals; fractional numbers render to 2 decimals. Avoids JS
 * floating-point artifacts like "9943.600000000002".
 */
export function fmtCredits(n) {
  const v = Number(n) || 0;
  if (Number.isInteger(v)) return String(v);
  // Round to 2 decimals; the toFixed call also kills the FP drift.
  return v.toFixed(2);
}
