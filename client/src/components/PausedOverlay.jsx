/**
 * Shown while the auction is frozen because someone dropped.
 *
 * Policy: any participant disconnecting pauses the room, and it resumes only
 * when everyone is back — a refresh self-heals in about a second.
 *
 * The admin's "Drop & continue" is the escape hatch. Without it, one person
 * closing their laptop would deadlock the room forever, which is the first
 * question anyone asks about a strict wait-for-everyone rule.
 */
export default function PausedOverlay({ waitingFor, isAdmin, participants, onResume }) {
  if (!waitingFor?.length) return null;

  const missing = participants.filter((p) => !p.connected && p.status === 'ACTIVE');

  return (
    <div className="paused-overlay">
      <div className="paused-card">
        <h2>Auction paused</h2>
        <p>
          Waiting for <strong>{waitingFor.join(', ')}</strong> to reconnect.
        </p>
        {isAdmin ? (
          <button className="start-btn" onClick={() => onResume(missing.map((p) => p.userId))}>
            Drop {missing.length === 1 ? missing[0].name : `${missing.length} players`} &amp; continue
          </button>
        ) : (
          <p className="muted">The room creator can drop them to continue.</p>
        )}
      </div>
    </div>
  );
}
