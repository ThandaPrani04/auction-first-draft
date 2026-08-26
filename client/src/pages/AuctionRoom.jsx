import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuctionRoom } from '../hooks/useAuctionRoom.js';
import { getRoomCode, getUserName, clearRoom } from '../lib/identity.js';
import { formatCr } from '../lib/bidRules.js';

import PlayerCard from '../components/PlayerCard.jsx';
import BidPanel from '../components/BidPanel.jsx';
import TimerRing from '../components/TimerRing.jsx';
import ParticipantList from '../components/ParticipantList.jsx';
import MyTeam from '../components/MyTeam.jsx';
import SettlementBanner from '../components/SettlementBanner.jsx';
import PausedOverlay from '../components/PausedOverlay.jsx';
import ResultsScreen from '../components/ResultsScreen.jsx';

const JOIN_ERRORS = {
  ROOM_NOT_FOUND: 'That room does not exist.',
  ROOM_FULL: 'That room is full.',
  AUCTION_IN_PROGRESS: 'That auction has already started.',
  KICKED: 'You were removed from the room by the host.',
};

/**
 * The auction room.
 *
 * All state lives in useAuctionRoom; this component only lays it out. The
 * version it replaces was 1144 lines with 43 useState hooks and ~15 effects
 * that registered socket listeners and overwrote each other's state.
 */
export default function AuctionRoom() {
  const navigate = useNavigate();
  const roomCode = getRoomCode();
  const userName = getUserName();

  const [state, actions] = useAuctionRoom(roomCode, userName);

  // Missing identity: send them back to pick it up rather than joining as
  // "Anonymous" into a room they never chose.
  useEffect(() => {
    if (!roomCode) navigate('/joinroom', { replace: true });
    else if (!userName) navigate('/getusername', { replace: true });
  }, [roomCode, userName, navigate]);

  if (!roomCode || !userName) return null;

  if (state.status === 'error') {
    const message = JOIN_ERRORS[state.error] || state.error || 'Something went wrong.';
    return (
      <div className="auction-container">
        <div className="room-status">
          <h2>Cannot join</h2>
          <p className="status-message notice-error">{message}</p>
          <button
            className="start-btn"
            onClick={() => {
              clearRoom();
              navigate('/');
            }}
          >
            Back to home
          </button>
        </div>
      </div>
    );
  }

  if (state.status !== 'joined') {
    return <div className="loading">Connecting to room {roomCode}…</div>;
  }

  if (state.phase === 'ENDED') {
    return (
      <div className="auction-container">
        <ResultsScreen results={state.results} roomCode={state.roomCode} />
      </div>
    );
  }

  return (
    <div className="auction-container">
      <div className="user-info">
        <p>Welcome, {state.me?.name}</p>
        <p className="purse-info">Purse: {formatCr(state.me?.purse)}</p>
      </div>

      <PausedOverlay
        waitingFor={state.waitingFor}
        isAdmin={state.isAdmin}
        participants={state.participants}
        onResume={actions.resumeAuction}
      />

      <SettlementBanner settlement={state.settlement} />

      <div className="auction-live-container">
        <MyTeam me={state.me} />

        <div className="auction-live">
          <div className="auction-header">
            <h1>Live Auction</h1>
            <p className="room-info">
              Room: <strong>{state.roomCode}</strong> · {state.participants.length} in room
              {state.phase === 'LIVE' && state.totalLots
                ? ` · Lot ${state.lotIndex + 1}/${state.totalLots}`
                : ''}
            </p>
          </div>

          <PlayerCard
            player={state.player}
            lot={state.lot}
            lotIndex={state.lotIndex}
            totalLots={state.totalLots}
          />

          <TimerRing endsAt={state.lot?.endsAt} status={state.lot?.status} />

          <BidPanel state={state} actions={actions} />
        </div>

        <ParticipantList
          participants={state.participants}
          me={state.me}
          isAdmin={state.isAdmin}
          onKick={actions.kick}
        />
      </div>
    </div>
  );
}
