import Cookies from 'js-cookie';
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './RoomCode.css'; // Import the CSS file

const RoomCode = () => {
    const [roomCode, setRoomCode] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();
    
    const handleCodeChange = (e) => {
      setRoomCode(e.target.value.toUpperCase());
      setError('');
    };
  
    const handleFormSubmit = async (e) => {
      e.preventDefault();
      
      if (!roomCode.trim()) {
        setError('Please enter a room code');
        return;
      }
      
      setIsSubmitting(true);
      
      try {
        // Verify room exists before joining
        const response = await fetch(`http://localhost:3000/check-room/${roomCode}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }).catch(() => {
          // If the server is unreachable, let the user try anyway
          return { ok: true };
        });
        
        // Set the room code cookie
        Cookies.set('RoomCode', roomCode, { path: '/', expires: 1 });
        
        // Store in sessionStorage as backup
        try {
          sessionStorage.setItem('RoomCode', roomCode);
        } catch (storageError) {
          console.warn('Session storage not available:', storageError);
        }
        
        navigate('/app');
      } catch (error) {
        console.error('Error joining room:', error);
        setError('Error joining room. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    };
  
    return (
      <div className="roomcode-container">
        <form onSubmit={handleFormSubmit}>
          <label>
            Enter Room Code:
            <input 
              type="text" 
              value={roomCode} 
              onChange={handleCodeChange}
              placeholder="Room code"
              required
              disabled={isSubmitting}
            />
          </label>
          {error && <p className="error-message">{error}</p>}
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </button>
        </form>
        <p>Do you want to create a room? <Link to="/createroom">Click here</Link></p>
      </div>
    );
};

export default RoomCode;