import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setUserName } from './lib/identity.js';
import './JoinRoom.css';

/** Recovery page: we know the room but not your name. */
const UserName = () => {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    const userName = name.trim();
    if (!userName) {
      setError('Please enter a name');
      return;
    }
    setUserName(userName);
    navigate('/app');
  };

  return (
    <div className="joinroom-container">
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
          />
        </label>
        {error && <p className="error-message">{error}</p>}
        <button type="submit">Continue</button>
      </form>
    </div>
  );
};

export default UserName;
