import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRoom } from './lib/api.js';
import { setUserName, setRoomCode, setUserId } from './lib/identity.js';
import './CreateRoom.css';

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
    <div className="createroom-container">
      <form onSubmit={handleSubmit}>
        <label>
          Enter your name:
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            placeholder="Your name"
            maxLength={24}
            required
            disabled={isSubmitting}
          />
        </label>
        {error && <p className="error-message">{error}</p>}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating Room…' : 'Create Room'}
        </button>
      </form>
    </div>
  );
};

export default CreateRoom;
