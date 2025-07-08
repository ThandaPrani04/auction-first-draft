import Cookies from 'js-cookie';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './RoomCode.css'; // Import the CSS file
const RoomCode = () => {
    const [roomCode, setRoomCode] = useState('');
    const handleCodeChange = (e) => {
        setRoomCode(e.target.value);
    };
  
    const handleFormSubmit = (e) => {
      e.preventDefault();
      Cookies.set('RoomCode', roomCode, { path: '/' });
      //setRoomCode('');
      window.location.href = '/app';
    };
  
    return (
        <div>
            <form onSubmit={handleFormSubmit}>
                <label>
                    Enter Room Code:
                    <input type="text" value={roomCode} onChange={handleCodeChange} />
                </label>
                <button type="submit">Submit</button>
            </form>
            <p>Do you want to create a room? <Link to="/createroom">Click here</Link></p>
        </div>
    );
};

export default RoomCode;