import { formatCr } from '../lib/bidRules.js';

/**
 * SOLD / UNSOLD banner.
 *
 * Driven purely by the server's auction:settled event. The old version was
 * scheduled by a local setTimeout inside an effect whose cleanup cancelled the
 * very timeouts it had just scheduled, so the banner could stick on screen
 * indefinitely or the auction could stall behind it.
 */
export default function SettlementBanner({ settlement }) {
  if (!settlement) return null;

  const { player, status, soldPrice, winnerName } = settlement;
  const sold = status === 'SOLD';

  return (
    <div className={`player-status-message ${sold ? 'is-sold' : 'is-unsold'}`}>
      <h2>
        {player?.name} is {status}
        {sold && (
          <>
            {' '}to <strong>{winnerName}</strong> for {formatCr(soldPrice)}
          </>
        )}
      </h2>
    </div>
  );
}
