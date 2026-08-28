/**
 * THE CRITICAL SECTION.
 *
 * How simultaneous bids are made safe, in four layers:
 *
 * 1. Node's event loop IS the mutex. Socket.IO dispatches messages to handlers
 *    that run on a single thread, so two `bid:place` messages arriving "at the
 *    same time" are serialised: handler A runs to completion before handler B
 *    starts. A read-modify-write on a plain in-memory object is therefore
 *    atomic by construction — no lock required.
 *
 *    THE DISCIPLINE: this function contains ZERO `await`. The moment you await
 *    between reading currentBid and writing it, you yield the event loop, B
 *    interleaves, both read the same price, and you have the lost update this
 *    rework exists to remove. That is why persistence is deferred to
 *    settlement rather than done here.
 *
 * 2. The client sends an INTENT, never an amount. It supplies no price, and
 *    the bidder is taken from socket.data.userId (bound at join), never from
 *    the payload. The old code did `newBid = clientPayload.currentBid + 0.2`
 *    and read the bidder's identity from a client-supplied `socketId`, so a
 *    bid could be forged, priced arbitrarily, or attributed to someone else.
 *
 * 3. A monotonic `version` per room orders every broadcast, so a client can
 *    discard stale updates and detect that it missed one.
 *
 * 4. What actually happens in a race, by default: A is processed first (price
 *    -> 1.20 Cr, highest = A), then B is processed and would bid 1.40 Cr. In
 *    plain auction terms that is CORRECT behaviour — B wanted to outbid and
 *    the price moved. But this app also honours the client's INTENT about
 *    the price it is bidding against: the client attaches `expectedBid`, the
 *    price it last saw on screen when the BID button was pressed. If that no
 *    longer matches the server's `currentBid` when the message is handled —
 *    because someone else's bid (like A's) got there first — B did not agree
 *    to pay whatever the new increment happens to be, so the bid is rejected
 *    with OUTBID rather than silently re-priced. B sees the new price and can
 *    press BID again to accept it.
 *
 * 5. The one rule that must hold regardless of races is that the standing
 *    highest bidder cannot bid against themselves, and that is enforced here
 *    rather than trusted to a disabled button.
 */
import { nextBid, formatCr } from '../shared/bidRules.js';
import { scheduleSettle } from './auctionService.js';

/**
 * @returns {{ok: true, amount: number} | {ok: false, code: string, message: string}}
 */
export function placeBid(io, room, userId, { lotIndex, expectedBid } = {}) {
  // ---------- BEGIN CRITICAL SECTION — no await past this point ----------
  if (room.phase !== 'LIVE') {
    return reject('LOT_CLOSED', 'The auction is not running.');
  }

  const lot = room.lot;
  if (!lot || lot.status !== 'RUNNING') {
    return reject('LOT_CLOSED', 'Bidding is not open for this player.');
  }

  // A click that left the browser just before the previous lot settled must
  // not land on the next player.
  if (lotIndex != null && lotIndex !== room.lotIndex) {
    return reject('STALE', 'That player is no longer up for auction.');
  }

  const bidder = room.participants.get(userId);
  if (!bidder) {
    return reject('NOT_IN_ROOM', 'You are not a participant in this room.');
  }

  // The invariant behind the disabled BID button. The button is UX; this is
  // what makes the rule true.
  if (lot.highestBidderId === userId) {
    return reject('ALREADY_HIGHEST', 'You are already the highest bidder.');
  }

  // Optimistic concurrency: the client tells us the price it saw when it
  // pressed BID. If the server's price has since moved — someone else's bid
  // beat this one to the critical section above — this client did not agree
  // to the new price, so reject rather than silently bid the new increment
  // on their behalf. `expectedBid` is undefined for older clients, which
  // opts them out of this check rather than rejecting every bid they send.
  if (expectedBid !== undefined && expectedBid !== lot.currentBid) {
    return reject(
      'OUTBID',
      `Too slow — someone else bid first. The price is now ${formatCr(lot.currentBid)}.`
    );
  }

  // Computed from SERVER state, never from the payload.
  const amount = nextBid(lot.basePrice, lot.currentBid);

  if (amount > bidder.purse) {
    return reject('INSUFFICIENT_PURSE', 'Not enough purse remaining for this bid.');
  }

  lot.currentBid = amount;
  lot.highestBidderId = userId;

  // Anti-snipe: every accepted bid restores the full countdown.
  lot.endsAt = Date.now() + room.lotDurationMs;
  scheduleSettle(io, room);

  const version = room.bump();
  // ---------- END CRITICAL SECTION ----------

  io.to(room.roomCode).emit('bid:update', {
    version,
    lotIndex: room.lotIndex,
    amount,
    nextBid: nextBid(lot.basePrice, amount),
    bidderId: userId,
    bidderName: bidder.name,
    endsAt: lot.endsAt,
  });

  return { ok: true, amount };
}

function reject(code, message) {
  return { ok: false, code, message };
}
