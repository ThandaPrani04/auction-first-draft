/**
 * Lot lifecycle: open, settle, advance, pause, resume.
 *
 * The server owns the clock. It stores an ABSOLUTE deadline (`endsAt`) and
 * broadcasts that; clients render `endsAt - Date.now()` and emit nothing. The
 * old design had every client run its own setInterval and echo `sync-timer`
 * once a second, which each peer blindly applied — N clients with clocks a few
 * hundred ms apart, overwriting each other. That was the flickering countdown.
 *
 * Only the server's setTimeout can settle a lot, and settling is idempotent,
 * so a lot can never be sold twice.
 */
import { Room as RoomDoc } from '../models/Room.js';
import { publicPlayer } from '../state/RoomRegistry.js';

/** Lot status: IDLE -> RUNNING -> PAUSED <-> RUNNING -> SETTLED */

export function startAuction(io, room) {
  if (room.phase !== 'LOBBY') return { ok: false, code: 'ALREADY_STARTED' };
  room.phase = 'LIVE';
  openLot(io, room, 0);
  RoomDoc.updateOne({ roomCode: room.roomCode }, { $set: { phase: 'LIVE' } }).catch(logPersistError);
  return { ok: true };
}

export function openLot(io, room, index) {
  const player = room.players[index];
  if (!player) return endAuction(io, room);

  room.lotIndex = index;
  room.lot = {
    index,
    playerId: String(player._id),
    basePrice: player.basePrice,
    currentBid: null,
    highestBidderId: null,
    status: 'RUNNING',
    endsAt: Date.now() + room.lotDurationMs,
    remainingMs: null,
    timer: null,
  };

  scheduleSettle(io, room);

  // Announce the lot BEFORE any pause, so clients always know which player is
  // up even if the room freezes the instant it opens.
  const version = room.bump();
  io.to(room.roomCode).emit('auction:lot', {
    version,
    lotIndex: index,
    totalLots: room.totalLots,
    player: publicPlayer(player),
    currentBid: null,
    highestBidderId: null,
    endsAt: room.lot.endsAt,
    status: 'RUNNING',
  });

  // A lot opening while someone is missing is immediately frozen by the
  // disconnect policy.
  if (!room.allConnected()) pause(io, room, 'PARTICIPANT_DISCONNECTED');

  return { ok: true };
}

/**
 * Re-arm the settle timeout against the current `endsAt`. Called when a lot
 * opens, when a bid extends it (anti-snipe), and when a pause is lifted.
 */
export function scheduleSettle(io, room) {
  const lot = room.lot;
  if (!lot) return;
  if (lot.timer) clearTimeout(lot.timer);
  lot.timer = setTimeout(() => settleLot(io, room), Math.max(0, lot.endsAt - Date.now()));
}

/**
 * Close the current lot. Idempotent: a double-fire (a stray timeout racing an
 * admin action) is a no-op rather than a second sale.
 */
export function settleLot(io, room) {
  const lot = room.lot;
  if (!lot || lot.status !== 'RUNNING') return;

  if (lot.timer) clearTimeout(lot.timer);
  lot.timer = null;
  lot.status = 'SETTLED';

  const player = room.players[lot.index];
  const winner = lot.highestBidderId ? room.participants.get(lot.highestBidderId) : null;

  let record;
  if (winner && lot.currentBid != null) {
    // The only durable write in the whole bid path: one per player, not one
    // per click.
    winner.purse -= lot.currentBid;
    winner.team.push({ playerId: String(player._id), price: lot.currentBid });
    record = {
      index: lot.index,
      player: publicPlayer(player),
      status: 'SOLD',
      soldPrice: lot.currentBid,
      winnerUserId: winner.userId,
      winnerName: winner.name,
    };
  } else {
    record = {
      index: lot.index,
      player: publicPlayer(player),
      status: 'UNSOLD',
      soldPrice: null,
      winnerUserId: null,
      winnerName: null,
    };
  }

  room.settled.push(record);
  const version = room.bump();

  io.to(room.roomCode).emit('auction:settled', {
    version,
    ...record,
    isLastLot: lot.index >= room.totalLots - 1,
    participants: participantsPayload(room),
  });

  persistSettlement(room, record).catch(logPersistError);
}

/** Admin-triggered: move to the next player. */
export function advance(io, room) {
  if (room.phase !== 'LIVE') return { ok: false, code: 'NOT_LIVE' };
  if (room.lot && room.lot.status !== 'SETTLED') {
    return { ok: false, code: 'LOT_STILL_OPEN' };
  }
  const next = room.lotIndex + 1;
  if (next >= room.totalLots) return endAuction(io, room);
  return openLot(io, room, next);
}

