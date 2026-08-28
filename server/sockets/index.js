/**
 * Socket wiring.
 *
 * Two rules hold everywhere in this file:
 *
 *  - Identity comes from `socket.data.userId`, bound once at join, never from
 *    a message payload. The old handlers read a client-supplied `socketId` and
 *    resolved the buyer by display name, so bids could be forged and two users
 *    with the same name corrupted each other's purse.
 *
 *  - The room comes from `socket.data.roomCode`, not the payload. Four of the
 *    old handlers accepted a room code from the message and would happily
 *    mutate a room the socket had never joined.
 */
import { randomUUID } from 'crypto';
import * as registry from '../state/RoomRegistry.js';
import { Room as RoomDoc } from '../models/Room.js';
import { placeBid } from '../services/bidService.js';
import {
  startAuction,
  advance,
  pause,
  resume,
  participantsPayload,
  buildResults,
} from '../services/auctionService.js';

export function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    socket.data.userId = null;
    socket.data.roomCode = null;

    /**
     * Join or reconnect. The client sends the userId it persisted in a cookie;
     * the server rebinds that participant to the new socket, so purse, team,
     * and admin rights survive a refresh.
     */
    socket.on('room:join', async ({ roomCode, userId, userName } = {}, ack) => {
      try {
        const code = String(roomCode || '').trim().toUpperCase();
        const room = await registry.load(code);
        if (!room) return respond(ack, { ok: false, code: 'ROOM_NOT_FOUND' });

        // A kick that a page refresh undoes is not a kick.
        if (userId && room.isKicked(userId)) {
          return respond(ack, { ok: false, code: 'KICKED' });
        }

        const existing = userId && room.participants.get(userId);

        // A finished auction never blocks on FULL/LIVE. People who were in the
        // room get seated again so they see their results; anyone else is a
        // spectator who is just told it is over (and is NOT seated).
        if (room.phase === 'ENDED') {
          const id = userId || randomUUID();
          if (existing) {
            const participant = room.addParticipant(id, userName || 'Anonymous');
            participant.socketId = socket.id;
            registry.cancelEviction(code);
            socket.data.userId = id;
            socket.data.roomCode = code;
            socket.join(code);
            const state = room.snapshot(id);
            state.results = buildResults(room);
            respond(ack, { ok: true, userId: id, state });
            io.to(code).emit('room:participants', {
              version: room.version,
              participants: participantsPayload(room),
            });
            return;
          }
          return respond(ack, {
            ok: true,
            userId: id,
            state: { ...room.snapshot(id), spectator: true, results: null },
          });
        }

        if (!existing && room.activeParticipants().length >= room.maxParticipants) {
          return respond(ack, { ok: false, code: 'ROOM_FULL' });
        }
        if (!existing && room.phase === 'LIVE') {
          return respond(ack, { ok: false, code: 'AUCTION_IN_PROGRESS' });
        }

        const id = userId || randomUUID();
        const participant = room.addParticipant(id, userName || 'Anonymous');
        participant.socketId = socket.id;
        registry.cancelEviction(code);

        socket.data.userId = id;
        socket.data.roomCode = code;
        socket.join(code);

        await persistParticipant(room, participant);

        room.bump();
        respond(ack, { ok: true, userId: id, state: room.snapshot(id) });

        io.to(code).emit('room:participants', {
          version: room.version,
          participants: participantsPayload(room),
        });

        // A refresh self-heals: the room paused when they dropped, and lifts
        // again the moment the last missing person is back.
        if (room.phase === 'LIVE' && room.lot?.status === 'PAUSED' && room.allConnected()) {
          resume(io, room);
        }
      } catch (err) {
        console.error('[socket] room:join failed:', err);
        respond(ack, { ok: false, code: 'SERVER_ERROR', message: err.message });
      }
    });

    /** Client detected a version gap and wants a fresh snapshot. */
    socket.on('room:sync', (_payload, ack) => {
      const room = currentRoom(socket);
      if (!room) return respond(ack, { ok: false, code: 'NOT_IN_ROOM' });
      const state = room.snapshot(socket.data.userId);
      if (room.phase === 'ENDED') state.results = buildResults(room);
      respond(ack, { ok: true, state });
    });

    socket.on('bid:place', ({ lotIndex } = {}) => {
      const room = currentRoom(socket);
      if (!room) return socket.emit('room:error', { code: 'NOT_IN_ROOM' });

      const result = placeBid(io, room, socket.data.userId, { lotIndex });
      if (!result.ok) socket.emit('bid:rejected', result);
    });

    socket.on('auction:start', (_payload, ack) => {
      const room = requireAdmin(socket, ack);
      if (!room) return;
      respond(ack, startAuction(io, room));
    });

    socket.on('auction:next', (_payload, ack) => {
      const room = requireAdmin(socket, ack);
      if (!room) return;
      respond(ack, advance(io, room));
    });

    /**
     * Unpause. `dropUserIds` is the escape hatch for the hard-pause policy:
     * without it, one person closing their laptop deadlocks the room forever.
     */
    socket.on('auction:resume', async ({ dropUserIds = [] } = {}, ack) => {
      const room = requireAdmin(socket, ack);
      if (!room) return;

      for (const id of dropUserIds) {
        const p = room.participants.get(id);
        if (p && !p.connected && p.status === 'ACTIVE') {
          p.status = 'ABANDONED';
          await setParticipantStatus(room.roomCode, id, 'ABANDONED');
        }
      }
      respond(ack, resume(io, room));
    });

    socket.on('room:kick', async ({ targetUserId } = {}, ack) => {
      const room = requireAdmin(socket, ack);
      if (!room) return;
      if (targetUserId === socket.data.userId) {
        return respond(ack, { ok: false, code: 'CANNOT_KICK_SELF' });
      }

      const target = room.participants.get(targetUserId);
      if (!target || target.status === 'KICKED') {
        return respond(ack, { ok: false, code: 'NO_SUCH_PARTICIPANT' });
      }

      // If they hold the standing bid, withdraw it so the lot is not sold to
      // someone who is no longer in the room.
      if (room.lot && room.lot.highestBidderId === targetUserId) {
        room.lot.currentBid = null;
        room.lot.highestBidderId = null;
      }

      // Marked, not deleted: the seat is freed and they cannot come back, but
      // the record survives so anything they already won still reconciles in
      // the results. Deleting them left the live room and the durable document
      // disagreeing about who had ever been present.
      target.status = 'KICKED';
      target.connected = false;
      const kickedSocketId = target.socketId;
      target.socketId = null;
      const version = room.bump();

      await setParticipantStatus(room.roomCode, targetUserId, 'KICKED');

      if (kickedSocketId) {
        const kickedSocket = io.sockets.sockets.get(kickedSocketId);
        io.to(kickedSocketId).emit('room:kicked');
        if (kickedSocket) {
          kickedSocket.leave(room.roomCode);
          // Detach the socket entirely, so nothing it sends afterwards still
          // resolves to this room.
          kickedSocket.data.roomCode = null;
          kickedSocket.data.userId = null;
        }
      }
      io.to(room.roomCode).emit('room:participants', {
        version,
        participants: participantsPayload(room),
      });

      // Removing the person everyone was waiting for can unblock a pause.
      if (room.phase === 'LIVE' && room.lot?.status === 'PAUSED' && room.allConnected()) {
        resume(io, room);
      }
      respond(ack, { ok: true });
    });

    socket.on('disconnect', () => {
      const room = currentRoom(socket);
      if (!room) return;

      const participant = room.participants.get(socket.data.userId);
      if (!participant || participant.socketId !== socket.id) return;

      participant.connected = false;
      participant.socketId = null;
      const version = room.bump();

      io.to(room.roomCode).emit('room:participants', {
        version,
        participants: participantsPayload(room),
      });

      // The hard-pause policy: any participant dropping freezes the auction.
      if (room.phase === 'LIVE' && room.lot?.status === 'RUNNING') {
        pause(io, room, 'PARTICIPANT_DISCONNECTED');
      }

      // Reclaim the room once it is empty — the old roomState leaked every
      // slice of every room it had ever seen, permanently. But do it on a
      // grace timer: under the hard-pause policy an all-disconnect is routine
      // (everyone refreshing at once), and evicting immediately threw away the
      // live auction and reset the room to its lobby.
      if (!room.hasLiveConnection()) {
        registry.scheduleEviction(room.roomCode);
      }
    });
  });
}

