import { useEffect, useMemo, useReducer, useRef } from 'react';
import { getSocket } from '../lib/socket.js';
import { getUserId, setUserId } from '../lib/identity.js';

/**
 * All auction room state, in one reducer.
 *
 * The old App.jsx held this in 43 useState hooks across ~15 useEffects, each
 * registering its own socket listeners. Several of them wrote state that other
 * effects immediately overwrote — the isFirstBid reset loop made the BID
 * button visibly flicker, and local sold/unsold appends were clobbered by the
 * server broadcast milliseconds later. One reducer means one state transition
 * per event, so those races cannot exist.
 *
 * ORDERING: every server event carries a monotonic `version`. Anything at or
 * below what we already have is dropped (duplicate or out-of-order delivery),
 * and a gap means we missed an event, so we pull a fresh snapshot. That gap
 * check is what makes this self-healing instead of silently wrong.
 */

const initialState = {
  status: 'connecting', // connecting | joining | joined | error
  error: null,
  needsSync: false,

  version: 0,
  roomCode: null,
  phase: 'LOBBY',
  isAdmin: false,
  totalLots: 0,
  lotIndex: -1,
  player: null,
  lot: null, // { status, currentBid, highestBidderId, highestBidderName, endsAt }
  participants: [],
  me: null, // { userId, name, purse, team }
  waitingFor: [],

  settlement: null, // most recent SOLD/UNSOLD, for the banner
  results: null,
  notice: null, // transient message (a rejected bid, an error)
};

/** Decide whether a versioned event should be applied. */
function ordering(state, version) {
  if (version == null) return 'ok';
  if (version <= state.version) return 'stale';
  if (version > state.version + 1) return 'gap';
  return 'ok';
}

function reducer(state, action) {
  switch (action.type) {
    case 'CONNECTED':
      return { ...state, status: state.status === 'joined' ? 'joined' : 'joining', error: null };

    case 'DISCONNECTED':
      return { ...state, notice: { kind: 'warn', text: 'Reconnecting…' } };

    case 'ERROR':
      return { ...state, status: 'error', error: action.error };

    /** Full snapshot — the one message a client needs to render from cold. */
    case 'SNAPSHOT': {
      const s = action.state;
      return {
        ...state,
        status: 'joined',
        error: null,
        needsSync: false,
        version: s.version,
        roomCode: s.roomCode,
        phase: s.phase,
        isAdmin: s.isAdmin,
        totalLots: s.totalLots,
        lotIndex: s.lotIndex,
        player: s.player,
        lot: s.lot,
        participants: s.participants,
        me: s.me,
        waitingFor: s.waitingFor,
        settlement: state.settlement,
      };
    }

    case 'PARTICIPANTS': {
      const ord = ordering(state, action.version);
      if (ord === 'stale') return state;
      const me = state.me
        ? { ...state.me, ...pick(action.participants.find((p) => p.userId === state.me.userId)) }
        : state.me;
      return {
        ...state,
        version: action.version,
        participants: action.participants,
        me,
        waitingFor: action.participants.filter((p) => !p.connected && !p.abandoned).map((p) => p.name),
        needsSync: state.needsSync || ord === 'gap',
      };
    }

    case 'LOT': {
      const ord = ordering(state, action.version);
      if (ord === 'stale') return state;
      return {
        ...state,
        version: action.version,
        phase: 'LIVE',
        lotIndex: action.lotIndex,
        totalLots: action.totalLots ?? state.totalLots,
        player: action.player,
        lot: {
          status: action.status,
          currentBid: null,
          highestBidderId: null,
          highestBidderName: null,
          endsAt: action.endsAt,
        },
        settlement: null,
        notice: null,
        needsSync: state.needsSync || ord === 'gap',
      };
    }

    case 'BID': {
      const ord = ordering(state, action.version);
      if (ord === 'stale') return state;
      return {
        ...state,
        version: action.version,
        lot: {
          ...state.lot,
          status: 'RUNNING',
          currentBid: action.amount,
          highestBidderId: action.bidderId,
          highestBidderName: action.bidderName,
          endsAt: action.endsAt,
        },
        notice: null,
        needsSync: state.needsSync || ord === 'gap',
      };
    }

    case 'SETTLED': {
      const ord = ordering(state, action.version);
      if (ord === 'stale') return state;
      const me = state.me
        ? { ...state.me, ...pick(action.participants.find((p) => p.userId === state.me.userId)) }
        : state.me;
      // The winner's team grows; reflect it locally so My Team updates without
      // waiting for a round trip.
      const wonByMe = action.status === 'SOLD' && action.winnerUserId === state.me?.userId;
      return {
        ...state,
        version: action.version,
        lot: { ...state.lot, status: 'SETTLED' },
        participants: action.participants,
        me: wonByMe
          ? { ...me, team: [...(me?.team ?? []), { player: action.player, price: action.soldPrice }] }
          : me,
        settlement: {
          player: action.player,
          status: action.status,
          soldPrice: action.soldPrice,
          winnerName: action.winnerName,
          isLastLot: action.isLastLot,
        },
        needsSync: state.needsSync || ord === 'gap',
      };
    }

    case 'PAUSED': {
      const ord = ordering(state, action.version);
      if (ord === 'stale') return state;
      return {
        ...state,
        version: action.version,
        lot: state.lot ? { ...state.lot, status: 'PAUSED', endsAt: null } : state.lot,
        waitingFor: action.waitingFor,
        needsSync: state.needsSync || ord === 'gap',
      };
    }

    case 'RESUMED': {
      const ord = ordering(state, action.version);
      if (ord === 'stale') return state;
      return {
        ...state,
        version: action.version,
        lot: state.lot ? { ...state.lot, status: 'RUNNING', endsAt: action.endsAt } : state.lot,
        participants: action.participants ?? state.participants,
        waitingFor: [],
        needsSync: state.needsSync || ord === 'gap',
      };
    }

    case 'ENDED': {
      const ord = ordering(state, action.version);
      if (ord === 'stale') return state;
      return {
        ...state,
        version: action.version,
        phase: 'ENDED',
        lot: null,
        results: action.results,
        needsSync: false,
      };
    }

    /**
     * The SOLD/UNSOLD banner dismisses itself. It used to clear only when the
     * next lot opened — but the banner is a fullscreen overlay and opening the
     * next lot needs the admin's "Next Player" button underneath it, so the
     * room deadlocked on every settlement.
     */
    case 'CLEAR_SETTLEMENT':
      return state.settlement ? { ...state, settlement: null } : state;

    case 'NOTICE':
      return { ...state, notice: action.notice };

    case 'CLEAR_NOTICE':
      return state.notice ? { ...state, notice: null } : state;

    case 'SYNC_REQUESTED':
      return { ...state, needsSync: false };

    default:
      return state;
  }
}

