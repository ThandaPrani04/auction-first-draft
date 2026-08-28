import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ThemeToggle from './components/ThemeToggle.jsx';
import { checkRoom } from './lib/api.js';
import { getRoomCode, getUserId, getUserName, clearRoom } from './lib/identity.js';
import './Home.css';

const FEATURES = [
  {
    icon: '⚡',
    title: 'Real-time Bidding',
    text: 'Compete with rival managers in fast, live auction rounds.',
  },
  {
    icon: '📊',
    title: 'Player Database',
    text: 'Browse full player stats and pick your targets with intent.',
  },
  {
    icon: '🏆',
    title: 'Team Building',
    text: 'Balance your purse and squad with smart, strategic bids.',
  },
];

const Home = () => {
  const navigate = useNavigate();
  // A saved session from this browser: offer to rejoin instead of forcing a
  // fresh join (which would clear the userId and lose the team). Verified once
  // on mount so a stale cookie for a deleted room never shows a dead button.
  const [resume, setResume] = useState(null);

  useEffect(() => {
    const code = getRoomCode();
    const userId = getUserId();
    if (!code || !userId) return;

    let cancelled = false;
    checkRoom(code)
      .then(() => {
        if (!cancelled) setResume({ code, name: getUserName() });
      })
      .catch((err) => {
        // Room is gone — drop the stale identity so nothing offers a dead link.
        // A transient network error just leaves the banner hidden.
        if (!cancelled && err.status === 404) clearRoom();
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="home">
      <ThemeToggle className="theme-toggle--float" />
      <header className="home__brand">
        <span className="home__logo">🏏</span>
        <span className="home__brandname">Cricket League Auction</span>
      </header>

      <main className="home__main">
        {resume && (
          <button className="home__resume" onClick={() => navigate('/app')}>
            <span className="home__resume-dot" />
            <span className="home__resume-text">
              Rejoin room <strong>{resume.code}</strong>
              {resume.name ? <> as {resume.name}</> : null}
            </span>
            <span className="home__resume-cta">Resume →</span>
          </button>
        )}
        <section className="home__hero">
          <span className="home__eyebrow">Multiplayer · Live</span>
          <h1 className="home__title">
            Build your <span className="home__accent">dream team</span>,
            <br /> one bid at a time.
          </h1>
          <p className="home__subtitle">
            Gather your friends, grab a room code, and battle it out in a live
            cricket auction.
          </p>
          <div className="home__actions">
            <Link className="btn btn--primary" to="/createroom">
              Create Room
            </Link>
            <Link className="btn btn--ghost" to="/joinroom">
              Join Room
            </Link>
          </div>
        </section>

        <section className="home__features">
          {FEATURES.map((f) => (
            <article key={f.title} className="feature">
              <span className="feature__icon">{f.icon}</span>
              <h3 className="feature__title">{f.title}</h3>
              <p className="feature__text">{f.text}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
};

export default Home;
