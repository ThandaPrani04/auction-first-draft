import Cookies from 'js-cookie';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './JoinRoom.css'; // Import the CSS file
const JoinRoom = () => {
    const [name, setName] = useState('');
    const [roomCode, setRoomCode] = useState('');

    const handleNameChange = (e) => {
      setName(e.target.value);
    };
    const handleCodeChange = (e) => {
        setRoomCode(e.target.value);
      };
  
    const handleFormSubmit = (e) => {
      e.preventDefault();
  
      // Set the cookie with the user's name
      Cookies.set('userName', name, { path: '/' });
      //setName('');
      Cookies.set('RoomCode', roomCode, { path: '/' });
      //setRoomCode('');
      window.location.href = '/app';
    };
  
    return (
        <div>
            <form onSubmit={handleFormSubmit}>
                <label>
                    Enter your name:
                    <input type="text" value={name} onChange={handleNameChange} />
                </label>
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

export default JoinRoom;