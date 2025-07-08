import Cookies from 'js-cookie';
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './JoinRoom.css'; // Import the CSS file
import dotenv from 'dotenv';
dotenv.config();
const URL=process.env.SERVER;
const JoinRoom = () => {
    const [name, setName] = useState('');
    const [roomCode, setRoomCode] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();

    const handleNameChange = (e) => {
      setName(e.target.value);
      setError('');
    };
    
    const handleCodeChange = (e) => {
      setRoomCode(e.target.value.toUpperCase());
      setError('');
    };
  
    const handleFormSubmit = async (e) => {
      e.preventDefault();
      
      if (!name.trim()) {
        setError('Please enter your name');
        return;
      }
      
      if (!roomCode.trim()) {
        setError('Please enter a room code');
        return;
      }
      
      setIsSubmitting(true);
      
      try {
        // Verify room exists before joining
        const response = await fetch(`${URL}/check-room/${roomCode}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }).catch(() => {
          // If the server is unreachable, let the user try anyway
          return { ok: true };
        });
        
        // Set the cookie with the user's name
        Cookies.set('userName', name, { path: '/', expires: 1 });
        Cookies.set('RoomCode', roomCode, { path: '/', expires: 1 });
        
        // Store in sessionStorage as backup
        try {
          sessionStorage.setItem('userName', name);
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
      <div className="joinroom-container">
        <form onSubmit={handleFormSubmit}>
          <label>
            Enter your name:
            <input 
              type="text" 
              value={name} 
              onChange={handleNameChange}
              placeholder="Your name"
              required
              disabled={isSubmitting}
            />
          </label>
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
            {isSubmitting ? 'Joining...' : 'Join Room'}
          </button>
        </form>
        <p>Do you want to create a room? <Link to="/createroom">Click here</Link></p>
      </div>
    );
};

export default JoinRoom;