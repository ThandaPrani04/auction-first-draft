import Cookies from 'js-cookie';
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './JoinRoom.css'; // Reuse the styles

const UserName = () => {
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();

    const handleNameChange = (e) => {
      setName(e.target.value);
      setError('');
    };

    const handleFormSubmit = (e) => {
      e.preventDefault();
      
      if (!name.trim()) {
        setError('Please enter your name');
        return;
      }
      
      setIsSubmitting(true);
  
      try {
        // Set the cookie with the user's name
        Cookies.set('userName', name, { path: '/', expires: 1 });
        
        // Store in sessionStorage as backup
        try {
          sessionStorage.setItem('userName', name);
        } catch (storageError) {
          console.warn('Session storage not available:', storageError);
        }
        
        navigate('/app');
      } catch (error) {
        console.error('Error setting username:', error);
        setError('Failed to set username');
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
          {error && <p className="error-message">{error}</p>}
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </button>
        </form>
        <p>Do you want to create a room? <Link to="/createroom">Click here</Link></p>
      </div>
    );
};

export default UserName;