function currentRoom(socket) {
  const { roomCode, userId } = socket.data;
  if (!roomCode || !userId) return null;
  return registry.get(roomCode) ?? null;
}

function requireAdmin(socket, ack) {
  const room = currentRoom(socket);
  if (!room) {
    respond(ack, { ok: false, code: 'NOT_IN_ROOM' });
    return null;
  }
  if (!room.isAdmin(socket.data.userId)) {
    respond(ack, { ok: false, code: 'NOT_ADMIN' });
    socket.emit('room:error', { code: 'NOT_ADMIN', message: 'Only the room creator can do that.' });
    return null;
  }
  return room;
}

function respond(ack, payload) {
  if (typeof ack === 'function') ack(payload);
}

/**
 * Add a participant to the durable room document if they are new, or restore
 * them to ACTIVE if they are a returning ABANDONED player.
 *
 * Both halves matter: without the first the document under-counts, without the
 * second a player the admin dropped stays marked dropped forever after they
 * come back.
 */
async function persistParticipant(room, participant) {
  const added = await RoomDoc.updateOne(
    { roomCode: room.roomCode, 'participants.userId': { $ne: participant.userId } },
    {
      $push: {
        participants: {
          userId: participant.userId,
          name: participant.name,
          purse: participant.purse,
          team: [],
          status: 'ACTIVE',
        },
      },
    }
  );
  if (added.modifiedCount === 0) {
    await setParticipantStatus(room.roomCode, participant.userId, participant.status);
  }
}

/** Mirror a participant's lifecycle status into the durable document. */
async function setParticipantStatus(roomCode, userId, status) {
  try {
    await RoomDoc.updateOne(
      { roomCode, 'participants.userId': userId },
      { $set: { 'participants.$.status': status } }
    );
  } catch (err) {
    console.error('[socket] could not persist participant status:', err.message);
  }
}

export { buildResults };
