import { useState } from 'react';
import { formatCr } from '../lib/bidRules.js';

/** Post-auction summary: every squad, spend, and the unsold pool. */
export default function ResultsScreen({ results, roomCode }) {
  const [selected, setSelected] = useState(null);
  const [viewingUnsold, setViewingUnsold] = useState(false);

  if (!results) return <div className="loading">Loading results…</div>;

  const { teams = [], unsold = [] } = results;

  if (selected || viewingUnsold) {
    const players = viewingUnsold ? unsold : selected.players;
    return (
      <div className="auction-results">
        <button
          className="back-btn"
          onClick={() => {
            setSelected(null);
            setViewingUnsold(false);
          }}
        >
          ← Back
        </button>
        <h1>{viewingUnsold ? `Unsold Players (${unsold.length})` : `${selected.name}'s Squad`}</h1>
        {!viewingUnsold && (
          <p className="room-info">
            Spent {formatCr(selected.spent)} · {formatCr(selected.purse)} remaining
          </p>
        )}
        <div className="players-grid">
          {players.length === 0 ? (
            <p className="muted">No players.</p>
          ) : (
            players.map((p) => (
              <div key={p._id} className="player-card">
                <h3>{p.name}</h3>
                <p>Team: {p.team}</p>
                <p>Type: {p.playerType}</p>
                <p>Points: {p.point}</p>
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
    <div className="auction-results">
      <h1>Auction Complete</h1>
      <p className="room-info">Room {roomCode}</p>

      <div className="auction-summary">
        <h2>Summary</h2>
        <p>Players sold: {totalSold}</p>
        <p>Players unsold: {unsold.length}</p>
        <p>Total players: {totalSold + unsold.length}</p>
      </div>

      <div className="managers-grid">
        {ranked.map((t) => (
          <button key={t.userId} className="manager-card" onClick={() => setSelected(t)}>
            <h3>{t.name}</h3>
            <p>
              {t.players.length} {t.players.length === 1 ? 'player' : 'players'}
            </p>
            <p className="price">Spent {formatCr(t.spent)}</p>
            <p className="muted">{formatCr(t.purse)} left</p>
          </button>
        ))}
        <button className="manager-card" onClick={() => setViewingUnsold(true)}>
          <h3>Unsold</h3>
          <p>
            {unsold.length} {unsold.length === 1 ? 'player' : 'players'}
          </p>
        </button>
      </div>
    </div>
  );
}
