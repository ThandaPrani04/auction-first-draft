/**
 * Runs an auction to completion and checks the ending.
 *
 * `auction-ended` could never fire in the old server: it tested
 * `currentIdx === player.totalPlayers - 1` against a field the client did not
 * send, so it compared with NaN forever and the client faked the end locally.
 *
 * Start the server with a short lot duration so 40 lots take seconds:
 *   LOT_DURATION_MS=400 npm start
 */
import { io as connect } from 'socket.io-client';
import { formatCr } from '../shared/bidRules.js';

const SERVER = process.env.SERVER_URL || 'http://localhost:3000';

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

const emitAck = (s, event, payload = {}) =>
  new Promise((resolve) => s.emit(event, payload, resolve));

async function main() {
  console.log('\n  Full auction to completion\n');

  const created = await fetch(`${SERVER}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostName: 'Host' }),
  }).then((r) => r.json());
  const { roomCode, userId: hostId, totalPlayers } = created;

  const host = await open();
  const guest = await open();
  const hostJoin = await new Promise((res, rej) =>
    host.emit('room:join', { roomCode, userName: 'Host', userId: hostId }, (r) =>
      r?.ok ? res(r) : rej(new Error(r?.code))
    )
  );
  await new Promise((res, rej) =>
    guest.emit('room:join', { roomCode, userName: 'Guest' }, (r) =>
      r?.ok ? res(r) : rej(new Error(r?.code))
    )
  );

  console.log(`  room ${roomCode}, ${totalPlayers} players\n`);

  let sold = 0;
  let unsold = 0;
  let ended = null;
  const seenLots = new Set();

  // Bid on roughly half the lots, alternating who wins, so the results screen
  // has something in every column.
  host.on('auction:lot', (e) => {
    seenLots.add(e.lotIndex);
    if (e.lotIndex % 2 === 0) {
      const bidder = e.lotIndex % 4 === 0 ? host : guest;
      bidder.emit('bid:place', { lotIndex: e.lotIndex });
    }
  });

  host.on('auction:settled', (e) => {
    if (e.status === 'SOLD') sold++;
    else unsold++;
    // The admin calls the next player; that is the room creator's control.
    setTimeout(() => host.emit('auction:next', {}), 20);
  });

  const endedPromise = new Promise((resolve) => {
    host.on('auction:ended', (e) => {
      ended = e;
      resolve(e);
    });
  });

  await emitAck(host, 'auction:start');

  const timeout = new Promise((_, rej) =>
    setTimeout(() => rej(new Error('auction did not end within 90s')), 90_000)
  );
  await Promise.race([endedPromise, timeout]);

  check('auction:ended fired', !!ended);
  check('every lot was opened exactly once', seenLots.size === totalPlayers,
    `${seenLots.size}/${totalPlayers}`);
  check('every lot settled', sold + unsold === totalPlayers, `${sold} sold, ${unsold} unsold`);

  const { teams = [], unsold: unsoldList = [] } = ended.results ?? {};
  check('results include every participant', teams.length === 2);
  check('sold + unsold accounts for all players',
    teams.reduce((n, t) => n + t.players.length, 0) + unsoldList.length === totalPlayers);

  const spendOk = teams.every((t) => t.spent === 12000 - t.purse && t.purse >= 0);
  check('spend reconciles with purse for every manager', spendOk,
    teams.map((t) => `${t.name}: ${formatCr(t.spent)}`).join(', '));

  // The REST results endpoint must agree with the broadcast.
  const rest = await fetch(`${SERVER}/api/rooms/${roomCode}/results`).then((r) => r.json());
  const restSold = rest.teams.reduce((n, t) => n + t.players.length, 0);
  check('REST results match the broadcast', restSold === sold && rest.phase === 'ENDED',
    `${restSold} sold via REST`);

  host.close();
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
  console.error('\n  full auction test error:', err.message, '\n');
  process.exit(1);
});
