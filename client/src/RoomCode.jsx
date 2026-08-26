import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { checkRoom } from './lib/api.js';
import { setRoomCode as persistRoomCode, clearRoom } from './lib/identity.js';
import './JoinRoom.css';

/**
 * Recovery page: we know who you are but not which room you wanted.
 * (RoomCode.css was a near byte-for-byte copy of JoinRoom.css, so this shares
 * the stylesheet rather than duplicating it.)
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
    <div className="joinroom-container">
      <form onSubmit={handleSubmit}>
        <label>
          Enter Room Code:
          <input
            type="text"
            value={roomCode}
            onChange={(e) => {
              setRoomCodeInput(e.target.value.toUpperCase());
              setError('');
            }}
            placeholder="Room code"
            maxLength={6}
            required
            disabled={isSubmitting}
          />
        </label>
        {error && <p className="error-message">{error}</p>}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Checking…' : 'Continue'}
        </button>
      </form>
    </div>
  );
};

export default RoomCode;