export function endAuction(io, room) {
  room.phase = 'ENDED';
  room.lot = null;
  const version = room.bump();
  io.to(room.roomCode).emit('auction:ended', {
    version,
    results: buildResults(room),
  });
  RoomDoc.updateOne({ roomCode: room.roomCode }, { $set: { phase: 'ENDED' } }).catch(logPersistError);
  return { ok: true };
}

/**
 * Freeze the lot. Storing `remainingMs` is the one place the absolute-deadline
 * model needs care — you cannot pause a deadline, only a duration.
 */
export function pause(io, room, reason) {
  const lot = room.lot;
  if (!lot || lot.status !== 'RUNNING') return;

  lot.remainingMs = Math.max(0, lot.endsAt - Date.now());
  if (lot.timer) clearTimeout(lot.timer);
  lot.timer = null;
  lot.status = 'PAUSED';
  lot.endsAt = null;

  const version = room.bump();
  io.to(room.roomCode).emit('auction:paused', {
    version,
    reason,
    waitingFor: room.missingParticipants().map((p) => p.name),
    remainingMs: lot.remainingMs,
  });
}

export function resume(io, room) {
  const lot = room.lot;
  if (!lot || lot.status !== 'PAUSED') return { ok: false, code: 'NOT_PAUSED' };
  if (!room.allConnected()) {
    return { ok: false, code: 'STILL_WAITING', waitingFor: room.missingParticipants().map((p) => p.name) };
  }

  // Policy: restart the lot at its full duration rather than restoring
  // remainingMs, so nobody wins because an opponent's connection dropped with
  // half a second left. remainingMs is kept in state so this is a one-line
  // change if the fairer-to-the-clock behaviour is wanted instead.
  lot.endsAt = Date.now() + room.lotDurationMs;
  lot.remainingMs = null;
  lot.status = 'RUNNING';
  scheduleSettle(io, room);

  const version = room.bump();
  io.to(room.roomCode).emit('auction:resumed', {
    version,
    endsAt: lot.endsAt,
    participants: participantsPayload(room),
  });
  return { ok: true };
}

/**
 * Only ACTIVE participants are broadcast. A kicked or dropped player keeps a
 * record server-side so the results still reconcile, but they no longer appear
 * in the room.
 */
export function participantsPayload(room) {
  return room.activeParticipants().map((p) => ({
    userId: p.userId,
    name: p.name,
    purse: p.purse,
    teamSize: p.team.length,
    connected: p.connected,
    status: p.status,
    isAdmin: room.isAdmin(p.userId),
  }));
}

export function buildResults(room) {
  // Removed managers are listed only if they actually bought someone —
  // otherwise a kicked player's squad would vanish and the sold-player count
  // would no longer add up.
  const teams = [...room.participants.values()]
    .filter((p) => p.status === 'ACTIVE' || p.team.length > 0)
    .map((p) => ({
      userId: p.userId,
      name: p.name,
      purse: p.purse,
      spent: room.startingPurse - p.purse,
      removed: p.status !== 'ACTIVE',
      players: p.team.map((t) => {
        const player = room.players.find((pl) => String(pl._id) === String(t.playerId));
        return { ...publicPlayer(player), price: t.price };
      }),
    }));

  return {
    teams,
    unsold: room.settled.filter((s) => s.status === 'UNSOLD').map((s) => s.player),
    sold: room.settled.filter((s) => s.status === 'SOLD'),
  };
}

/**
 * Persist one settlement. Called AFTER the broadcast, so the network round
 * trip is never on the bidding hot path.
 */
async function persistSettlement(room, record) {
  const winner = record.winnerUserId ? room.participants.get(record.winnerUserId) : null;
  const update = {
    $push: {
      lots: {
        index: record.index,
        playerId: record.player._id,
        status: record.status,
        soldPrice: record.soldPrice,
        winnerUserId: record.winnerUserId,
      },
    },
  };
  await RoomDoc.updateOne({ roomCode: room.roomCode }, update);

  if (winner) {
    await RoomDoc.updateOne(
      { roomCode: room.roomCode, 'participants.userId': winner.userId },
      {
        $set: { 'participants.$.purse': winner.purse },
        $push: { 'participants.$.team': { playerId: record.player._id, price: record.soldPrice } },
      }
    );
  }
}

function logPersistError(err) {
  console.error('[auction] persist failed:', err.message);
}
