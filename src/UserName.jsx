import Cookies from 'js-cookie';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const UserName = () => {
    const [name, setName] = useState('');

    const handleNameChange = (e) => {
      setName(e.target.value);
    };

    const handleFormSubmit = (e) => {
      e.preventDefault();
  
      // Set the cookie with the user's name
      Cookies.set('userName', name, { path: '/' });
      //setName('');
      window.location.href = '/app';
    };
  
    return (
        <div>
          <form onSubmit={handleFormSubmit}>
            <label>
              Enter your name:
              <input type="text" value={name} onChange={handleNameChange} />
            </label>
            <button type="submit">Submit</button>
          </form>
          <p>Do you want to create a room? <Link to="/createroom">Click here</Link></p>
        </div>
      );
};

export default UserName;