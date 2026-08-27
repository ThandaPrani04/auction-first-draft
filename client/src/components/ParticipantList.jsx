import { formatCr } from '../lib/bidRules.js';

/**
 * Room participants with live purse and connection state.
 *
 * Always rendered — the old version unmounted this panel whenever the timer
 * stopped, which shifted the whole page at every round boundary.
 */
export default function ParticipantList({ participants, me, isAdmin, maxParticipants = 10, onKick }) {
  return (
    <div className="room-status">
      <h2>
        Participants ({participants.length}/{maxParticipants})
      </h2>
      <div className="users-list">
        {participants.map((p) => (
          <div
            key={p.userId}
            className={`user-item${p.connected ? '' : ' user-item--offline'}`}
          >
            <span className="user-name">
              {p.name}
              {p.isAdmin && <span className="badge badge--admin">HOST</span>}
              {p.userId === me?.userId && <span className="badge">YOU</span>}
              {!p.connected && p.status === 'ACTIVE' && (
                <span className="badge badge--offline">OFFLINE</span>
              )}
            </span>
            <span className="user-purse">
              {formatCr(p.purse)} · {p.teamSize} {p.teamSize === 1 ? 'player' : 'players'}
            </span>
            {isAdmin && p.userId !== me?.userId && (
              <button className="kick-btn" onClick={() => onKick(p.userId)}>
                Kick
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
