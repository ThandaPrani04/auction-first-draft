/**
 * The live, in-memory auction state.
 *
 * WHY IN MEMORY: currentBid changes many times per second while a lot is open,
 * but an intermediate bid is not a fact worth keeping — it is meaningful only
 * until the hammer falls. Only the settlement (who won, for how much) is
 * durable, and that is one write per player rather than one per click.
 *
 * More importantly it is a CORRECTNESS decision, not just a performance one.
 * Node runs socket handlers one at a time on a single thread, so a
 * read-modify-write on a plain object is atomic *provided the handler never
 * awaits*. Putting `await room.save()` inside the bid path would yield the
 * event loop mid-update and reintroduce the lost-update race this rework
 * exists to fix. See services/bidService.js.
 *
 * LIMITATION, stated deliberately: this binds the app to a single Node
 * process. Two instances behind a load balancer would each hold a different
 * currentBid. Scaling out means moving this map to Redis (with
 * @socket.io/redis-adapter for fan-out) and doing the bid update as a Lua
 * script so it stays atomic.
 */

import { Room as RoomDoc } from '../models/Room.js';
import { Player } from '../models/Player.js';
import { RULES } from '../config/env.js';

/** @type {Map<string, LiveRoom>} */
const rooms = new Map();

class LiveRoom {
  constructor({ roomCode, adminUserId, players, lotDurationMs, startingPurse, phase }) {
    this.roomCode = roomCode;
    this.adminUserId = adminUserId;
    this.phase = phase ?? 'LOBBY';

    /**
     * Monotonic. Bumped on EVERY accepted mutation and attached to every
     * broadcast. Clients drop anything with version <= what they have (kills
     * duplicate and out-of-order delivery) and re-sync on a gap.
     */
    this.version = 0;

    /** The shuffled script — hydrated catalog docs, fixed for the room's life. */
    this.players = players;
    this.lotDurationMs = lotDurationMs ?? RULES.lotDurationMs;
    this.startingPurse = startingPurse ?? RULES.startingPurse;

    /** @type {Map<string, Participant>} keyed by userId, never by socket.id. */
    this.participants = new Map();

    this.lotIndex = -1;
    this.lot = null;

    /** Settled lots, kept for the results screen. */
    this.settled = [];

    /** Set while the room is empty and counting down to being reclaimed. */
    this.evictionTimer = null;
  }

  bump() {
    return ++this.version;
  }

  get currentPlayer() {
    return this.lotIndex >= 0 ? this.players[this.lotIndex] : null;
  }

  get totalLots() {
    return this.players.length;
  }

  addParticipant(userId, name) {
    let p = this.participants.get(userId);
    if (p) {
      // Reconnect: rebind, keep purse and team. This is the fix for the old
      // socket.id-keyed state that handed out a fresh 120 Cr on every refresh.
      // A previously ABANDONED player coming back is welcome again; a KICKED
      // one is refused before we ever get here.
      p.connected = true;
      p.status = 'ACTIVE';
      p.name = name || p.name;
      return p;
    }
    p = {
      userId,
      name,
      purse: this.startingPurse,
      team: [],
      connected: true,
      status: 'ACTIVE',
      socketId: null,
    };
    this.participants.set(userId, p);
    return p;
  }

  /** Everyone currently holding a seat. */
  activeParticipants() {
    return [...this.participants.values()].filter((p) => p.status === 'ACTIVE');
  }

  isKicked(userId) {
    return this.participants.get(userId)?.status === 'KICKED';
  }

  /** Participants who must be back before a paused auction may resume. */
  missingParticipants() {
    return this.activeParticipants().filter((p) => !p.connected);
  }

  allConnected() {
    return this.missingParticipants().length === 0;
  }

  /** Whether anyone at all is currently on a socket. */
  hasLiveConnection() {
    return [...this.participants.values()].some((p) => p.connected);
  }

  isAdmin(userId) {
    return this.adminUserId === userId;
  }

  /**
   * The single snapshot a client needs to render the room from cold — the
   * whole reason reconnect needs no negotiation. `endsAt` is an absolute
   * timestamp, so the client computes its own remaining time and every client
   * agrees without a sync protocol.
   */
  snapshot(userId) {
    const me = this.participants.get(userId);
    return {
      version: this.version,
      roomCode: this.roomCode,
      phase: this.phase,
      isAdmin: this.isAdmin(userId),
      totalLots: this.totalLots,
      lotIndex: this.lotIndex,
      player: publicPlayer(this.currentPlayer),
      lot: this.lot
        ? {
            status: this.lot.status,
            currentBid: this.lot.currentBid,
            highestBidderId: this.lot.highestBidderId,
            highestBidderName: this.lot.highestBidderId
              ? this.participants.get(this.lot.highestBidderId)?.name ?? null
              : null,
            endsAt: this.lot.endsAt,
          }
        : null,
      // Active only — a kicked or dropped player keeps a record server-side
      // for the results, but must not reappear in anyone's room list.
      participants: this.activeParticipants().map(publicParticipant(this)),
      me: me
        ? { userId: me.userId, name: me.name, purse: me.purse, team: me.team }
        : null,
      waitingFor: this.missingParticipants().map((p) => p.name),
      settled: this.settled,
    };
  }
}

