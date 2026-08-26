# Cricket League Auction

A real-time multiplayer IPL-style player auction. Several people join a room,
one of them runs the auction, and everyone bids live on a shuffled list of
players under a shared countdown.

The interesting part is not the CRUD — it is that N browsers must agree on a
single price, a single clock, and a single winner, while people click the same
button at the same moment and drop off the WiFi mid-lot.

## Demo

<!-- Record two browser windows side by side: create + join, start, a contested
     bid, a SOLD, a refresh mid-lot showing the pause/resume, then the results
     screen. Drop the file in docs/demo.mp4 and it renders inline on GitHub. -->

_Demo video: `docs/demo.mp4`_

## Run it locally

Needs Node 18+ and a MongoDB running on `localhost:27017`.

```bash
# 1. Server
cd server
cp .env.example .env         # defaults point at local MongoDB
npm install
npm run seed                 # loads 40 players across 5 sets
npm start                    # http://localhost:3000

# 2. Client (second terminal)
cd client
cp .env.example .env
npm install
npm run dev                  # http://localhost:5173
```

Open two browser windows — one normal, one incognito, so they get separate
cookies and count as different people. Create a room in the first, join with
that code in the second.

```bash
# Verify the concurrency and protocol guarantees (server must be running)
cd server
npm run race-test            # 8 clients bidding in the same event-loop tick
npm run flow-test            # 24 end-to-end lifecycle checks

# A full 40-lot auction. Needs a server started with short lots:
#   LOT_DURATION_MS=400 npm start
npm run full-test
```

## Architecture

Authority flows one way. The server decides; clients send intents and render
what they are told.

```
┌─────────────────────────────────────────────────────────────┐
│  MongoDB          player catalog · room doc · settled lots   │  durable, slow
│                   written ONCE per settlement                │
└─────────────────────────────▲───────────────────────────────┘
                              │ one write per player
┌─────────────────────────────┴───────────────────────────────┐
│  RoomRegistry     Map<roomCode, Room>                        │  hot, in-memory
│  (in process)     currentBid · highestBidder · endsAt        │  many writes/sec
│                   · version · participants · timers          │
└─────────────────────────────▲───────────────────────────────┘
                              │ mutated only by synchronous handlers
┌─────────────────────────────┴───────────────────────────────┐
│  Socket.IO        server broadcasts state, clients send      │  transport
│                   intents (never amounts, never identities)  │
└──────────────────────────────────────────────────────────────┘
```

**Why the live bid is not in MongoDB.** `currentBid` changes many times per
second while a lot is open, but an intermediate bid is not a fact worth
keeping — it is meaningful only until the hammer falls. Persisting every bid
for 8 bidders × ~10 bids × 100 players is ~8,000 writes; persisting only
outcomes is 100. The durable truth is who won and for how much, the same way a
shopping cart is not an order.

That is also a **correctness** decision, not just a performance one — see
below.

## Concurrency: what happens when everyone clicks BID at once

Four layers, in the order they matter.

**1. Node's event loop is the mutex.** Socket.IO dispatches messages to
handlers that run on a single thread, so two `bid:place` messages arriving "at
the same time" are serialised into the event-loop queue: handler A runs to
completion before handler B starts. A read-modify-write on plain in-memory
state is therefore atomic by construction, with no lock.

The discipline that makes this true: **the bid handler contains zero `await`.**
The moment you `await room.save()` between reading `currentBid` and writing it,
you yield the event loop, B interleaves, both read the same price, and one bid
is silently lost. Keeping the database off the bid path is what keeps the
critical section atomic. See [`server/services/bidService.js`](server/services/bidService.js).

**2. The client sends an intent, never an amount.** `bid:place` carries no
price. The server computes `nextBid` from its own state and takes the bidder
from `socket.data.userId`, bound at join. This removes stale-price bids,
tampered payloads, and any disagreement about the increment in one move.

**3. A monotonic `version` orders every broadcast.** Clients ignore anything at
or below the version they hold, and a gap means they missed an event, so they
pull a fresh snapshot. Self-healing rather than silently wrong.

**4. The race resolves correctly on its own.** A and B click simultaneously.
The server processes A (price → ₹1.20 Cr, highest = A), then B, who bids
₹1.40 Cr. That is correct auction behaviour, not a bug — B wanted to outbid and
the price moved. Nothing is lost or double-counted.

The one rule that must be enforced is that the standing highest bidder cannot
outbid themselves:

```js
if (lot.highestBidderId === socket.data.userId) return reject('ALREADY_HIGHEST');
```

Disabling the BID button is UX. **This check is the invariant** — client-side
validation is a hint, not a guarantee.

Money is stored as **integer lakhs**, never floats (1 Cr = 100 L). Increments
are banded: +5 L under ₹1 Cr, +10 L under ₹2 Cr, +20 L under ₹9.95 Cr, +50 L
above.

## The clock

The server holds an **absolute deadline** (`endsAt = Date.now() + 10_000`) and
broadcasts that. Clients render `endsAt - Date.now()` and emit nothing.

Everything falls out of that one choice:

