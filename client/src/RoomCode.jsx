import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { checkRoom } from './lib/api.js';
import { setRoomCode as persistRoomCode, clearRoom } from './lib/identity.js';
import ThemeToggle from './components/ThemeToggle.jsx';
import './Auth.css';

/**
 * Recovery page: we know who you are but not which room you wanted.
 * Shares the Auth.css styling used by the Create/Join pages.
 */
const RoomCode = () => {
  const [roomCode, setRoomCodeInput] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (!code) {
      setError('Please enter a room code');
      return;
    }

    setIsSubmitting(true);
    try {
      await checkRoom(code);
      clearRoom();
      persistRoomCode(code);
      navigate('/app');
    } catch (err) {
      setError(err.status === 404 ? 'No room with that code.' : 'Could not reach the server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <ThemeToggle className="theme-toggle--float" />
      <div className="auth-card">
        <span className="auth-logo">🏏</span>
        <h1 className="auth-title">Which room?</h1>
        <p className="auth-subtitle">
          Enter the room code to rejoin your auction.
        </p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span className="auth-label">Room code</span>
            <input
              type="text"
              className="auth-code"
              value={roomCode}
              onChange={(e) => {
                setRoomCodeInput(e.target.value.toUpperCase());
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
            {isSubmitting ? 'Checking…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default RoomCode;
