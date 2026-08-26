import { useState } from 'react';
import { formatCr } from '../lib/bidRules.js';

/** Sidebar: what you have bought and what you have left. */
export default function MyTeam({ me, startingPurse = 12000 }) {
  const [open, setOpen] = useState(true);
  const team = me?.team ?? [];
  const spent = startingPurse - (me?.purse ?? startingPurse);

  return (
    <div className="team-sidebar">
      <div className="sidebar-header">
        <h3>My Team ({team.length})</h3>
        <p>Purse: {formatCr(me?.purse)}</p>
        <p className="spent-info">Spent: {formatCr(spent)}</p>
        <button className="toggle-sidebar-btn" onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide' : 'Show'}
        </button>
      </div>

      {open && (
        <div className="sidebar-content">
          {team.length === 0 ? (
            <div className="no-players-yet">
              <p>No players yet</p>
            </div>
          ) : (
            <div className="sidebar-players">
              {team.map((entry, i) => {
                const p = entry.player ?? entry;
                return (
                  <div key={p?._id ?? i} className="sidebar-player-card">
                    <h4>{p?.name ?? 'Player'}</h4>
                    <div className="player-details">
                      <span>{p?.playerType}</span>
                      <span className="player-price">{formatCr(entry.price)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
