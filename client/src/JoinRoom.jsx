import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { checkRoom } from './lib/api.js';
import {
  setUserName,
  setRoomCode as persistRoomCode,
  clearRoom,
  getRoomCode,
  getUserId,
} from './lib/identity.js';
import ThemeToggle from './components/ThemeToggle.jsx';
import './Auth.css';

/**
 * Join an existing room.
 *
 * This now actually BRANCHES on whether the room exists. The old version
 * fetched /check-room, assigned the response to a variable it never read, and
 * navigated regardless — so you could "join" a room that had never existed and
 * land in an empty auction with no explanation.
 */
const JoinRoom = () => {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    const userName = name.trim();
    const code = roomCode.trim().toUpperCase();

    if (!userName || !code) {
      setError('Please enter both your name and a room code');
      return;
    }

    // Re-entering the SAME room this browser already holds an identity for is a
    // reconnect, not a fresh join: keep the userId (so the team/purse/admin come
    // back) and skip the "already started"/"full" guards, which only apply to
    // newcomers. The server rebinds a known userId regardless of phase.
    const isReturning = code === (getRoomCode() || '') && !!getUserId();

    setIsSubmitting(true);
    try {
      const room = await checkRoom(code);

      if (!isReturning) {
        if (room.phase === 'LIVE') {
          setError('That auction has already started.');
          return;
        }
        if (room.participantCount >= room.maxParticipants) {
          setError('That room is full.');
          return;
        }
        // A different room than we last held — drop the old userId so this
        // browser joins as a new participant rather than resuming a stale seat.
        clearRoom();
      }

      setUserName(userName);
      persistRoomCode(code);
      navigate('/app');
    } catch (err) {
      setError(err.status === 404 ? 'No room with that code.' : 'Could not reach the server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page auth-page--join">
      <ThemeToggle className="theme-toggle--float" />
      <div className="auth-card">
        <Link to="/" className="auth-back">← Back</Link>
        <span className="auth-logo">🏏</span>
        <h1 className="auth-title">Join a Room</h1>
        <p className="auth-subtitle">
          Enter the code your host shared to take a seat.
        </p>
        <form className="auth-form" onSubmit={handleFormSubmit}>
          <label className="auth-field">
            <span className="auth-label">Your name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              placeholder="e.g. Ravi"
              maxLength={24}
              required
              disabled={isSubmitting}
            />
          </label>
          <label className="auth-field">
            <span className="auth-label">Room code</span>
            <input
              type="text"
              className="auth-code"
              value={roomCode}
              onChange={(e) => {
                setRoomCode(e.target.value.toUpperCase());
                setError('');
              }}
              placeholder="ABC123"
              maxLength={6}
              required
              disabled={isSubmitting}
            />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button className="auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Joining…' : 'Join Room'}
          </button>
        </form>
        <p className="auth-switch">
          Need a new room? <Link to="/createroom">Create one</Link>
        </p>
      </div>
    </div>
  );
};

export default JoinRoom;
