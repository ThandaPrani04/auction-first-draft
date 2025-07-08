import React from 'react';
import { Link } from 'react-router-dom';
import './Home.css'; // Import the CSS file
const Home = () => {
  return (
    <div>
      <h1>Welcome to Mock IPL Auction</h1>
      <Link to="/createroom"><button>Create Room</button></Link>
      <Link to="/joinroom"><button>Join Room</button></Link>
    </div>
  );
};

export default Home;