export function publicPlayer(p) {
  if (!p) return null;
  return {
    _id: String(p._id),
    name: p.name,
    team: p.team,
    set: p.set,
    playerType: p.playerType,
    basePrice: p.basePrice,
    point: p.point,
  };
}

const publicParticipant = (room) => (p) => ({
  userId: p.userId,
  name: p.name,
  purse: p.purse,
  teamSize: p.team.length,
  connected: p.connected,
  status: p.status,
  isAdmin: room.isAdmin(p.userId),
});

/** Fisher-Yates, in place. */
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Build a room's auction script: shuffle WITHIN each set, then concatenate
 * sets in order.
 *
 * Randomising matters because a fixed order is memorisable — replay the
 * auction and you can plan your whole purse in advance, which removes the only
 * real decision in the game ("bid now, or save for someone better later?").
 * Shuffling within a set keeps that uncertainty while preserving the tiering,
 * so marquee players still come up while purses are full.
 *
 * It is shuffled ONCE and persisted, because every client must agree on what
 * player #7 is for the lotIndex cursor to mean anything.
 */
export async function buildAuctionScript() {
  const players = await Player.find({}).lean();
  if (!players.length) {
    throw new Error('Player catalog is empty. Run `npm run seed` first.');
  }
  const sets = [...new Set(players.map((p) => p.set))].sort((a, b) => a - b);
  const script = [];
  for (const set of sets) {
    script.push(...shuffle(players.filter((p) => p.set === set)));
  }
  return script;
}

export function create(room) {
  rooms.set(room.roomCode, room);
  return room;
}

export function get(roomCode) {
  return rooms.get(roomCode);
}

export function remove(roomCode) {
  const room = rooms.get(roomCode);
  if (room?.lot?.timer) clearTimeout(room.lot.timer);
  if (room?.evictionTimer) clearTimeout(room.evictionTimer);
  rooms.delete(roomCode);
}

/**
 * How long an empty room is held in memory before its live state is dropped.
 *
 * Under the hard-pause policy a brief all-disconnect is routine — everyone
 * refreshing at once, or the last two people reloading together. Evicting
 * immediately threw away the live auction and silently reset the room to its
 * lobby. The grace period means only a genuinely abandoned room is reclaimed.
 */
export const EVICTION_GRACE_MS = Number(process.env.EVICTION_GRACE_MS) || 10 * 60_000;

export function scheduleEviction(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.evictionTimer) return;
  room.evictionTimer = setTimeout(() => {
    const current = rooms.get(roomCode);
    // Re-check rather than trusting the timer: someone may have rejoined.
    if (current && !current.hasLiveConnection()) remove(roomCode);
  }, EVICTION_GRACE_MS);
}

export function cancelEviction(roomCode) {
  const room = rooms.get(roomCode);
  if (room?.evictionTimer) {
    clearTimeout(room.evictionTimer);
    room.evictionTimer = null;
  }
}

export function makeRoom(opts) {
  return new LiveRoom(opts);
}

/**
 * Fetch a room, hydrating from Mongo if this process has not seen it yet
 * (freshly created via REST, or the server restarted while it was in LOBBY).
 * Live lot state is deliberately NOT restored — that is the documented
 * single-process limitation.
 */
export async function load(roomCode) {
  const existing = rooms.get(roomCode);
  if (existing) return existing;

  const doc = await RoomDoc.findOne({ roomCode }).lean();
  if (!doc) return null;

  const players = await Player.find({ _id: { $in: doc.playerIds } }).lean();
  const byId = new Map(players.map((p) => [String(p._id), p]));
  const script = doc.playerIds.map((id) => byId.get(String(id))).filter(Boolean);

  const room = new LiveRoom({
    roomCode: doc.roomCode,
    adminUserId: doc.adminUserId,
    players: script,
    lotDurationMs: doc.lotDurationMs,
    startingPurse: doc.startingPurse,
    // A room that was mid-auction cannot have its live lot restored, so it
    // reopens in the lobby rather than pretending to resume.
    phase: doc.phase === 'ENDED' ? 'ENDED' : 'LOBBY',
  });

  for (const p of doc.participants ?? []) {
    room.participants.set(p.userId, {
      userId: p.userId,
      name: p.name,
      purse: p.purse,
      team: p.team ?? [],
      connected: false,
      status: p.status ?? 'ACTIVE',
      socketId: null,
    });
  }

  rooms.set(roomCode, room);
  return room;
}

export function size() {
  return rooms.size;
}
