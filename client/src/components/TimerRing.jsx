import { useCountdown } from '../hooks/useCountdown.js';

/**
 * Countdown bar. Reads the server's absolute deadline and renders it; it never
 * tells the server anything.
 *
 * The digits sit in a fixed-width tabular-figure slot so the bar does not
 * twitch as the number changes width, and the whole strip keeps its height in
 * every state.
 */
export default function TimerRing({ endsAt, status, durationMs = 10_000 }) {
  const { seconds, fraction } = useCountdown(endsAt, durationMs);

  const running = status === 'RUNNING' && endsAt;
  const urgent = running && seconds <= 3;

  let label = '—';
  if (running) label = `${seconds}s`;
  else if (status === 'PAUSED') label = 'PAUSED';
  else if (status === 'SETTLED') label = 'DONE';

  return (
    <div className={`timerbar${urgent ? ' is-urgent' : ''}${status === 'PAUSED' ? ' is-paused' : ''}`}>
      <span className="timerbar-value">{label}</span>
      <div className="timerbar-track">
        <div
          className="timerbar-fill"
          style={{ width: running ? `${fraction * 100}%` : '0%' }}
        />
      </div>
    </div>
  );
}
