/**
 * Concurrency test for the bid path. Run with `npm run race-test` against a
 * running server (`npm start` in another terminal).
 *
 * Opens N clients, joins them to one room, and fires `bid:place` from all N
 * inside the same event-loop tick, repeatedly. This is the scenario the old
 * code got wrong: it computed `newBid = clientPayload.currentBid + 0.2`, so
 * two clients reading the same price both produced the same next price and one
 * bid was silently swallowed.
 *
 * What must hold no matter how the bids interleave:
 *   1. Accepted bid amounts strictly increase.
 *   2. Each accepted amount is exactly the previous plus the band increment.
 *   3. No two accepted bids share an amount (no lost update).
 *   4. The standing highest bidder is never allowed to outbid themselves.
 *   5. No purse goes negative.
 *   6. The server's own snapshot agrees with the last broadcast.
 */
import { io as connect } from 'socket.io-client';
import { nextBid, formatCr } from '../shared/bidRules.js';

const SERVER = process.env.SERVER_URL || 'http://localhost:3000';
const CLIENTS = Number(process.env.CLIENTS) || 8;
const ROUNDS = Number(process.env.ROUNDS) || 20;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connectClient() {
  return connect(SERVER, { transports: ['websocket'], forceNew: true });
}

function joinRoom(socket, roomCode, userName, userId) {
  return new Promise((resolve, reject) => {
    socket.emit('room:join', { roomCode, userName, userId }, (res) => {
      res?.ok ? resolve(res) : reject(new Error(res?.code || 'join failed'));
    });
  });
}

