import { formatCr } from '../lib/bidRules.js';

/**
 * Your squad and what is left of your purse.
 *
 * No collapse toggle any more: hiding it changed the panel's height, which is
 * exactly the kind of jump this revamp is removing. It scrolls internally
 * instead, so the pane is always the same size.
 */
export default function MyTeam({ me, startingPurse = 12000 }) {
  const team = me?.team ?? [];
  const spent = startingPurse - (me?.purse ?? startingPurse);

  return (
    <section className="panel myteam">
      <header className="panel-head">
        <h2>My Team</h2>
        <span className="panel-count">{team.length}</span>
      </header>

      <div className="myteam-purse">
        <div>
          <span className="mini-label">Purse left</span>
          <span className="mini-value">{formatCr(me?.purse)}</span>
        </div>
        <div>
          <span className="mini-label">Spent</span>
          <span className="mini-value mini-value--spent">{formatCr(spent)}</span>
        </div>
      </div>

      <div className="panel-scroll">
        {team.length === 0 ? (
          <p className="panel-empty">No players yet</p>
        ) : (
          team.map((entry, i) => {
            const p = entry.player ?? entry;
            return (
              <div key={p?._id ?? i} className="myteam-row">
                <span className="myteam-name" title={p?.name}>
                  {p?.name ?? 'Player'}
                </span>
                <span className="myteam-price">{formatCr(entry.price)}</span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
