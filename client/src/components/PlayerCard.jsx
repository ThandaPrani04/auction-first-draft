import { formatCr, nextBid } from '../lib/bidRules.js';

/**
 * The player currently under the hammer.
 *
 * Every slot renders unconditionally — name, meta, three price boxes, the
 * highest-bidder line — so the card is exactly the same size whether the lot
 * is idle, running, or settled. The SOLD/UNSOLD result is an absolutely
 * positioned stamp INSIDE the card rather than the old fullscreen overlay,
 * which both shifted the page and covered the controls.
 */
export default function PlayerCard({ player, lot, settlement, isAdmin, me }) {
  const currentBid = lot?.currentBid ?? null;
  const settled = lot?.status === 'SETTLED' && settlement;

  if (!player) {
    return (
      <section className="panel stage-card is-empty">
        <div className="stage-empty">
          <h2>Waiting to start</h2>
          <p>{isAdmin ? 'Press Start Auction to open the first lot.' : 'The host opens the first lot.'}</p>
        </div>
      </section>
    );
  }

  // Personalise the SOLD result for the viewer: did you win this player?
  const iWon = settled && settlement.status === 'SOLD' && !!me && settlement.winnerUserId === me.userId;

  return (
    <section className={`panel stage-card${settled ? ' is-settled' : ''}`}>
      <div className="stage-player">
        <h2 className="stage-name" title={player.name}>
          {player.name}
        </h2>
        <div className="stage-meta">
          <span className="chip chip--team">{player.team}</span>
          <span className="chip">{player.playerType}</span>
          <span className="chip">Set {player.set}</span>
          <span className="chip">{player.point} pts</span>
        </div>
      </div>

      <div className="stage-prices">
        <div className="pricebox">
          <span className="pricebox-label">Base</span>
          <span className="pricebox-value">{formatCr(player.basePrice)}</span>
        </div>
        <div className="pricebox pricebox--current">
          <span className="pricebox-label">Current Bid</span>
          {/* Keyed on the amount so the one-shot pop animation replays. */}
          <span className="pricebox-value" key={currentBid ?? 'none'}>
            {currentBid != null ? formatCr(currentBid) : '—'}
          </span>
        </div>
        <div className="pricebox">
          <span className="pricebox-label">Next Bid</span>
          <span className="pricebox-value">
            {formatCr(nextBid(player.basePrice, currentBid))}
          </span>
        </div>
      </div>

      {/* Always rendered, even when empty, to hold its height. */}
      <div className="stage-holder">
        {lot?.highestBidderName ? (
          <>
            Highest bidder <strong>{lot.highestBidderName}</strong>
          </>
        ) : (
          <span className="muted">No bids yet</span>
        )}
      </div>

      {settled && (
        <div className={`stamp stamp--${settlement.status.toLowerCase()}${iWon ? ' stamp--mine' : ''}`}>
          <span className="stamp-word">{settlement.status}</span>
          {settlement.status === 'SOLD' && (
            <span className="stamp-detail">
              {iWon ? 'You won' : settlement.winnerName} · {formatCr(settlement.soldPrice)}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