async function main() {
  console.log(`\n  Race test: ${CLIENTS} clients x ${ROUNDS} simultaneous rounds\n`);

  // 1. Create a room over REST.
  const created = await fetch(`${SERVER}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostName: 'Bidder-0' }),
  }).then((r) => r.json());

  if (!created.roomCode) throw new Error(`create room failed: ${JSON.stringify(created)}`);
  const { roomCode, userId: adminId } = created;
  console.log(`  room ${roomCode}, ${created.totalPlayers} players in the script`);

  // 2. Connect and join everyone. Client 0 is the admin.
  const sockets = [];
  const ids = [];
  for (let i = 0; i < CLIENTS; i++) {
    const s = connectClient();
    await new Promise((r) => s.on('connect', r));
    const res = await joinRoom(s, roomCode, `Bidder-${i}`, i === 0 ? adminId : undefined);
    sockets.push(s);
    ids.push(res.userId);
  }
  console.log(`  ${sockets.length} clients joined`);

  // 3. Record every broadcast and rejection.
  const accepted = [];
  const rejections = [];
  let basePrice = null;
  let lotIndex = null;

  sockets[0].on('auction:lot', (e) => {
    basePrice = e.player.basePrice;
    lotIndex = e.lotIndex;
  });
  // One observer records the canonical broadcast stream.
  sockets[0].on('bid:update', (e) => accepted.push(e));
  sockets.forEach((s, i) => {
    s.on('bid:rejected', (e) => rejections.push({ client: i, ...e }));
  });

  // 4. Start the auction and wait for lot 0.
  await new Promise((resolve, reject) => {
    sockets[0].emit('auction:start', {}, (res) =>
      res?.ok ? resolve() : reject(new Error(res?.code))
    );
  });
  await sleep(300);
  if (basePrice == null) throw new Error('no auction:lot received');
  console.log(`  lot ${lotIndex} open, base price ${formatCr(basePrice)}\n`);

  // 5. THE RACE: every client bids in the same tick, no staggering.
  for (let round = 0; round < ROUNDS; round++) {
    for (const s of sockets) s.emit('bid:place', { lotIndex });
    await sleep(60); // let the broadcasts land before the next volley
  }
  await sleep(400);

  // 6. Targeted invariant: the same client bids TWICE in one tick. Round-robin
  // volleys never trigger this, because the standing highest bidder is always
  // outbid by someone else before their next turn comes around. The second bid
  // must be rejected — this is the rule the disabled button only *implies*.
  const before = rejections.length;
  sockets[3].emit('bid:place', { lotIndex });
  sockets[3].emit('bid:place', { lotIndex });
  await sleep(300);
  const selfOutbidBlocked = rejections
    .slice(before)
    .some((r) => r.client === 3 && r.code === 'ALREADY_HIGHEST');

  // 7. Targeted invariant: a bid for a lot that is no longer up must not land
  // on the current one.
  const beforeStale = rejections.length;
  sockets[4].emit('bid:place', { lotIndex: lotIndex + 99 });
  await sleep(200);
  const staleBlocked = rejections
    .slice(beforeStale)
    .some((r) => r.client === 4 && r.code === 'STALE');

  // 8. Pull the server's own view to cross-check the broadcast stream.
  const snapshot = await new Promise((resolve) =>
    sockets[0].emit('room:sync', {}, (res) => resolve(res.state))
  );

  sockets.forEach((s) => s.close());

  // ---- Assertions ----
  const failures = [];
  const check = (label, ok, detail = '') => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(label);
  };

  console.log(`  ${accepted.length} bids accepted, ${rejections.length} rejected\n`);

  // 1 & 3: strictly increasing implies no duplicates.
  let strictlyIncreasing = true;
  for (let i = 1; i < accepted.length; i++) {
    if (accepted[i].amount <= accepted[i - 1].amount) strictlyIncreasing = false;
  }
  check('bid amounts strictly increase (no lost update)', strictlyIncreasing);

  const uniqueAmounts = new Set(accepted.map((a) => a.amount)).size === accepted.length;
  check('no two accepted bids share an amount', uniqueAmounts);

  // 2: every step matches the band rules exactly.
  let incrementsExact = accepted.length > 0 && accepted[0].amount === basePrice;
  for (let i = 1; i < accepted.length; i++) {
    if (accepted[i].amount !== nextBid(basePrice, accepted[i - 1].amount)) incrementsExact = false;
  }
  check('every increment matches the band rules', incrementsExact,
    accepted.length ? `${formatCr(accepted[0].amount)} -> ${formatCr(accepted.at(-1).amount)}` : '');

  // 4: nobody outbids themselves.
  let noSelfOutbid = true;
  for (let i = 1; i < accepted.length; i++) {
    if (accepted[i].bidderId === accepted[i - 1].bidderId) noSelfOutbid = false;
  }
  check('no bidder ever outbids themselves', noSelfOutbid);

  check('a client bidding twice in one tick is rejected (ALREADY_HIGHEST)', selfOutbidBlocked);
  check('a bid for a stale lotIndex is rejected (STALE)', staleBlocked);

  // Rejections must all be for a legitimate, expected reason.
  const badCodes = [...new Set(rejections.map((r) => r.code))]
    .filter((c) => !['ALREADY_HIGHEST', 'INSUFFICIENT_PURSE', 'STALE', 'LOT_CLOSED'].includes(c));
  check('all rejections have an expected reason', badCodes.length === 0, badCodes.join(', '));

  // 5: purses intact.
  const negative = snapshot.participants.filter((p) => p.purse < 0);
  check('no purse went negative', negative.length === 0);

  // 6: the server agrees with what it broadcast.
  const last = accepted.at(-1);
  const agrees = !last || snapshot.lot?.currentBid === last.amount;
  check('server snapshot matches the final broadcast', agrees,
    last ? `${formatCr(snapshot.lot?.currentBid)} vs ${formatCr(last.amount)}` : '');

  const selfOutbidRejections = rejections.filter((r) => r.code === 'ALREADY_HIGHEST').length;
  console.log(`\n  (${selfOutbidRejections} self-outbid attempts correctly rejected)`);

  if (failures.length) {
    console.error(`\n  ${failures.length} CHECK(S) FAILED\n`);
    process.exit(1);
  }
  console.log(`\n  All checks passed.\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error('\n  race test error:', err.message, '\n');
  process.exit(1);
});
