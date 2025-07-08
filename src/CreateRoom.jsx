import Cookies from 'js-cookie';
import React, { useState } from 'react';
import './CreateRoom.css'; // Import the CSS file
const CreateRoom = () => {
    const [name, setName] = useState('');

    function generateRoomCode() {
      const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; // You can include lowercase letters if needed
      let code = '';
      for (let i = 0; i < 8; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        code += characters[randomIndex];
      }
      return code;
    }

    const handleNameChange = (e) => {
      setName(e.target.value);
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      
      // Generate room code
      const roomcode = generateRoomCode();
      console.log(roomcode);

      // Set cookies
      Cookies.set('userName', name, { path: '/' });
      Cookies.set('RoomCode', roomcode, { path: '/' });
      
      try {
        // Create collection with roomcode
        const response = await fetch(`http://localhost:3000/roomcode`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ code: roomcode })
        });
        
        if (response.ok) {
          // Redirect to app page
          window.location.href = '/app';
        } else {
          console.error('Failed to create room');
        }
      } catch (error) {
        console.error('Error occurred:', error);
      }
    };
  
    return (
      <form onSubmit={handleSubmit}>
        <label>
          Enter your name:
          <input type="text" value={name} onChange={handleNameChange} />
        </label>
        <button type="submit">Submit</button>
      </form>
    );
};

export default CreateRoom;
