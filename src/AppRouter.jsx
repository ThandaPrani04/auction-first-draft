import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import ErrorBoundary from './ErrorBoundary';
import Home from './Home';
import App from './App';
import CreateRoom from './CreateRoom';
import JoinRoom from './JoinRoom';
import RoomCode from './RoomCode';
import UserName from './UserName';

const AppRouter = () => {
    return (
      <Router>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Home />}></Route>
            <Route path="/createroom" element={<CreateRoom />}></Route>
            <Route path="/joinroom" element={<JoinRoom />}></Route>
            <Route path="/app" element={<App />}></Route>
            <Route path="/getusername" element={<UserName />}></Route>
            <Route path="/getroomcode" element={<RoomCode />}></Route>
          </Routes>
        </ErrorBoundary>
      </Router>
    );
  };

export default AppRouter;
