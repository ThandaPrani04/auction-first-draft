# IPL Auction — Rework Plan

## Context

This project is on your resume as a real-time multiplayer auction with "synchronization", but the
current implementation cannot defend that claim in an interview. The core problem is that **the
server is not authoritative**. Clients decide the bid amount, clients decide when the timer ends,
and clients decide who won a player. The server is a message relay with a memory leak.

Concretely, from [server/app.js](server/app.js):

- **The bid amount comes from the client.** `continue-bid` (l.340) does
  `newBid = numericCurrentBid + 0.2` where `currentBid` is a number *in the client's payload*.
  Two clients that both see ₹1.00 Cr both send `currentBid: 1.0`, both get `1.2`, and the second
  write silently overwrites the first. That is a textbook lost update — the exact race your resume
  claims to have solved. It is also forgeable: send `currentBid: 0` and buy anyone for 0.2.
- **Identity comes from the client.** The same payload carries `socketId`, used to look up the
  purse — so you can bid as someone else. The buyer is later resolved *by display name*
  (l.441), so two players named "Rohit" charge the wrong person.
- **There is no server timer.** No `setTimeout`, no `setInterval` anywhere in the server. Every
  client runs its own `setInterval` ([App.jsx:336](client/src/App.jsx#L336)) and emits `sync-timer`
  once per second; the server echoes it to every peer, who blindly calls `setTimer(value)`
  ([App.jsx:318](client/src/App.jsx#L318)). With N clients that is an N-way echo loop between
  clocks a few hundred ms apart — **this is the flickering countdown.**
- **Clients settle the auction.** `player-status-update` (l.408) is emitted by *every* client when
  its local timer hits zero, carrying the sale `price` from the client. The server runs the sale N
  times and is saved only by a dedup `Set`.
- **The auction stalls after player #1.** `timer-complete` (l.290) emits nothing and never advances
  the index; `isTimerRunning` is set false and never set back to true.
- **`auction-ended` can never fire.** l.510 tests `currentIdx === player.totalPlayers - 1`, but the
  client sends a raw player document with no `totalPlayers` field, so it compares against `NaN`.
- **Every reconnect is a new person.** Purse and admin rights are keyed by `socket.id`, so a
  refresh grants a fresh ₹120 Cr purse and permanently strips the room creator of admin — if the
  creator refreshes while one other user is present, nobody can ever start the auction again.
- **Rooms are MongoDB collections.** `POST /roomcode` (l.84) creates a physical collection
  `<code>_players` per room and copies every player document into it. Collections are never
  dropped, and re-calling it for a compiled room code throws `OverwriteModelError` masked as a
  generic 500.

Two more bugs are why it does not run *at all* right now, and they should be fixed first because
they mask everything else:

- **The app talks to two different servers.** HTTP goes to
  `https://auction-first-draft.onrender.com` — hardcoded and copy-pasted into four files
  ([App.jsx:9](client/src/App.jsx#L9), `CreateRoom.jsx:6`, `JoinRoom.jsx:6`, `RoomCode.jsx:6`) —
  while the socket goes to `http://localhost:3000`
  ([socket.js:10](client/src/socket.js#L10)). A room created on Render does not exist in
  localhost's in-memory state, so joining silently produces an empty room.
- **Only the first person to join ever sees a player.** `createModel()` (l.51) calls
  `mongoose.model(name, schema)` unconditionally, which throws `OverwriteModelError` the second
  time. So the 2nd, 3rd… client's `POST /shuffledplayers/:code` returns 500, `App.jsx:209` just
  logs it, and `actualPlayers` stays `[]` forever — blank player card, and their `timer===0`
  handler early-returns. Fix is `mongoose.models[n] ?? mongoose.model(n, s)`, but the rework
  removes per-room collections entirely.

Plus three divergent copies of the auction engine ([server/app.js](server/app.js) live,
[server/room.js](server/room.js) dead but cleaner, and a stale fork at [app.js](app.js) in the repo
root **with different bid increments**), a 43-`useState` 1144-line `App.jsx`, an empty
`database.js`, unresolved merge-conflict markers in [README.md](README.md), `server/node_modules`
committed to git, and a live MongoDB Atlas username/password committed in
[server/.env](server/.env).

**And there is no "next player" control.** Advancement happens independently inside *every* client's
`timer===0` effect ([App.jsx:446-555](client/src/App.jsx#L446-L555)), so clients can drift to
different `currentIndex` values and show different players to different users. The creator's
"Start Bidding" button is the de-facto per-player control — it must be re-clicked for every single
player, and non-creators get no feedback about why nothing is happening. The rework makes this an
explicit, correctly-labelled `auction:next`.

**Goal:** a locally runnable, correct auction whose event API and concurrency story hold up to
interview questions — and a demo video for the README. Not a distributed system. Correct,
explainable, and small.

### Decisions taken
- Rewrite the server protocol; split `App.jsx` into a page + hooks + components (keep your CSS).
- **Disconnect policy: hard pause.** Any participant dropping freezes the auction; it resumes only
  when everyone is back. (Escape hatch below — an interviewer *will* ask.)
- Keep: post-auction results, purse tracking, admin kick.
- **Cut: the second-round flow.** No client emits `second-round`, it uses the wrong room variable,
  and its quorum check can overshoot and never fire. It is the buggiest code in the repo and adds
  nothing to the demo.

### Every flicker source, since it will be on camera

Four separate causes, three of which the rework removes for free:

| Symptom | Cause | Fixed by |
|---|---|---|
| Countdown jitters (7→6→7→6) | N clients each emit `sync-timer` every second; peers blindly `setTimer(peerValue)` | §4 absolute `endsAt` — the event is deleted |
| BID button flickers enabled/disabled | `isFirstBid` reset loop: [App.jsx:227](client/src/App.jsx#L227) sets it `true` on a `currentBid` dep change, immediately after `add-bid` set it `false` | The reducer — one state transition per event |
| SOLD overlay sticks, or the auction stalls | The `timer===0` effect's cleanup clears both pending timeouts on any dep change, and its own body mutates three of its own deps — it cancels the timeouts it just scheduled | Server owns settlement; the client only renders |
| Price and notices pulse continuously | `pulsate 1.5s infinite alternate` on `.current-price` ([App.css:329,345](client/src/App.css#L329)) and `fade-in-out 2.5s infinite alternate` on `.autoplay-notice` (l.844) | Make these one-shot on change, not infinite loops |

The layout also thrashes at every round boundary: [App.jsx:794](client/src/App.jsx#L794) unmounts
the participants panel whenever `!isTimerRunning`, shifting everything below it. Reserve the space
instead of conditionally rendering it.

---

## The four design answers

These are the questions the project will actually be asked about. Each maps to a concrete
mechanism below.

### 1. Why randomise the player list per room?

**Strategy.** A fixed order is memorisable. Replay the auction and you know exactly which players
are coming, so you can plan your entire ₹120 Cr in advance and the game becomes a solved lookup.
Randomising forces the real auction decision under uncertainty: *bid now, or save purse for someone
better later?* You never know what is still to come.

**Fairness.** With a fixed order the players at the front are always contested with full purses and
the players at the back are always bought cheap. Random order spreads that positional bias.

**But it must be stable *within* a room.** The whole live auction state collapses to one integer —
`lotIndex` — only if every client agrees on what player #7 is. So: shuffle **once, at room
creation** (Fisher–Yates), persist the resulting ordered array of player IDs on the room document,
and never touch it again. The shuffled list is the room's immutable *auction script*; the live
state is a cursor into it. That is what makes reconnect cheap (§4) and what makes the server's
state small enough to keep in memory (§2).

Keep the existing per-set shuffle (sets are skill tiers, so marquee players still come up early),
but fix `setno = 3` being hardcoded — derive the set list from the data so players in set 4+ are
not silently dropped from every auction.

### 2. Why not write the current bid to MongoDB?

Your instinct is right. Split state by **how fast it changes and whether it survives the lot**:

| | Lives in | Written | Survives restart |
|---|---|---|---|
| Player catalog | Mongo `players` | Once, by a seed script | Yes |
| Room: code, admin, shuffled player IDs, participants | Mongo `rooms` | Once at creation + on join | Yes |
| **Settled results** (sold price, winner, unsold) | Mongo `rooms.lots[i]` | **Once per player** | Yes |
| **Live lot: `currentBid`, `highestBidder`, `endsAt`, `version`** | **In-memory `RoomRegistry`** | Many times per second | No — and it doesn't need to |

The arithmetic to quote: 8 bidders × ~10 bids per player × 100 players ≈ **8,000 writes** if you
persist every bid, versus **100 writes** — one per settlement — if you persist only outcomes. ~80×
fewer, and more importantly each Atlas round-trip (5–50 ms) leaves the *bid hot path* entirely.

The correctness argument is stronger than the performance one: **an intermediate bid is not a fact
worth keeping.** It is meaningful only while the lot is live. Once the hammer falls the only durable
truth is who won and for how much — the same reason a shopping cart is not an order. Persisting
losing bids would be storing scaffolding.

And there is a third reason, which is really §3: keeping Mongo out of the bid path is *what makes
the bid handler atomic*. Read on.

**The honest limitation, which you should volunteer:** in-memory state means **one Node process**.
Two instances behind a load balancer would each hold a different `currentBid`. Scaling out means
moving the hot state to Redis (with `@socket.io/redis-adapter` for the broadcast fan-out) and doing
the bid update as a Lua script or `WATCH`/`MULTI` so it stays atomic. Saying this unprompted turns
a limitation into evidence you understood the trade-off. For a local demo, one process is correct
and anything else is overengineering.

### 3. How is synchronization handled when several users click BID simultaneously?

Four layers. Layer 1 is the one interviewers want.

**Layer 1 — Node's event loop *is* the mutex.**
Socket.IO delivers messages to handlers that run on a single thread. Two `bid:place` messages that
arrive "at the same time" are serialised into the event-loop queue: handler A runs to completion
before handler B starts. So a read-modify-write on a plain in-memory object is **atomic by
construction** — no lock needed.

**The critical section must contain zero `await`.** This is the whole discipline. The moment you
`await room.save()` between reading `currentBid` and writing it, you yield the event loop, B
interleaves, both read ₹1.00 Cr, and you are back to the lost update the current code has. So the
bid handler is written as one synchronous block:

```
validate → compute amount from SERVER state → mutate → version++ → broadcast
```

Any persistence is fire-and-forget *after* the broadcast, or deferred to settlement. **This is why
§2's "don't persist bids" is a correctness decision, not just a performance one** — that's the
sentence that ties the whole design together.

**Layer 2 — the client sends an intent, never an amount.**
`bid:place` carries no price. The server computes `nextBid = currentBid + increment(currentBid)`
from *its own* state, and takes the bidder from `socket.data.userId` (bound at join), never from
the payload. This deletes an entire class of bugs at once: stale-price bids, tampered payloads, and
clients disagreeing about the increment. Every handler also asserts
`socket.rooms.has(roomCode)` — currently four handlers accept a room code from the payload and
will happily mutate a room the socket never joined.

**Layer 3 — a monotonic `version` per room.**
Every accepted mutation does `room.version++`, and every broadcast carries it. Clients:
- ignore any event with `version <= lastSeenVersion` (kills out-of-order and duplicate delivery),
- on a **gap** (`version > lastSeen + 1`) know they missed an event and emit `room:sync` to pull a
  fresh snapshot.

That gap check is what makes the client self-healing rather than silently wrong, and it is the
direct fix for the flickering timer: a stale value can no longer overwrite a fresh one.

**Layer 4 — what actually happens in the race, and the one rule that matters.**
A and B click at the same instant. Server processes A: bid → ₹1.20 Cr, highest = A, version 5.
Then B's handler runs, sees ₹1.20 Cr, and bids ₹1.40 Cr. **That is correct auction behaviour, not a
bug** — B genuinely wanted to outbid, and the price simply moved. Nothing is lost, nothing is
double-counted, and the outcome is identical to the two clicks arriving a second apart.

The single rule that must be enforced is the one your UI already implies:

```js
if (lot.highestBidderId === socket.data.userId) return reject('ALREADY_HIGHEST');
```

**Disabling the BID button is UX; this check is the invariant.** The button is disabled on the
client so the user isn't confused, and rejected on the server so the rule is actually true. Worth
saying explicitly in an interview — it shows you know client-side validation is a hint, not a
guarantee.

Also enforced synchronously in that block: purse (`nextBid <= participant.purse`), lot status is
`RUNNING`, and `lotIndex` matches the live lot (a click landing just after settlement is dropped).

**Money is stored as integer lakhs, never floats.** The current code accumulates `+ 0.2` and
produces `2.4000000000000004`. Increments by band, as one shared pure function so client preview
and server truth cannot drift:

| Current price | Increment |
|---|---|
| < ₹1 Cr | +₹5 L |
| < ₹2 Cr | +₹10 L |
| < ₹9.95 Cr | +₹20 L |
| ≥ ₹9.95 Cr | +₹50 L |

### 4. How do the timer and bid amount survive a reconnect?

**The timer is an absolute deadline, not a countdown.** The server stores
`endsAt = Date.now() + 10_000` and broadcasts *that*. Clients render `endsAt - Date.now()` on a
100 ms `requestAnimationFrame`/interval that is pure display and emits nothing.

Consequences, all of which fall out for free:
- Every client agrees, because they are all rendering the same number.
- The N-way `sync-timer` echo loop is deleted outright — **the flicker is gone.**
- A reconnecting client computes the correct remaining time instantly, with no negotiation.
- Only the server's single `setTimeout` can settle a lot, and settlement is idempotent
  (`if (lot.status !== 'RUNNING') return`).
- Anti-snipe: each accepted bid pushes `endsAt` back to `now + 10s`.

**Reconnect is therefore just one snapshot.** `room:join` carries a `userId` persisted in a cookie
(not a `socket.id`), the server rebinds that participant to the new socket, and replies with a
single `room:state`:

```jsonc
{ "version": 42, "phase": "LIVE", "lotIndex": 7, "player": {...},
  "currentBid": 120, "highestBidderId": "u_3", "endsAt": 1735660812345,
  "status": "RUNNING", "participants": [...], "me": { "purse": 9400, "team": [...] } }
```

Purse and team come from the participant record keyed by `userId`, so **a refresh no longer hands
out a fresh ₹120 Cr**, and admin rights survive because `room.adminUserId` is a `userId`, not a
socket id.

**On top of that, the hard-pause policy you chose.** On `disconnect`, mark the participant
`connected: false`; if the auction is live, freeze the lot immediately:

```js
lot.remainingMs = lot.endsAt - Date.now();   // freeze
clearTimeout(lot.timer);
lot.status = 'PAUSED';
broadcast('auction:paused', { waitingFor: [...disconnectedNames], remainingMs });
```

On resume, `endsAt = Date.now() + lot.remainingMs`. Storing `remainingMs` is the one place the
absolute-deadline model needs care, and it's a nice detail to have thought about.

You also chose to reset the timer to its default on pause rather than preserve it — that is
simpler and arguably fairer (nobody wins because their opponent's WiFi died with 0.4 s left), so
the resume sets `endsAt = Date.now() + LOT_DURATION`. Keep `remainingMs` in the state anyway; it
costs nothing and lets you flip the policy with one line if an interviewer pushes.

**The escape hatch, which you need.** Strict "resume only when all are back" means one person
closing their laptop deadlocks the room forever, and that is the first follow-up question you will
get. So: while paused, the admin gets a **"Drop <name> and continue"** button
(`auction:resume { dropUserIds }`) that marks the absent participant as `abandoned` and excludes
them from the all-connected check. The policy stays exactly what you chose; it just has a defined
exit. A page refresh, note, self-heals in ~1 s — pause, reconnect, resume — so this only ever fires
for a genuine departure.

---

## Target architecture

Three layers, one direction of authority:

```
Mongo (durable, slow)      players catalog · room doc · settled lots
      ▲ write once per settlement
RoomRegistry (in-memory)   Map<roomCode, Room> — live lot, bids, timers, version
      ▲ mutated only by synchronous socket handlers
Socket.IO (transport)      server broadcasts state; clients send intents
```

**One `Map<roomCode, Room>` replaces the 13 parallel objects** in `roomState` (l.155). Every slice
today is keyed `[roomcode]` except `bidHistory`, which is keyed `` `${roomcode}_player_${i}` `` —
that inconsistency is where several of the bugs live. One object per room, deleted when the room
empties (nothing is currently ever deleted; it leaks per room, permanently).

**State machines** — explicit, because the current code has these transitions implied across three
files:

- Room `phase`: `LOBBY → LIVE → ENDED`
- Lot `status`: `IDLE → RUNNING → PAUSED ⇄ RUNNING → SETTLED`

Admin-gated transitions: `LOBBY→LIVE` (`auction:start`), `SETTLED→IDLE→RUNNING` for the next player
(`auction:next` — your "only the creator calls the next player" rule), and `PAUSED→RUNNING`.

---

## API contract

### REST — stateless, non-realtime only

| Method | Path | Body / Params | Returns |
|---|---|---|---|
| `GET` | `/api/health` | — | `{ ok, db: 'up'\|'down' }` |
| `POST` | `/api/rooms` | `{ hostName }` | `201 { roomCode, userId, adminToken }` |
| `GET` | `/api/rooms/:code` | — | `200 { exists, phase, participantCount, maxParticipants }` / `404` |
| `GET` | `/api/rooms/:code/results` | — | `200 { teams, unsold, spendByManager }` (once `ENDED`) |

Replaces: `GET /players` (leaked the whole catalog; the client no longer needs it),
`POST /shuffledplayers/:name` (a POST doing a pure read — the list now arrives in `room:state`),
`POST /roomcode` (returned plain text, created a collection per room),
`GET /check-room/:code` (scanned **every collection in the database** on each join attempt).

Seeding the catalog becomes `npm run seed` in `server/scripts/seed.js`, not an HTTP route.

### Socket — everything realtime

Naming is `domain:action` throughout; the current names are ad-hoc (`start-all-timer`, `add-bid`,
`continue-bid`) and two different payload shapes ship under `auction-state-update`.

**Client → Server** — all validated against `socket.data.userId` and `socket.rooms`, never the payload.

| Event | Payload | Purpose |
|---|---|---|
| `room:join` | `{ roomCode, userId?, userName }` | Join or **reconnect**. Acks `{ ok, state }` or `{ ok:false, code }`. |
| `room:sync` | `{}` | Client detected a version gap; pull a fresh snapshot. |
| `auction:start` | `{}` | **admin** · `LOBBY → LIVE`, opens lot 0. |
| `auction:next` | `{}` | **admin** · advance to the next player. |
| `auction:resume` | `{ dropUserIds? }` | **admin** · unpause; optionally drop absentees. |
| `bid:place` | `{ lotIndex, version }` | **No amount.** `version` is an advisory staleness token. |
| `room:kick` | `{ targetUserId }` | **admin** |

**Server → Client** — every event carries `version`.

| Event | Payload | To |
|---|---|---|
| `room:state` | full snapshot (§4) | one socket |
| `room:participants` | `{ participants: [{ userId, name, connected, purse, isAdmin }] }` | room |
| `auction:lot` | `{ lotIndex, player, currentBid, nextBid, endsAt, status }` | room |
| `bid:update` | `{ lotIndex, amount, nextBid, bidderId, bidderName, endsAt }` | room |
| `bid:rejected` | `{ code: 'ALREADY_HIGHEST'\|'INSUFFICIENT_PURSE'\|'LOT_CLOSED'\|'STALE', message }` | sender |
| `auction:settled` | `{ lotIndex, status: 'SOLD'\|'UNSOLD', player, winnerId, winnerName, amount, purses }` | room |
| `auction:paused` | `{ reason, waitingFor: [names], remainingMs }` | room |
| `auction:resumed` | `{ endsAt }` | room |
| `auction:ended` | `{ results }` | room |
| `room:error` | `{ code, message }` | sender |

Deleted: `sync-timer` / `sync-timer-update` (the flicker), `timer-complete` and
`player-status-update` (clients settling the auction), `start-all-timer`, `add-bid` (duplicate of
`bid-update`), `second-round` / `second-round-final`, `set-creator` (folded into `room:state`, and
it only ever sent `true` so admin could never be revoked).

---

## Data model — two collections, not one per room

```js
// players — the catalog, seeded once
{ _id, name, team, set, playerType, basePrice /* lakhs, int */, point }

// rooms — one document per room
{ roomCode, adminUserId, phase, maxParticipants: 10, lotDurationMs: 10000,
  startingPurse: 12000,                 // lakhs
  playerIds: [ObjectId],                // ← the shuffled script, written once at creation
  participants: [{ userId, name, purse, team: [{ playerId, price }], abandoned }],
  lots: [{ index, playerId, status, soldPrice, winnerUserId }],  // written once per settlement
  createdAt }
```

`playerIds` referencing the catalog replaces copying every player document into a per-room
collection with regenerated `_id`s. It also fixes the ordering bug: the current read-back is a bare
`.find({})` with **no `sort`**, so the client's index ordering relies on MongoDB natural order,
which is not guaranteed.

---

## Files

### Server — rewrite `server/app.js` (546 lines) into:

| File | Contents |
|---|---|
| `app.js` | bootstrap only: express, `connectDB()`, mount routes, `registerSocketHandlers(io)`, listen **after** `db.once('open')` (it currently listens regardless of Mongo state) |
| `config/env.js` | validated env, fails loudly on a missing `MONGO_URI` |
| `db.js` | connection (replaces the **0-byte** `database.js`); drop the no-op `useNewUrlParser`/`useUnifiedTopology` |
| `models/Player.js`, `models/Room.js` | schemas above |
| `state/RoomRegistry.js` | `Map<roomCode, Room>`; `get/create/delete`, `bumpVersion` |
| `services/auctionService.js` | `startAuction`, `openLot`, `settleLot`, `advance`, `pause`, `resume` |
| `services/bidService.js` | **the synchronous critical section** — the one file to be able to talk through |
| `services/timerService.js` | `setTimeout` per lot, freeze/thaw via `remainingMs` |
| `sockets/index.js` | connection, join, disconnect, admin gate, `socket.rooms` assertion |
| `routes/rooms.js` | the four REST routes |
| `shared/bidRules.js` | `nextIncrement(lakhs)`, `formatCr(lakhs)` — **shared with the client** |
| `scripts/seed.js` | `npm run seed` |

Delete: `server/room.js` (dead — never imported, and references an undefined `Player`), and the
repo-root `app.js` / `package.json` / `index.html` / `vite.config.js` (a stale fork with
*different* bid increments — three divergent copies of the auction rules is the biggest structural
hazard in the repo).

### Client — split `App.jsx` (1144 lines, 43 `useState`, ~15 socket-registering `useEffect`s)

| File | Contents |
|---|---|
| `lib/socket.js` | **one** socket, `import.meta.env.VITE_SERVER_URL` |
| `lib/bidRules.js` | mirror of `shared/bidRules.js` (display only; server is truth) |
| `hooks/useAuctionRoom.js` | **one `useReducer`** over `room:state` + deltas, with the version-gap check → `room:sync`. Replaces ~35 of the 43 `useState`s. |
| `hooks/useCountdown.js` | `endsAt → mm:ss`, display-only, emits nothing |
| `pages/AuctionRoom.jsx` | ~150 lines of layout |
| `components/` | `PlayerCard`, `BidPanel`, `TimerRing`, `ParticipantList`, `MyTeam`, `SettlementBanner`, `AdminControls`, `PausedOverlay`, `ResultsScreen` |

Keep `Home`, `CreateRoom`, `JoinRoom`, `RoomCode`, `UserName`, `ErrorBoundary` and **all existing
CSS** — the visual work is fine; only the wiring changes. Four small fixes while you are in there:

- **Room codes must be generated server-side.** `CreateRoom.jsx:13-21` generates 8 random A–Z chars
  in the browser with no collision check; `POST /api/rooms` returns the code instead.
- **`/check-room` is currently a no-op** — `JoinRoom.jsx:41` and `RoomCode.jsx:30` assign the
  response to `const response` and never read it, then `.catch(() => ({ ok: true }))` and navigate
  regardless. So you can "join" a room that does not exist. Actually branch on the new
  `GET /api/rooms/:code`.
- `JoinRoom.jsx` and `RoomCode.jsx` are near-identical and `RoomCode.css` is a near-byte-copy of
  `JoinRoom.css` — collapse into one component with a prop.
- Delete the dead client state the reducer makes redundant anyway: `playersInfo` + its
  `GET /players` fetch (never rendered), `nextBidAmount` (computed twice, never rendered),
  `timerSynced` (set, never read), `showPlayersInfo` / `managerPlayersInfo` and their handlers
  (never referenced in JSX), the unused `io` import at `App.jsx:3`, the
  `socket.on("reconnect")` handler at `App.jsx:157` (fires on the Manager, not the socket, in
  socket.io-client v4 — it has never run), and the local `unsoldList`/`playerSold`/`managerList`
  appends at `App.jsx:482-505` that `auction-state-update` overwrites milliseconds later.

### Repo hygiene — do this first, it is the fastest credibility win

1. **Rotate the MongoDB Atlas password.** `server/.env` (URI + username + password) is committed and
   in git history. Rotate first, then `git rm --cached`, then add `.env` to `.gitignore` and commit
   a `.env.example`.
2. `git rm -r --cached server/node_modules` — **1,767 tracked files** are node_modules.
3. `client/src/.env` is **dead code**: it uses a CRA-style `REACT_APP_SERVER` prefix (Vite only
   exposes `VITE_`), lives in `src/` (Vite reads `.env` from the project root), and **nothing in the
   client reads `import.meta.env` at all** — the URL is hardcoded in
   [socket.js:11](client/src/socket.js#L11). Your last four commits ("added backend url", "fixed
   env", "env + render") changed nothing functional. Move to `client/.env` as `VITE_SERVER_URL` and
   actually read it.
4. Remove the four copy-pasted `const URL="https://auction-first-draft.onrender.com"` declarations
   (`App.jsx`, `CreateRoom.jsx`, `JoinRoom.jsx`, `RoomCode.jsx`) — one `VITE_SERVER_URL`, used by
   both HTTP and the socket, is what ends the split-brain bug.
5. Drop `dotenv` from `client/package.json` — it is a Node-only library listed as a browser runtime
   dependency.
6. Resolve the merge-conflict markers still in [README.md](README.md) (`<<<<<<< HEAD` at l.1).
7. Delete `client/src/# Code Citations.md` (60+ redundant Copilot attribution stubs), the empty
   `client/client/`, and the unreferenced `client/src/assets/react.svg` + `client/public/vite.svg`.

---

## Build order

Each step ends runnable — do not batch them.

1. **Hygiene + secret rotation** (above). Nothing else matters if the credentials are live.
2. **Server skeleton**: env, db, models, seed script. Verify with `npm run seed` + `/api/health`.
3. **Rooms REST + `RoomRegistry` + join/reconnect**: two browsers in a lobby, participant list
   correct, refresh preserves identity and admin. **No auction yet** — get identity right first,
   because purse and admin bugs all trace back to `socket.id` as identity.
4. **Lot lifecycle**: `auction:start` / server timer / auto-settle as UNSOLD / `auction:next`.
   Verify the countdown is smooth and identical in both windows — *this is where the flicker dies.*
5. **Bidding**: `bidService` critical section, increments, purse, `ALREADY_HIGHEST`, anti-snipe.
6. **Settlement + persistence**: SOLD writes the lot + purse + team to Mongo, one write per player.
7. **Pause/resume on disconnect** + admin drop.
8. **Client split** — reducer and components; delete the god component last.
9. **Results screen**, then `auction:ended`.
10. **README + demo video.**

---

## Verification

**Setup:** `cd server && npm run seed && npm start`, `cd client && npm run dev`, then open two or
three browser windows (use one incognito — cookies carry `userId`, so same-profile tabs share an
identity).

**Manual scenarios** — each maps to a claim in the README:

| # | Scenario | Expected |
|---|---|---|
| 1 | Create + two joins | All three see the same participant list; only the creator sees admin controls |
| 2 | Start auction | Same player, same countdown, **no flicker or jumping numbers** in all windows |
| 3 | Single bid | Price rises by the band increment; bidder's button disables; others' stay enabled; timer resets to 10 s |
| 4 | **Both click BID within the same tick** | Two accepted bids at successive increments, final price and winner identical in all windows; no lost bid, no double-charge |
| 5 | Bid when already highest | `bid:rejected` `ALREADY_HIGHEST` — verify by emitting it manually from the console with the button bypassed |
| 6 | Bid above purse | `INSUFFICIENT_PURSE`; purse never goes negative |
| 7 | Timer expires with a bid | SOLD to highest; purse debited once; player in their team in every window |
| 8 | Timer expires with no bid | UNSOLD; no purse change |
| 9 | **Refresh mid-lot** | Pause → reconnect in ~1 s → resume; **same purse, same team, admin retained**; timer correct on return |
| 10 | Close a tab entirely | Stays paused, overlay names who is missing; admin "Drop & continue" resumes it |
| 11 | Run to the last player | `auction:ended` fires, results screen shows teams + unsold + spend |
| 12 | Restart the server mid-auction | Room is gone and clients show a clear error — the documented single-process limitation, not a silent hang |

**Scripted race test** (worth having — it is direct evidence for the resume claim). A small Node
script in `server/scripts/raceTest.js` opens 8 socket.io-client connections, joins one room, and
fires `bid:place` from all 8 in the same tick, ~20 rounds. Assert: bids strictly increase, no two
accepted bids share an amount, the final price equals `basePrice + Σ increments`, and no
participant's purse is negative or double-debited. Run it before recording the video.

**README** should carry: the demo video, a diagram of the three-layer state model, the event-contract
tables from this plan, and a short "Concurrency & synchronization" section reusing §3 — with the
single-process limitation stated explicitly. That section is the part an interviewer will read.
