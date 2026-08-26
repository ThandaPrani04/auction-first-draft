import Cookies from 'js-cookie';

/**
 * Who this browser is, across refreshes.
 *
 * The old code identified people by socket.id, which changes on every
 * reconnect — so a refresh handed you a fresh 120 Cr purse, lost your team,
 * and silently stripped the room creator of admin rights. A stable userId in
 * a cookie is what makes reconnect work at all.
 *
 * The server assigns the id on first join; we just remember what it gave us.
 */
const USER_ID = 'auctionUserId';
const USER_NAME = 'userName';
const ROOM_CODE = 'roomCode';

const opts = { expires: 1, sameSite: 'Lax' };

export const getUserId = () => Cookies.get(USER_ID) || null;
export const setUserId = (id) => Cookies.set(USER_ID, id, opts);

export const getUserName = () => Cookies.get(USER_NAME) || null;
export const setUserName = (name) => Cookies.set(USER_NAME, name, opts);

export const getRoomCode = () => Cookies.get(ROOM_CODE) || null;
export const setRoomCode = (code) => Cookies.set(ROOM_CODE, code, opts);

/**
 * Clear room-scoped identity but keep the display name — used when leaving or
 * being kicked, so the next room does not inherit a stale userId.
 */
export function clearRoom() {
  Cookies.remove(ROOM_CODE);
  Cookies.remove(USER_ID);
}
