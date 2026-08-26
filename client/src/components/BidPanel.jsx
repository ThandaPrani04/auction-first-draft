import { formatCr, nextBid } from '../lib/bidRules.js';

/**
 * The BID button and the admin's auction controls.
 *
 * The button is disabled when you already hold the standing bid — but that is
 * only UX. The server enforces the same rule and rejects the bid outright, so
 * the invariant holds even if the button is bypassed. Client-side validation
 * is a hint; the server check is what makes it true.
 */
export default function BidPanel({ state, actions }) {
  const { phase, lot, player, me, isAdmin, lotIndex, totalLots, notice } = state;

  const running = lot?.status === 'RUNNING';
  const settled = lot?.status === 'SETTLED';
  const paused = lot?.status === 'PAUSED';

  const amount = player ? nextBid(player.basePrice, lot?.currentBid ?? null) : null;
  const iAmHighest = !!me && lot?.highestBidderId === me.userId;
  const canAfford = amount != null && me != null && amount <= me.purse;

  const disabled = !running || iAmHighest || !canAfford;

  let reason = null;
  if (paused) reason = 'Auction paused';
  else if (settled) reason = isAdmin ? 'Call the next player' : 'Waiting for the room creator';
  else if (iAmHighest) reason = 'You hold the highest bid';
  else if (running && !canAfford) reason = 'Not enough purse';

  return (
    <div className="auction-controls">
      <div className="bid-controls">
        {isAdmin && phase === 'LOBBY' && (
          <button className="start-btn" onClick={actions.startAuction}>
            Start Auction
          </button>
        )}

        {isAdmin && phase === 'LIVE' && (
          <button className="start-btn" onClick={actions.nextPlayer} disabled={!settled}>
            {lotIndex + 1 >= totalLots ? 'Finish Auction' : 'Next Player →'}
          </button>
        )}

        <button className="bid-btn" onClick={() => actions.placeBid(lotIndex)} disabled={disabled}>
          {amount != null ? `Bid ${formatCr(amount)}` : 'Place Bid'}
        </button>
      </div>

      {reason && <p className="status-message">{reason}</p>}
      {notice && <p className={`status-message notice-${notice.kind}`}>{notice.text}</p>}
    </div>
  );
}
