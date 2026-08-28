import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setUserName } from './lib/identity.js';
import ThemeToggle from './components/ThemeToggle.jsx';
import './Auth.css';

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
    <div className="auth-page">
      <ThemeToggle className="theme-toggle--float" />
      <div className="auth-card">
        <span className="auth-logo">🏏</span>
        <h1 className="auth-title">What&apos;s your name?</h1>
        <p className="auth-subtitle">
          We know your room — just need a name to seat you.
        </p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span className="auth-label">Your name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              placeholder="e.g. Ravi"
              maxLength={24}
              required
            />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button className="auth-submit" type="submit">Continue</button>
        </form>
      </div>
    </div>
  );
};

export default UserName;
