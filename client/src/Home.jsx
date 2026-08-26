import { Link } from 'react-router-dom';
import './Home.css'; // Import the CSS file
const Home = () => {
  return (
    <div className="home-container">
      <div className="hero-section">
        <h1>Cricket League Auction</h1>
        <p className="subtitle">Build your dream team in this multiplayer auction experience</p>
        <div className="action-buttons">
          <Link to="/createroom">
            <button className="create-btn">Create Room</button>
          </Link>
          <Link to="/joinroom">
            <button className="join-btn">Join Room</button>
          </Link>
        </div>
      </div>
      <div className="features">
        <div className="feature-card">
          <h3>Real-time Bidding</h3>
          <p>Compete with other managers in live auctions</p>
        </div>
        <div className="feature-card">
          <h3>Player Database</h3>
          <p>Access comprehensive player statistics</p>
        </div>
        <div className="feature-card">
          <h3>Team Building</h3>
          <p>Create balanced teams with strategic bidding</p>
        </div>
      </div>
    </div>
  );
};

export default Home;




