/**
 * Participant-lifecycle consistency. Run with `npm run consistency-test`.
 *
 * The live registry, the durable room document, and what each client is told
 * must never disagree about who is in a room. These checks pin down the places
 * they previously could.
 */
import { io as connect } from 'socket.io-client';

const SERVER = process.env.SERVER_URL || 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

const open = () =>
  new Promise((resolve) => {
    const s = connect(SERVER, { transports: ['websocket'], forceNew: true });
    s.on('connect', () => resolve(s));
  });

const join = (s, roomCode, userName, userId) =>
  new Promise((resolve) =>
    s.emit('room:join', { roomCode, userName, userId }, resolve)
  );

const emitAck = (s, event, payload = {}) =>
  new Promise((resolve) => s.emit(event, payload, resolve));

const sync = (s) => new Promise((resolve) => s.emit('room:sync', {}, resolve));

const rest = (path) => fetch(`${SERVER}${path}`).then((r) => r.json());

/** Everyone the room still considers a participant. */
const activeOf = (state) => state.participants.filter((p) => p.status === 'ACTIVE');

async function main() {
  console.log('\n  Participant lifecycle consistency\n');

  const { roomCode, userId: hostId } = await fetch(`${SERVER}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostName: 'Host' }),
  }).then((r) => r.json());
  console.log(`  room ${roomCode}\n`);

  const host = await open();
  await join(host, roomCode, 'Host', hostId);
  const guest = await open();
  const guestJoin = await join(guest, roomCode, 'Guest');
  const guestId = guestJoin.userId;

  let state = (await sync(host)).state;
  check('two participants after two joins', activeOf(state).length === 2,
    `${activeOf(state).length}`);

  let api = await rest(`/api/rooms/${roomCode}`);
  check('REST participantCount agrees with the live room', api.participantCount === 2,
    `REST says ${api.participantCount}`);

  // --- Kick ---------------------------------------------------------------
  const kicked = new Promise((resolve) => guest.on('room:kicked', resolve));
  await emitAck(host, 'room:kick', { targetUserId: guestId });
  await kicked;
  await sleep(150);

  state = (await sync(host)).state;
  check('kicked user leaves the active roster', activeOf(state).length === 1,
    `${activeOf(state).length} active`);

  api = await rest(`/api/rooms/${roomCode}`);
  check('REST count drops after a kick', api.participantCount === 1,
    `REST says ${api.participantCount}`);

  // --- The reported bug: kicked user comes back ---------------------------
  // A kick that a page refresh undoes is not a kick. The old client kept the
  // userId cookie, so refreshing re-joined the same person.
  const rejoinSame = await join(guest, roomCode, 'Guest', guestId);
  check('a kicked user cannot rejoin with the same identity',
    rejoinSame?.ok === false && rejoinSame.code === 'KICKED',
    rejoinSame?.ok ? 'was let back in' : rejoinSame.code);

  await sleep(150);
  state = (await sync(host)).state;
  check('roster does not grow after a kicked user retries', activeOf(state).length === 1,
    `${activeOf(state).length} active`);

  // Even with a brand new identity and the same display name.
  const ghost = await open();
  const rejoinFresh = await join(ghost, roomCode, 'Guest');
  await sleep(150);
  state = (await sync(host)).state;
  const names = activeOf(state).map((p) => p.name);
  check('a fresh identity is a genuinely new participant, listed once',
    rejoinFresh?.ok !== true || activeOf(state).length === 2,
    names.join(', '));
  check('no duplicate names in the active roster',
    new Set(names).size === names.length, names.join(', '));

  // --- The durable document must agree ------------------------------------
  api = await rest(`/api/rooms/${roomCode}`);
  check('REST count matches the live active roster',
    api.participantCount === activeOf(state).length,
    `REST ${api.participantCount} vs live ${activeOf(state).length}`);

  const results = await rest(`/api/rooms/${roomCode}/results`);
  const teamIds = results.teams.map((t) => t.userId);
  check('a kicked user is not listed as a team in the results',
    !teamIds.includes(guestId), teamIds.length ? teamIds.join(', ') : '(no teams)');

  // --- A room must survive everyone refreshing at once --------------------
  // Hard pause means a brief all-disconnect is expected, not the end of the
  // auction. Evicting the room there would silently reset it to the lobby.
  await emitAck(host, 'auction:start');
  await sleep(300);
  const before = (await sync(host)).state;
  const lotBefore = before.lotIndex;

  host.close();
  ghost.close();
  await sleep(400);

  const host2 = await open();
  const back = await join(host2, roomCode, 'Host', hostId);
  check('room survives every participant disconnecting briefly',
    back?.ok === true && back.state.phase === 'LIVE' && back.state.lotIndex === lotBefore,
    `phase ${back?.state?.phase}, lot ${back?.state?.lotIndex} (was ${lotBefore})`);
  check('host is still admin after the room emptied and refilled',
    back?.state?.isAdmin === true);

  host2.close();
  guest.close();

  console.log('');
  if (failures.length) {
    console.error(`  ${failures.length} CHECK(S) FAILED\n`);
    process.exit(1);
  }
  console.log('  All checks passed.\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n  consistency test error:', err.message, '\n');
  process.exit(1);
});
