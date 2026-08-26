import { formatCr, nextBid } from '../lib/bidRules.js';

/** The player currently under the hammer, with base and standing bid. */
export default function PlayerCard({ player, lot, lotIndex, totalLots }) {
  if (!player) {
    return (
      <div className="current-player">
        <div className="player-info">
          <h2>Waiting for the auction to start…</h2>
        </div>
      </div>
    );
  }

  const currentBid = lot?.currentBid ?? null;

  return (
    <div className="current-player">
      <div className="player-info">
        <h2>{player.name}</h2>
        <p className="player-meta">
          {player.team} · {player.playerType} · {player.point} pts · Set {player.set}
          {totalLots ? ` · Lot ${lotIndex + 1} of ${totalLots}` : ''}
        </p>

        <div className="price-info">
          <div className="price-box">
            <div className="price-label">Base Price</div>
            <div className="price-value">{formatCr(player.basePrice)}</div>
          </div>
          <div className="price-box current">
            <div className="price-label">Current Bid</div>
            {/* Keyed on the amount so React remounts the node and the one-shot
                bid-pop animation replays on each new bid. */}
            <div className="price-value" key={currentBid ?? 'none'}>
              {currentBid != null ? formatCr(currentBid) : 'No bids'}
            </div>
          </div>
          <div className="price-box">
            <div className="price-label">Next Bid</div>
            <div className="price-value">{formatCr(nextBid(player.basePrice, currentBid))}</div>
          </div>
        </div>

        {lot?.highestBidderName && (
          <p className="last-bid">
            Highest: <strong>{lot.highestBidderName}</strong>
          </p>
        )}
      </div>
    </div>
  );
}
