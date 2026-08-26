/**
 * Mirror of server/shared/bidRules.js.
 *
 * DISPLAY ONLY. The server computes the real bid from its own state and never
 * trusts a number from here — this exists so the "next bid" preview matches
 * what will actually happen. Keeping the arithmetic identical is what stops
 * the preview from lying; keeping the server authoritative is what stops a
 * tampered client from mattering.
 *
 * All amounts are INTEGER LAKHS. 1 Crore = 100 Lakh.
 */
export const CRORE = 100;

const BANDS = [
  { below: 1 * CRORE, step: 5 },
  { below: 2 * CRORE, step: 10 },
  { below: 995, step: 20 },
  { below: Infinity, step: 50 },
];

export function increment(currentLakhs) {
  return BANDS.find((b) => currentLakhs < b.below).step;
}

export function nextBid(basePriceLakhs, currentBidLakhs) {
  if (currentBidLakhs == null) return basePriceLakhs;
  return currentBidLakhs + increment(currentBidLakhs);
}

/** 12000 -> "₹120.00 Cr" */
export function formatCr(lakhs) {
  if (lakhs == null) return '—';
  return `₹${(lakhs / CRORE).toFixed(2)} Cr`;
}
