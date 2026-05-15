/**
 * Mirror of the web's `frontend/src/utils/formatCredits.js`. Renders
 * credit values with the platform's house style: two decimals only
 * when they're actually meaningful, en-IN grouping for big numbers
 * so 1234567 reads as 12,34,567 rather than 1,234,567.
 */
export function fmtCredits(n) {
  const v = Number(n) || 0;
  // Drop the .00 when the number happens to be a whole credit.
  const hasDecimals = Math.round(v * 100) !== v * 100 ? true : v !== Math.round(v);
  const fmt = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return fmt.format(v);
}
