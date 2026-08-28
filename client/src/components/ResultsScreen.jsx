import { useState } from 'react';
import { formatCr } from '../lib/bidRules.js';

/** Post-auction summary: every squad, spend, and the unsold pool. */
export default function ResultsScreen({ results, roomCode, spectator = false, onExit }) {
  const [selected, setSelected] = useState(null);
  const [viewingUnsold, setViewingUnsold] = useState(false);

  // No results to show: either a spectator who was never in this room, or a
  // room whose results are no longer available. Never hang on "Loading…".
  if (!results) {
    return (
      <div className="results">
        <h1>Auction complete</h1>
        <p className="results-sub">
          {spectator
            ? `Room ${roomCode}'s auction has already finished — you weren't part of it.`
            : 'This auction has finished. Its results are no longer available.'}
        </p>
        {onExit && (
          <button className="btn btn--ghost results-back" onClick={onExit}>
            Back to home
          </button>
        )}
      </div>
    );
  }

  const { teams = [], unsold = [] } = results;

  if (selected || viewingUnsold) {
    const players = viewingUnsold ? unsold : selected.players;
    return (
      <div className="results">
        <button
          className="btn btn--ghost results-back"
          onClick={() => {
            setSelected(null);
            setViewingUnsold(false);
          }}
        >
          ← Back
        </button>
        <h1>{viewingUnsold ? 'Unsold Players' : `${selected.name}'s Squad`}</h1>
        <p className="results-sub">
          {viewingUnsold
            ? `${unsold.length} went unsold`
            : `Spent ${formatCr(selected.spent)} · ${formatCr(selected.purse)} remaining`}
        </p>
        <div className="results-grid">
          {players.length === 0 ? (
            <p className="muted">No players.</p>
          ) : (
            players.map((p) => (
              <div key={p._id} className="results-card">
                <h3>{p.name}</h3>
                <p>
                  {p.team} · {p.playerType}
                </p>
                <p>{p.point} pts</p>
                {p.price != null && <p className="price">{formatCr(p.price)}</p>}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  const totalSold = teams.reduce((n, t) => n + t.players.length, 0);
  const ranked = [...teams].sort((a, b) => b.spent - a.spent);

  return (
    <div className="results">
      <h1>Auction complete</h1>
      <p className="results-sub">
        Room {roomCode} · {totalSold} sold · {unsold.length} unsold ·{' '}
        {totalSold + unsold.length} total
      </p>

      <div className="results-grid">
        {ranked.map((t) => (
          <button key={t.userId} className="results-card" onClick={() => setSelected(t)}>
            <h3>
              {t.name}
              {t.removed && <span className="badge badge--off"> REMOVED</span>}
            </h3>
            <p>
              {t.players.length} {t.players.length === 1 ? 'player' : 'players'}
            </p>
            <p className="price">Spent {formatCr(t.spent)}</p>
            <p>{formatCr(t.purse)} left</p>
          </button>
        ))}
        <button className="results-card" onClick={() => setViewingUnsold(true)}>
          <h3>Unsold</h3>
          <p>
            {unsold.length} {unsold.length === 1 ? 'player' : 'players'}
          </p>
        </button>
      </div>
    </div>
  );
}
