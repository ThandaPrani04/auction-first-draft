import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { checkRoom } from './lib/api.js';
import { setUserName, setRoomCode as persistRoomCode, clearRoom } from './lib/identity.js';
import './JoinRoom.css';

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

    setIsSubmitting(true);
    try {
      const room = await checkRoom(code);

      if (room.phase === 'LIVE') {
        setError('That auction has already started.');
        return;
      }
      if (room.participantCount >= room.maxParticipants) {
        setError('That room is full.');
        return;
      }

      // Drop any userId held from a previous room, so this browser joins as a
      // new participant rather than trying to resume someone else's seat.
      clearRoom();
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
    <div className="joinroom-container">
      <form onSubmit={handleFormSubmit}>
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
        <label>
          Enter Room Code:
          <input
            type="text"
            value={roomCode}
            onChange={(e) => {
              setRoomCode(e.target.value.toUpperCase());
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
          {isSubmitting ? 'Joining…' : 'Join Room'}
        </button>
      </form>
      <p>
        Do you want to create a room? <Link to="/createroom">Click here</Link>
      </p>
    </div>
  );
};

export default JoinRoom;
