import { Router } from 'express';
import { randomUUID } from 'crypto';
import { Room as RoomDoc } from '../models/Room.js';
import { Player } from '../models/Player.js';
import * as registry from '../state/RoomRegistry.js';
import { RULES } from '../config/env.js';
import { dbStatus } from '../db.js';

export const roomsRouter = Router();

/**
 * Room codes are generated SERVER-side with a collision check. The old client
 * picked 8 random letters in the browser with no uniqueness check at all —
 * and one of the codes in the local database has a leading space in it.
 *
 * Ambiguous glyphs (0/O, 1/I) are excluded so codes can be read aloud.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomCode(length = 6) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

async function uniqueCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode();
    if (!(await RoomDoc.exists({ roomCode: code }))) return code;
  }
  throw new Error('Could not allocate a unique room code');
}

roomsRouter.get('/health', (req, res) => {
  res.json({ ok: true, db: dbStatus(), liveRooms: registry.size() });
});

/**
 * Create a room. Shuffles the player catalog ONCE and persists the resulting
 * order as the room's immutable auction script.
 */
roomsRouter.post('/rooms', async (req, res) => {
  try {
    const hostName = String(req.body?.hostName || '').trim();
    if (!hostName) return res.status(400).json({ error: 'hostName is required' });

    const playerCount = await Player.estimatedDocumentCount();
    if (!playerCount) {
      return res.status(503).json({ error: 'Player catalog is empty. Run `npm run seed`.' });
    }

    const roomCode = await uniqueCode();
    const userId = randomUUID();
    const script = await registry.buildAuctionScript();

    await RoomDoc.create({
      roomCode,
      adminUserId: userId,
      phase: 'LOBBY',
      playerIds: script.map((p) => p._id),
      participants: [],
      lots: [],
      maxParticipants: RULES.maxParticipants,
      lotDurationMs: RULES.lotDurationMs,
      startingPurse: RULES.startingPurse,
    });

    registry.create(
      registry.makeRoom({
        roomCode,
        adminUserId: userId,
        players: script,
        lotDurationMs: RULES.lotDurationMs,
        startingPurse: RULES.startingPurse,
        phase: 'LOBBY',
      })
    );

    res.status(201).json({ roomCode, userId, totalPlayers: script.length });
  } catch (err) {
    console.error('[rooms] create failed:', err);
    res.status(500).json({ error: 'Could not create room' });
  }
});

/**
 * Check a room before joining. The old client called an equivalent endpoint,
 * discarded the response, and navigated regardless — so you could "join" a
 * room that did not exist. It also answered by listing EVERY collection in the
 * database on each attempt.
 */
roomsRouter.get('/rooms/:code', async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const doc = await RoomDoc.findOne({ roomCode: code }).lean();
  if (!doc) return res.status(404).json({ exists: false, error: 'Room not found' });

  const live = registry.get(code);
  // Count only people who still hold a seat. Counting every record ever
  // written made this disagree with the live room after a kick.
  const participantCount = live
    ? live.activeParticipants().length
    : (doc.participants ?? []).filter((p) => (p.status ?? 'ACTIVE') === 'ACTIVE').length;

  res.json({
    exists: true,
    roomCode: code,
    phase: live?.phase ?? doc.phase,
    participantCount,
    maxParticipants: doc.maxParticipants,
    totalPlayers: doc.playerIds.length,
  });
});

/** Post-auction summary, readable after the live room is gone. */
roomsRouter.get('/rooms/:code/results', async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const doc = await RoomDoc.findOne({ roomCode: code }).lean();
  if (!doc) return res.status(404).json({ error: 'Room not found' });

  const players = await Player.find({ _id: { $in: doc.playerIds } }).lean();
  const byId = new Map(players.map((p) => [String(p._id), p]));

  // Mirrors buildResults: removed managers appear only if they bought someone,
  // so the sold-player count still adds up.
  const teams = (doc.participants ?? [])
    .filter((p) => (p.status ?? 'ACTIVE') === 'ACTIVE' || (p.team ?? []).length > 0)
    .map((p) => ({
      userId: p.userId,
      name: p.name,
      purse: p.purse,
      spent: doc.startingPurse - p.purse,
      removed: (p.status ?? 'ACTIVE') !== 'ACTIVE',
      players: (p.team ?? []).map((t) => ({
        ...byId.get(String(t.playerId)),
        _id: String(t.playerId),
        price: t.price,
      })),
    }));

  const unsold = (doc.lots ?? [])
    .filter((l) => l.status === 'UNSOLD')
    .map((l) => ({ ...byId.get(String(l.playerId)), _id: String(l.playerId) }));

  res.json({ roomCode: code, phase: doc.phase, teams, unsold });
});
