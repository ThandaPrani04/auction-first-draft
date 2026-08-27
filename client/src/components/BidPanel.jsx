import { formatCr, nextBid } from '../lib/bidRules.js';

/**
 * Controls plus the status line.
 *
 * Both buttons are always in the DOM and always the same width — disabled
 * rather than removed, and held with `visibility` for non-admins — so the BID
 * button never moves. The status line always renders too, falling back to a
 * non-breaking space, because a message appearing and disappearing was
 * shifting everything under it.
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
  else if (phase === 'LOBBY') status = isAdmin ? 'Start when everyone has joined' : 'Waiting for the host to start';
  else if (settled) status = isAdmin ? 'Call the next player' : 'Waiting for the host';
  else if (iAmHighest) status = 'You hold the highest bid';
  else if (running && !canAfford) status = 'Not enough purse for the next bid';

  return (
    <div className="stage-controls">
      <div className="controls-row">
        <button
          className="btn btn--ghost"
          onClick={phase === 'LOBBY' ? actions.startAuction : actions.nextPlayer}
          disabled={adminDisabled}
          style={{ visibility: isAdmin ? 'visible' : 'hidden' }}
        >
          {adminLabel}
        </button>

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
