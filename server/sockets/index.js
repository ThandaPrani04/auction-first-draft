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

        const existing = userId && room.participants.get(userId);
        if (!existing && room.participants.size >= room.maxParticipants) {
          return respond(ack, { ok: false, code: 'ROOM_FULL' });
        }
        if (!existing && room.phase === 'LIVE') {
          return respond(ack, { ok: false, code: 'AUCTION_IN_PROGRESS' });
        }

        const id = userId || randomUUID();
        const participant = room.addParticipant(id, userName || 'Anonymous');
        participant.socketId = socket.id;

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
      respond(ack, { ok: true, state: room.snapshot(socket.data.userId) });
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
    socket.on('auction:resume', ({ dropUserIds = [] } = {}, ack) => {
      const room = requireAdmin(socket, ack);
      if (!room) return;

      for (const id of dropUserIds) {
        const p = room.participants.get(id);
        if (p && !p.connected) p.abandoned = true;
      }
      respond(ack, resume(io, room));
    });

    socket.on('room:kick', ({ targetUserId } = {}, ack) => {
      const room = requireAdmin(socket, ack);
      if (!room) return;
      if (targetUserId === socket.data.userId) {
        return respond(ack, { ok: false, code: 'CANNOT_KICK_SELF' });
      }

      const target = room.participants.get(targetUserId);
      if (!target) return respond(ack, { ok: false, code: 'NO_SUCH_PARTICIPANT' });

      // If they hold the standing bid, withdraw it so the lot is not sold to
      // someone who is no longer in the room.
      if (room.lot && room.lot.highestBidderId === targetUserId) {
        room.lot.currentBid = null;
        room.lot.highestBidderId = null;
      }

      room.participants.delete(targetUserId);
      const version = room.bump();

      if (target.socketId) {
        io.to(target.socketId).emit('room:kicked');
        io.sockets.sockets.get(target.socketId)?.leave(room.roomCode);
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
      // slice of every room it had ever seen, permanently.
      if (![...room.participants.values()].some((p) => p.connected)) {
        registry.remove(room.roomCode);
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

/** Add a participant to the durable room document if they are new. */
async function persistParticipant(room, participant) {
  const res = await RoomDoc.updateOne(
    { roomCode: room.roomCode, 'participants.userId': { $ne: participant.userId } },
    {
      $push: {
        participants: {
          userId: participant.userId,
          name: participant.name,
          purse: participant.purse,
          team: [],
        },
      },
    }
  );
  return res;
}

export { buildResults };
