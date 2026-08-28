import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createRoom } from './lib/api.js';
import { setUserName, setRoomCode, setUserId } from './lib/identity.js';
import ThemeToggle from './components/ThemeToggle.jsx';
import './Auth.css';

/**
 * Create a room.
 *
 * The room code now comes from the SERVER, which checks it for collisions.
 * This page used to pick 8 random letters in the browser with no uniqueness
 * check at all — one of the codes left in the local database has a leading
 * space in it.
 */
const CreateRoom = () => {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const hostName = name.trim();
    if (!hostName) {
      setError('Please enter a name');
      return;
    }

    setIsSubmitting(true);
    try {
      const { roomCode, userId } = await createRoom(hostName);
      setUserName(hostName);
      setRoomCode(roomCode);
      // Claiming the admin userId up front is what makes this browser the host
      // even across a refresh.
      setUserId(userId);
      navigate('/app');
    } catch (err) {
      setError(err.message || 'Failed to create room');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page auth-page--create">
      <ThemeToggle className="theme-toggle--float" />
      <div className="auth-card">
        <Link to="/" className="auth-back">← Back</Link>
        <span className="auth-logo">🏏</span>
        <h1 className="auth-title">Create a Room</h1>
        <p className="auth-subtitle">
          You&apos;ll be the host. Share the code once you&apos;re in.
        </p>
        <form className="auth-form" onSubmit={handleSubmit}>
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
          {error && <p className="auth-error">{error}</p>}
          <button className="auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating Room…' : 'Create Room'}
          </button>
        </form>
        <p className="auth-switch">
          Have a code already? <Link to="/joinroom">Join a room</Link>
        </p>
      </div>
    </div>
  );
};

export default CreateRoom;
