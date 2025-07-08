import Cookies from 'js-cookie';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './CreateRoom.css';

const URL="http://localhost:3000";
const CreateRoom = () => {
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();

    function generateRoomCode() {
      const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      let code = '';
      for (let i = 0; i < 8; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        code += characters[randomIndex];
      }
      return code;
    }

    const handleNameChange = (e) => {
      setName(e.target.value);
      setError('');
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      if (!name.trim()) {
        setError('Please enter a name');
        return;
      }
      
      setIsSubmitting(true);
      try {
        const roomcode = generateRoomCode();
        console.log('Generated room code:', roomcode);

        const response = await fetch(`${URL}/roomcode`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ code: roomcode })
        });
        
        if (!response.ok) {
          throw new Error('Failed to create room. Please try again.');
        }

        // Wait for response before setting cookies and navigating
        await response.text();
        
        // Set cookies with expiration of 24 hours
        Cookies.set('userName', name, { path: '/', expires: 1 });
        Cookies.set('RoomCode', roomcode, { path: '/', expires: 1 });
        
        // Store in sessionStorage as backup
        try {
          sessionStorage.setItem('userName', name);
          sessionStorage.setItem('RoomCode', roomcode);
        } catch (storageError) {
          console.warn('Session storage not available:', storageError);
        }
        
        navigate('/app');
      } catch (error) {
        console.error('Error creating room:', error);
        setError(error.message || 'Failed to create room');
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
              onChange={handleNameChange}
              placeholder="Your name"
              required 
              disabled={isSubmitting}
            />
          </label>
          {error && <p className="error-message">{error}</p>}
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating Room...' : 'Create Room'}
          </button>
        </form>
      </div>
    );
};

export default CreateRoom;
