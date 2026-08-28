import { formatCr, nextBid } from '../lib/bidRules.js';

/**
 * Controls plus the status line.
 *
 * The host's flow button (Start / Next / Finish) is rendered only for the
 * host; everyone else sees just the BID button, centred. The status line
 * always renders (falling back to a non-breaking space) so nothing under it
 * shifts as messages come and go, and it is phrased differently for the host
 * and the bidders — the host is told what to press, the bidders what to wait
 * for.
 *
 * Disabling BID when you already hold the top bid is UX only; the server
 * enforces the same rule and rejects the bid outright.
 */
export default function BidPanel({ state, actions }) {
  const { phase, lot, player, me, isAdmin, lotIndex, totalLots, notice } = state;

  const running = lot?.status === 'RUNNING';
  const settled = lot?.status === 'SETTLED';
  const paused = lot?.status === 'PAUSED';
  const lastLot = lotIndex + 1 >= totalLots;

  const amount = player ? nextBid(player.basePrice, lot?.currentBid ?? null) : null;
  const iAmHighest = !!me && lot?.highestBidderId === me.userId;
  const canAfford = amount != null && me != null && amount <= me.purse;

  const adminLabel =
    phase === 'LOBBY' ? 'Start Auction' : lastLot && settled ? 'Finish Auction' : 'Next Player';
  const adminDisabled = phase === 'LOBBY' ? false : !settled;

  let status = ' ';
  if (paused) status = 'Auction paused';
  else if (phase === 'LOBBY') status = isAdmin ? 'Press Start when everyone has joined' : 'Waiting for the host to start the auction';
  else if (settled && lastLot) status = isAdmin ? 'Press Finish to see the results' : 'Waiting for the host to finish the auction';
  else if (settled) status = isAdmin ? 'Press Next Player to continue' : 'Waiting for the host to call the next player';
  else if (iAmHighest) status = 'You hold the highest bid';
  else if (running && !canAfford) status = 'Not enough purse for the next bid';
  else if (running) status = isAdmin ? 'Bidding is open — you can bid too' : 'Bidding is open';

  return (
    <div className="stage-controls">
      <div className="controls-row">
        {isAdmin && (
          <button
            className="btn btn--ghost"
            onClick={phase === 'LOBBY' ? actions.startAuction : actions.nextPlayer}
            disabled={adminDisabled}
          >
            {adminLabel}
          </button>
        )}

        <button
          className="btn btn--bid"
          onClick={() => actions.placeBid(lotIndex)}
          disabled={!running || iAmHighest || !canAfford}
        >
          {amount != null ? `Bid ${formatCr(amount)}` : 'Place Bid'}
        </button>
      </div>

      <p className={`status-line${notice ? ` notice-${notice.kind}` : ''}`}>
        {notice ? notice.text : status}
      </p>
    </div>
  );
}
