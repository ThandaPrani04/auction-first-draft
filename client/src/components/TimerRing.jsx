import { useCountdown } from '../hooks/useCountdown.js';

/**
 * Countdown display. Reads an absolute server deadline and renders the
 * remaining time; it never tells the server anything.
 */
export default function TimerRing({ endsAt, durationMs, status }) {
  const { seconds, fraction } = useCountdown(endsAt, durationMs);

  if (status === 'PAUSED') {
    return (
      <div className="timer timer--paused">
        <p>PAUSED</p>
      </div>
    );
  }
  if (status !== 'RUNNING' || !endsAt) {
    return (
      <div className="timer timer--idle">
        <p>—</p>
      </div>
    );
  }

  const urgent = seconds <= 3;
  return (
    <div className={`timer${urgent ? ' timer--urgent' : ''}`}>
      <p>{seconds}s</p>
      <div className="timer-bar">
        <div className="timer-bar-fill" style={{ width: `${fraction * 100}%` }} />
      </div>
    </div>
  );
}
