import { formatCr } from '../lib/bidRules.js';

/**
 * Managers in the room, with live purse.
 *
 * Always rendered — the old version unmounted whenever the timer stopped,
 * which shifted the whole page at every round boundary. Rows are a fixed
 * height and the badge slot is always present.
 */
export default function ParticipantList({ participants, me, isAdmin, onKick, highestBidderId }) {
  return (
    <section className="panel roster">
      <header className="panel-head">
        <h2>Managers</h2>
        <span className="panel-count">{participants.length}</span>
      </header>

      <div className="panel-scroll">
        {participants.map((p) => {
          const isMe = p.userId === me?.userId;
          const leading = p.userId === highestBidderId;
          return (
            <div
              key={p.userId}
              className={[
                'roster-row',
                p.connected ? '' : 'is-offline',
                leading ? 'is-leading' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="roster-main">
                <span className="roster-name" title={p.name}>
                  {p.name}
                </span>
                <span className="roster-badges">
                  {p.isAdmin && <span className="badge badge--admin">HOST</span>}
                  {isMe && <span className="badge badge--you">YOU</span>}
                  {!p.connected && <span className="badge badge--off">OFF</span>}
                </span>
              </div>
              <div className="roster-sub">
                <span className="roster-purse">{formatCr(p.purse)}</span>
                <span className="roster-count">
                  {p.teamSize} {p.teamSize === 1 ? 'player' : 'players'}
                </span>
                {isAdmin && !isMe ? (
                  <button className="linkbtn" onClick={() => onKick(p.userId)}>
                    kick
                  </button>
                ) : (
                  <span className="linkbtn-spacer" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
