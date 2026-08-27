import { useEffect, useMemo, useRef } from 'react';
import { formatCr } from '../lib/bidRules.js';

/**
 * The master player list, crossed off as lots settle.
 *
 * Shows the catalog in canonical order (by set), NOT the room's shuffled
 * script — so the randomised auction order reads as scattered strikeouts
 * rather than a top-to-bottom sweep, and you can always find a specific player.
 *
 * Row height is fixed and every row renders the same three slots whatever its
 * state, so nothing reflows as players settle.
 */
export default function PlayerLedger({ catalog, settled, currentPlayerId }) {
  /** playerId -> outcome */
  const outcomes = useMemo(() => {
    const map = new Map();
    for (const s of settled) {
      if (s.player?._id) map.set(String(s.player._id), s);
    }
    return map;
  }, [settled]);

  const bySet = useMemo(() => {
    const groups = new Map();
    for (const p of catalog) {
      if (!groups.has(p.set)) groups.set(p.set, []);
      groups.get(p.set).push(p);
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, [catalog]);

  // Keep the live player in view as the auction jumps around the list.
  const currentRef = useRef(null);
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentPlayerId]);

  const done = outcomes.size;
  const sold = [...outcomes.values()].filter((o) => o.status === 'SOLD').length;

  return (
    <section className="panel ledger">
      <header className="panel-head">
        <h2>Player List</h2>
        <span className="panel-count">
          {done}/{catalog.length}
        </span>
      </header>

      <div className="ledger-summary">
        <span><b>{sold}</b> sold</span>
        <span><b>{done - sold}</b> unsold</span>
        <span><b>{catalog.length - done}</b> left</span>
      </div>

      <div className="panel-scroll">
        {bySet.map(([set, players]) => (
          <div key={set} className="ledger-set">
            <div className="ledger-set-label">Set {set}</div>
            {players.map((p) => {
              const outcome = outcomes.get(String(p._id));
              const isCurrent = String(p._id) === String(currentPlayerId);
              const cls = [
                'ledger-row',
                outcome ? `is-${outcome.status.toLowerCase()}` : 'is-pending',
                isCurrent ? 'is-current' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <div key={p._id} className={cls} ref={isCurrent ? currentRef : null}>
                  <span className="ledger-name" title={p.name}>
                    {p.name}
                  </span>
                  <span className="ledger-outcome">
                    {outcome ? (
                      outcome.status === 'SOLD' ? (
                        <>
                          <b>{formatCr(outcome.soldPrice)}</b>
                          <em title={outcome.winnerName}>{outcome.winnerName}</em>
                        </>
                      ) : (
                        <i>unsold</i>
                      )
                    ) : isCurrent ? (
                      <i className="ledger-live">on the block</i>
                    ) : (
                      <span className="ledger-base">{formatCr(p.basePrice)}</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
