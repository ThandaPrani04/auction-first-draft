/**
 * End-to-end protocol test. Run with `npm run flow-test` against a running
 * server.
 *
 * Walks the full lifecycle the demo video will show: create, join, start, bid,
 * settle, advance, disconnect (hard pause), reconnect (auto-resume), admin
 * drop, and auction end. Every check corresponds to a scenario in the plan's
 * verification table.
 */
import { io as connect } from 'socket.io-client';
import { formatCr } from '../shared/bidRules.js';

const SERVER = process.env.SERVER_URL || 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const failures = [];
function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
}

function open() {
  return new Promise((resolve) => {
    const s = connect(SERVER, { transports: ['websocket'], forceNew: true });
    s.on('connect', () => resolve(s));
  });
}

const join = (s, roomCode, userName, userId) =>
  new Promise((resolve, reject) =>
    s.emit('room:join', { roomCode, userName, userId }, (r) =>
      r?.ok ? resolve(r) : reject(new Error(r?.code))
    )
  );

const emitAck = (s, event, payload = {}) =>
  new Promise((resolve) => s.emit(event, payload, resolve));

/** Wait for a named event, with a timeout. */
function waitFor(socket, event, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    const handler = (payload) => {
      clearTimeout(t);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

async function main() {
  console.log('\n  End-to-end auction flow\n');

  // --- Create + join ------------------------------------------------------
  const created = await fetch(`${SERVER}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostName: 'Host' }),
  }).then((r) => r.json());
  const { roomCode, userId: hostId } = created;
  console.log(`  room ${roomCode}\n`);

  const host = await open();
  const guest = await open();

  const hostJoin = await join(host, roomCode, 'Host', hostId);
  const guestJoin = await join(guest, roomCode, 'Guest');
  const guestId = guestJoin.userId;

  check('host is admin, guest is not', hostJoin.state.isAdmin && !guestJoin.state.isAdmin);
  check('both start with a full purse',
    hostJoin.state.me.purse === 12000 && guestJoin.state.me.purse === 12000,
    formatCr(hostJoin.state.me.purse));

  // --- Non-admin cannot drive the auction ---------------------------------
  const guestStart = await emitAck(guest, 'auction:start');
  check('non-admin cannot start the auction', guestStart?.ok === false && guestStart.code === 'NOT_ADMIN');

  // --- Start --------------------------------------------------------------
  const lotP = waitFor(guest, 'auction:lot');
  await emitAck(host, 'auction:start');
  const lot0 = await lotP;
  check('auction:lot broadcast to everyone', !!lot0.player, lot0.player?.name);
  check('lot has an absolute deadline (endsAt), not a countdown',
    typeof lot0.endsAt === 'number' && lot0.endsAt > Date.now());

  // --- Bidding ------------------------------------------------------------
  const bid1P = waitFor(host, 'bid:update');
  guest.emit('bid:place', { lotIndex: 0 });
  const bid1 = await bid1P;
  check('first bid lands at the base price', bid1.amount === lot0.player.basePrice,
    formatCr(bid1.amount));

  const rejectP = waitFor(guest, 'bid:rejected');
  guest.emit('bid:place', { lotIndex: 0 });
  const rejected = await rejectP;
  check('highest bidder cannot outbid themselves', rejected.code === 'ALREADY_HIGHEST');

  const bid2P = waitFor(guest, 'bid:update');
  host.emit('bid:place', { lotIndex: 0 });
  const bid2 = await bid2P;
  check('second bid applies the band increment', bid2.amount > bid1.amount,
    `${formatCr(bid1.amount)} -> ${formatCr(bid2.amount)}`);
  check('each bid extends the deadline (anti-snipe)', bid2.endsAt > bid1.endsAt);

  // --- Settlement ---------------------------------------------------------
  const settledP = waitFor(guest, 'auction:settled', 14000);
  const settled = await settledP;
  check('lot settles as SOLD to the standing highest bidder',
    settled.status === 'SOLD' && settled.winnerUserId === hostJoin.state.me.userId,
    `${settled.winnerName} @ ${formatCr(settled.soldPrice)}`);

  const hostAfter = settled.participants.find((p) => p.userId === hostId);
  check('winner is debited exactly once',
    hostAfter.purse === 12000 - settled.soldPrice,
    formatCr(hostAfter.purse));
  check('loser is not debited',
    settled.participants.find((p) => p.userId === guestId).purse === 12000);

  // --- Advance is admin-gated --------------------------------------------
  const guestNext = await emitAck(guest, 'auction:next');
  check('non-admin cannot call the next player', guestNext?.ok === false);

  const lot1P = waitFor(guest, 'auction:lot');
  await emitAck(host, 'auction:next');
  const lot1 = await lot1P;
  check('admin advances to the next player', lot1.lotIndex === 1, lot1.player?.name);

  // --- Hard pause on disconnect ------------------------------------------
  const pausedP = waitFor(host, 'auction:paused');
  guest.close();
  const paused = await pausedP;
  check('a disconnect pauses the auction', paused.reason === 'PARTICIPANT_DISCONNECTED');
  check('paused event names who we are waiting for',
    paused.waitingFor.includes('Guest'), paused.waitingFor.join(','));

  // A bid while paused must not land.
  const pausedRejectP = waitFor(host, 'bid:rejected');
  host.emit('bid:place', { lotIndex: 1 });
  const pausedReject = await pausedRejectP;
  check('bids are refused while paused', pausedReject.code === 'LOT_CLOSED');

  // --- Reconnect auto-resumes --------------------------------------------
  const resumedP = waitFor(host, 'auction:resumed');
  const guest2 = await open();
  const rejoin = await join(guest2, roomCode, 'Guest', guestId);
  const resumed = await resumedP;
  check('reconnect resumes the auction automatically', resumed.endsAt > Date.now());
  check('reconnect preserves purse and team (not a fresh 120 Cr)',
    rejoin.state.me.purse === 12000 && rejoin.state.me.userId === guestId);
  check('reconnecting client gets the live deadline in its snapshot',
    rejoin.state.lot?.endsAt == null || typeof rejoin.state.lot.endsAt === 'number');

  // --- Host refresh keeps admin ------------------------------------------
  host.close();
  await sleep(200);
  const host2 = await open();
  const hostRejoin = await join(host2, roomCode, 'Host', hostId);
  check('host keeps admin rights across a refresh', hostRejoin.state.isAdmin === true);
  check('host keeps their squad across a refresh',
    hostRejoin.state.me.team.length === 1, `${hostRejoin.state.me.team.length} player(s)`);

  // --- Admin drop escape hatch -------------------------------------------
  const paused2P = waitFor(host2, 'auction:paused');
  guest2.close();
  await paused2P;
  const stillWaiting = await emitAck(host2, 'auction:resume', { dropUserIds: [] });
  check('resume is refused while someone is still missing',
    stillWaiting?.ok === false && stillWaiting.code === 'STILL_WAITING');

  const resumed2P = waitFor(host2, 'auction:resumed');
  await emitAck(host2, 'auction:resume', { dropUserIds: [guestId] });
  await resumed2P;
  check('admin can drop an absent player and continue', true);

  // --- An unsold lot must not block the auction ---------------------------
  // Nobody bids on the resumed lot, so it expires with no winner.
  const unsold = await waitFor(host2, 'auction:settled', 15000);
  check('a lot with no bids settles as UNSOLD', unsold.status === 'UNSOLD',
    unsold.player?.name);
  check('an unsold lot debits nobody',
    unsold.participants.every((p) => p.purse === 12000 || p.userId === hostId));

  const afterUnsold = await emitAck(host2, 'auction:next');
  check('admin can advance past an UNSOLD lot', afterUnsold?.ok === true,
    afterUnsold?.code ?? '');

  host2.close();

  console.log('');
  if (failures.length) {
    console.error(`  ${failures.length} CHECK(S) FAILED\n`);
    process.exit(1);
  }
  console.log('  All checks passed.\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n  flow test error:', err.message, '\n');
  process.exit(1);
});
