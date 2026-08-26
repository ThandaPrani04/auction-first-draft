import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import ErrorBoundary from './ErrorBoundary';
import Home from './Home';
import AuctionRoom from './pages/AuctionRoom';
import CreateRoom from './CreateRoom';
import JoinRoom from './JoinRoom';
import RoomCode from './RoomCode';
import UserName from './UserName';
import './App.css';

const AppRouter = () => (
  <Router>
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/createroom" element={<CreateRoom />} />
        <Route path="/joinroom" element={<JoinRoom />} />
        <Route path="/app" element={<AuctionRoom />} />
        <Route path="/getusername" element={<UserName />} />
        <Route path="/getroomcode" element={<RoomCode />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  </Router>
);

export default AppRouter;