const pick = (p) => (p ? { purse: p.purse, name: p.name } : {});

/**
 * @param {string} roomCode
 * @param {string} userName
 */
export function useAuctionRoom(roomCode, userName) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const socket = useMemo(() => getSocket(), []);
  const joinedRef = useRef(false);

  useEffect(() => {
    if (!roomCode || !userName) return undefined;

    const join = () => {
      socket.emit(
        'room:join',
        { roomCode, userId: getUserId() || undefined, userName },
        (res) => {
          if (!res?.ok) {
            dispatch({ type: 'ERROR', error: res?.code || 'JOIN_FAILED' });
            return;
          }
          setUserId(res.userId);
          joinedRef.current = true;
          dispatch({ type: 'SNAPSHOT', state: res.state });
        }
      );
    };

    const onConnect = () => {
      dispatch({ type: 'CONNECTED' });
      join(); // also runs after an automatic reconnect
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', () => dispatch({ type: 'DISCONNECTED' }));
    socket.on('connect_error', (err) =>
      dispatch({ type: 'ERROR', error: `Cannot reach server (${err.message})` })
    );

    socket.on('room:state', (s) => dispatch({ type: 'SNAPSHOT', state: s }));
    socket.on('room:participants', (e) => dispatch({ type: 'PARTICIPANTS', ...e }));
    socket.on('auction:lot', (e) => dispatch({ type: 'LOT', ...e }));
    socket.on('bid:update', (e) => dispatch({ type: 'BID', ...e }));
    socket.on('auction:settled', (e) => dispatch({ type: 'SETTLED', ...e }));
    socket.on('auction:paused', (e) => dispatch({ type: 'PAUSED', ...e }));
    socket.on('auction:resumed', (e) => dispatch({ type: 'RESUMED', ...e }));
    socket.on('auction:ended', (e) => dispatch({ type: 'ENDED', ...e }));

    socket.on('bid:rejected', (e) =>
      dispatch({ type: 'NOTICE', notice: { kind: 'reject', text: e.message, code: e.code } })
    );
    socket.on('room:error', (e) =>
      dispatch({ type: 'NOTICE', notice: { kind: 'error', text: e.message || e.code } })
    );
    socket.on('room:kicked', () => dispatch({ type: 'ERROR', error: 'KICKED' }));

    if (socket.connected) onConnect();
    else socket.connect();

    return () => {
      socket.removeAllListeners();
    };
  }, [socket, roomCode, userName]);

  /** A version gap means we missed an event — pull the truth. */
  useEffect(() => {
    if (!state.needsSync || !joinedRef.current) return;
    dispatch({ type: 'SYNC_REQUESTED' });
    socket.emit('room:sync', {}, (res) => {
      if (res?.ok) dispatch({ type: 'SNAPSHOT', state: res.state });
    });
  }, [state.needsSync, socket]);

  /** Transient notices clear themselves. */
  useEffect(() => {
    if (!state.notice) return undefined;
    const t = setTimeout(() => dispatch({ type: 'CLEAR_NOTICE' }), 3500);
    return () => clearTimeout(t);
  }, [state.notice]);

  /** So does the settlement banner. */
  useEffect(() => {
    if (!state.settlement) return undefined;
    const t = setTimeout(() => dispatch({ type: 'CLEAR_SETTLEMENT' }), 2500);
    return () => clearTimeout(t);
  }, [state.settlement]);

  const actions = useMemo(
    () => ({
      placeBid: (lotIndex) => socket.emit('bid:place', { lotIndex }),
      startAuction: () => socket.emit('auction:start', {}),
      nextPlayer: () => socket.emit('auction:next', {}),
      resumeAuction: (dropUserIds = []) => socket.emit('auction:resume', { dropUserIds }),
      kick: (targetUserId) => socket.emit('room:kick', { targetUserId }),
    }),
    [socket]
  );

  return [state, actions];
}