- every client shows the same number, because they compute the same difference
- a reconnecting client gets the right remaining time instantly, no negotiation
- only the server's `setTimeout` can settle a lot, and settling is idempotent
- each accepted bid pushes `endsAt` back, which is the anti-snipe rule

## Reconnects and the pause policy

Participants are keyed by a cookie-persisted `userId`, not `socket.id`. A
refresh rebinds the same participant to a new socket, so purse, squad, and
admin rights survive.

Reconnect needs exactly one message — the `room:state` snapshot.

On top of that: **any participant dropping pauses the auction**, and it resumes
only when everyone is back. Freezing an absolute deadline means storing
`remainingMs`; the resume restarts the lot at its full duration, so nobody wins
a player because an opponent's connection died with half a second left.

A refresh self-heals in about a second — pause, reconnect, auto-resume. For
someone who genuinely leaves, the admin gets **"Drop & continue"**, because a
strict wait-for-everyone rule otherwise lets one closed laptop deadlock the
room forever.

## Why the player list is randomised per room

A fixed order is memorisable. Replay the auction and you know exactly which
players are coming, so you can plan your entire ₹120 Cr in advance — which
removes the only real decision in the game: *bid now, or save purse for someone
better later?* Randomising forces that choice under uncertainty. It also
spreads positional bias, since the players at the front are always contested
with full purses.

It is shuffled **once, at room creation**, within each set (sets are skill
tiers, so marquee players still come up early), and the resulting order is
persisted on the room document. That stability is the point: because every
client agrees on what player #7 is, the entire live auction position collapses
to one integer, `lotIndex` — which is what makes the reconnect snapshot small.

## API

### REST — stateless, non-realtime only

| Method | Path | Returns |
|---|---|---|
| `GET` | `/api/health` | `{ ok, db, liveRooms }` |
| `POST` | `/api/rooms` | `{ roomCode, userId, totalPlayers }` |
| `GET` | `/api/rooms/:code` | `{ exists, phase, participantCount, maxParticipants }` |
| `GET` | `/api/rooms/:code/results` | `{ teams, unsold }` |

### Socket — everything realtime

Client → server. All validated against `socket.data.userId` and `socket.rooms`,
never the payload.

| Event | Payload | Notes |
|---|---|---|
| `room:join` | `{ roomCode, userId?, userName }` | join or reconnect; acks with a full snapshot |
| `room:sync` | `{}` | pull a snapshot after a version gap |
| `bid:place` | `{ lotIndex }` | **no amount** |
| `auction:start` | `{}` | admin |
| `auction:next` | `{}` | admin |
| `auction:resume` | `{ dropUserIds? }` | admin |
| `room:kick` | `{ targetUserId }` | admin |

Server → client. Every event carries `version`.

| Event | Payload |
|---|---|
| `room:state` | full snapshot: phase, lotIndex, player, lot, participants, me |
| `room:participants` | `{ participants }` |
| `auction:lot` | `{ lotIndex, player, endsAt, status }` |
| `bid:update` | `{ amount, nextBid, bidderId, bidderName, endsAt }` |
| `bid:rejected` | `{ code, message }` — sender only |
| `auction:settled` | `{ status, player, soldPrice, winnerName, participants }` |
| `auction:paused` | `{ reason, waitingFor, remainingMs }` |
| `auction:resumed` | `{ endsAt }` |
| `auction:ended` | `{ results }` |

## Data model

Two collections. Rooms reference the catalog by `_id` rather than copying it.

```js
// players — seeded once
{ name, team, set, playerType, basePrice /* lakhs */, point }

// rooms
{ roomCode, adminUserId, phase,
  playerIds: [ObjectId],          // the shuffled script, written once
  participants: [{ userId, name, purse, team: [{ playerId, price }], abandoned }],
  lots: [{ index, playerId, status, soldPrice, winnerUserId }] }
```

## Tests

`npm run race-test` fires 8 clients' bids in the same event-loop tick for 20
rounds and asserts amounts strictly increase, every increment matches the band
rules, no two accepted bids share an amount, nobody outbids themselves, and no
purse goes negative. It also forces the two paths a round-robin volley never
reaches: one client bidding twice in a single tick, and a bid for a stale
`lotIndex`.

`npm run flow-test` walks the whole lifecycle — admin gating, base-price
opening bid, band increments, anti-snipe extension, settlement and debiting,
hard pause on disconnect, auto-resume on reconnect with purse and squad intact,
admin retaining rights across a refresh, and the drop-and-continue hatch.

`npm run full-test` runs an auction over all 40 players and checks that every
lot is opened exactly once, `auction:ended` fires, spend reconciles against
each purse, and the REST results endpoint agrees with the final broadcast.

## Limitations

**Single process.** The live lot lives in memory, so two instances behind a
load balancer would each hold a different `currentBid`. Scaling out means
moving the hot state to Redis (with `@socket.io/redis-adapter` for fan-out) and
doing the bid update as a Lua script so it stays atomic. For one process this
is correct, and anything more would be overengineering.

Restarting the server mid-auction therefore loses the live lot; the room
reopens in its lobby rather than pretending to resume.

## Stack

React 18 + Vite · Socket.IO 4 · Express 4 · MongoDB + Mongoose 8
