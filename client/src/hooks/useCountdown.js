import { useEffect, useState } from 'react';

/**
 * Render a countdown from an absolute server deadline.
 *
 * This hook EMITS NOTHING. That is the whole point. The old client ran a
 * setInterval that decremented its own copy of the timer and pushed the value
 * to the server every second, which rebroadcast it to every peer, who applied
 * it blindly — N clients with clocks a few hundred ms apart overwriting each
 * other once a second. That was the flickering countdown.
 *
 * Because `endsAt` is an absolute timestamp, every client computes the same
 * remaining time independently, and a client that reconnects mid-lot gets it
 * right immediately with no negotiation.
 *
 * @param {number|null} endsAt - epoch ms, or null when the lot is not running
 * @returns {{seconds: number, ms: number, fraction: number}}
 */
export function useCountdown(endsAt, durationMs = 10_000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!endsAt) return undefined;
    // 100ms so the ring animates smoothly; the displayed integer only changes
    // once a second.
    const id = setInterval(() => setNow(Date.now()), 100);
    setNow(Date.now());
    return () => clearInterval(id);
  }, [endsAt]);

  if (!endsAt) return { seconds: 0, ms: 0, fraction: 0 };

  const ms = Math.max(0, endsAt - now);
  return {
    ms,
    seconds: Math.ceil(ms / 1000),
    fraction: Math.max(0, Math.min(1, ms / durationMs)),
  };
}
