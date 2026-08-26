import { io } from 'socket.io-client';
import { SERVER_URL } from './api.js';

/**
 * One socket for the whole app, created lazily.
 *
 * The old factory baked the username into `auth` at construction time and
 * pointed at a hardcoded localhost URL while every HTTP call went to Render.
 * Identity is now sent in the room:join payload instead, so it can't go stale
 * between construction and connection.
 */
let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(SERVER_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 500,
    });
  }
  return socket;
}

export function closeSocket() {
  if (socket) {
    socket.close();
    socket = null;
  }
}
