import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuctionRoom } from '../hooks/useAuctionRoom.js';
import { usePlayerCatalog } from '../hooks/usePlayerCatalog.js';
import { getRoomCode, getUserName, clearRoom } from '../lib/identity.js';
import { formatCr } from '../lib/bidRules.js';

import PlayerLedger from '../components/PlayerLedger.jsx';
import PlayerCard from '../components/PlayerCard.jsx';
import BidPanel from '../components/BidPanel.jsx';
import TimerRing from '../components/TimerRing.jsx';
import ParticipantList from '../components/ParticipantList.jsx';
import MyTeam from '../components/MyTeam.jsx';
import PausedOverlay from '../components/PausedOverlay.jsx';
import ResultsScreen from '../components/ResultsScreen.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';

import '../styles/auction.css';

const JOIN_ERRORS = {
  ROOM_NOT_FOUND: 'That room does not exist.',
  ROOM_FULL: 'That room is full.',
  AUCTION_IN_PROGRESS: 'That auction has already started.',
  KICKED: 'You were removed from the room by the host.',
};

/**
 * The auction room: a fixed-height three-column grid that fits a laptop
 * without the page ever scrolling. Only the three panes scroll internally,
 * and every region holds its size regardless of what the auction is doing.
 */
export default function AuctionRoom() {
  const navigate = useNavigate();
  const roomCode = getRoomCode();
  const userName = getUserName();

  const [state, actions] = useAuctionRoom(roomCode, userName);
  const { players: catalog } = usePlayerCatalog();

  useEffect(() => {
    if (!roomCode) navigate('/joinroom', { replace: true });
    else if (!userName) navigate('/getusername', { replace: true });
  }, [roomCode, userName, navigate]);

  if (!roomCode || !userName) return null;

  if (state.status === 'error') {
    const message = JOIN_ERRORS[state.error] || state.error || 'Something went wrong.';
    return (
      <div className="auction-app auction-app--message">
        <div className="panel messagebox">
          <h2>Cannot join</h2>
          <p className="notice-error">{message}</p>
          <button
            className="btn btn--bid"
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
    return (
      <div className="auction-app auction-app--message">
        <div className="panel messagebox">
          <h2>Connecting…</h2>
          <p className="muted">Room {roomCode}</p>
        </div>
      </div>
    );
  }

  if (state.phase === 'ENDED') {
    return (
      <div className="auction-app auction-app--results">
        <ResultsScreen
          results={state.results}
          roomCode={state.roomCode}
          spectator={state.spectator}
          onExit={() => {
            clearRoom();
            navigate('/');
          }}
        />
      </div>
    );
  }

  const progress = state.totalLots
    ? `Lot ${Math.max(0, state.lotIndex) + 1} of ${state.totalLots}`
    : 'Lobby';

  return (
    <div className="auction-app">
      <header className="topbar">
        <div className="topbar-left">
          <h1>Cricket League Auction</h1>
          <span className="topbar-room">
            Room <code>{state.roomCode}</code>
          </span>
        </div>
        <div className="topbar-mid">
          <span className={`phase-pill phase-${state.phase.toLowerCase()}`}>{state.phase}</span>
          <span className="topbar-progress">{progress}</span>
        </div>
        <div className="topbar-right">
          <span className="topbar-user">{state.me?.name}</span>
          <span className="topbar-purse">{formatCr(state.me?.purse)}</span>
          <ThemeToggle className="theme-toggle--sm" />
        </div>
      </header>

      <PlayerLedger
        catalog={catalog}
        settled={state.settled}
        currentPlayerId={state.player?._id}
      />

      <main className="stage">
        <PlayerCard
          player={state.player}
          lot={state.lot}
          settlement={state.settlement}
          isAdmin={state.isAdmin}
          me={state.me}
        />
        <TimerRing endsAt={state.lot?.endsAt} status={state.lot?.status} />
        <BidPanel state={state} actions={actions} />
      </main>

      <aside className="aside">
        <ParticipantList
          participants={state.participants}
          me={state.me}
          isAdmin={state.isAdmin}
          onKick={actions.kick}
          highestBidderId={state.lot?.highestBidderId}
        />
        <MyTeam me={state.me} />
      </aside>

      <PausedOverlay
        waitingFor={state.waitingFor}
        isAdmin={state.isAdmin}
        participants={state.participants}
        onResume={actions.resumeAuction}
      />
    </div>
  );
}
