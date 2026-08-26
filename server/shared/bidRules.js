/**
 * Auction money rules.
 *
 * All amounts are INTEGER LAKHS. Never floats: the old code accumulated `+ 0.2`
 * and produced values like 2.4000000000000004, which .toFixed(2) only hid.
 * 1 Crore = 100 Lakh, so 120 Cr (the starting purse) is 12000 here.
 *
 * This file is mirrored at client/src/lib/bidRules.js. The client uses it only
 * to PREVIEW the next bid; the server is always the authority on the real one.
 * Keeping the arithmetic identical means the preview never lies.
 */

export const LAKH = 1;
export const CRORE = 100;

/** Bid increment bands, by current price. */
const BANDS = [
  { below: 1 * CRORE, step: 5 },      // under 1 Cr    -> +5 L
  { below: 2 * CRORE, step: 10 },     // under 2 Cr    -> +10 L
  { below: 995, step: 20 },           // under 9.95 Cr -> +20 L
  { below: Infinity, step: 50 },      // 9.95 Cr and up-> +50 L
];

/**
 * The increment that applies at `currentLakhs`.
 * @param {number} currentLakhs
 * @returns {number} step in lakhs
 */
export function increment(currentLakhs) {
  return BANDS.find((b) => currentLakhs < b.below).step;
}

/**
 * The next legal bid for a lot.
 *
 * The first bid is AT the base price (you are not required to beat an opening
 * ask that nobody has met yet); every later bid adds the band increment.
 *
 * @param {number} basePriceLakhs
 * @param {number|null} currentBidLakhs - null when no bid has been placed yet
 * @returns {number} next bid in lakhs
 */
export function nextBid(basePriceLakhs, currentBidLakhs) {
  if (currentBidLakhs == null) return basePriceLakhs;
  return currentBidLakhs + increment(currentBidLakhs);
}

/**
 * Format lakhs for display: 12000 -> "120.00 Cr", 55 -> "0.55 Cr".
 * @param {number} lakhs
 */
export function formatCr(lakhs) {
  if (lakhs == null) return '—';
  return `${(lakhs / CRORE).toFixed(2)} Cr`;
}

/** Parse a Crore float from the seed data into integer lakhs. 0.5 -> 50. */
export function crToLakhs(cr) {
  return Math.round(cr * CRORE);
}
