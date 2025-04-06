# Cricket League Auction - Real-time Multiplayer Auction Platform

## Overview

Cricket League Auction is a real-time multiplayer web application that simulates cricket player auctions similar to IPL auctions. It allows multiple users to join auction rooms, bid on players, and build their dream teams. The application uses WebSockets for real-time communication, providing an immersive and interactive auction experience.

## Features

### User Management
- **Create or Join Rooms**: Users can create new auction rooms or join existing ones with a room code
- **User Authentication**: Simple username-based authentication system with cookie persistence
- **Room Management**: Room creators have admin privileges to kick users and start auctions

### Auction Functionality
- **Real-time Bidding**: Live bidding system with timer countdown
- **Player Database**: Comprehensive database of cricket players with details like base price, team, player type, and points
- **Bidding Controls**: Intuitive interface for placing bids and monitoring auction progress
- **Auto-updating Prices**: Current bid and base price displayed with visual indicators

### Team Management
- **My Team Sidebar**: Real-time display of players purchased by the current user
- **Team Building**: Strategic team composition with player categories (batsmen, bowlers, all-rounders, wicket-keepers)
- **Budget Management**: Dynamic purse amount that updates as players are purchased
- **Post-auction Analysis**: Detailed view of all teams and unassigned players after auction ends

### Additional Features
- **Background Music**: Ambient IPL-themed music with volume controls
- **Responsive Design**: Fully responsive interface that works on mobile and desktop
- **Real-time Status Updates**: Visual notifications for player status (SOLD/UNSOLD)
- **Remaining Purse**: Live tracking of remaining budget for each manager

## Technology Stack

### Frontend
- **React**: UI library for building component-based interfaces
- **React Router**: For navigation and routing
- **Socket.IO Client**: Real-time bidirectional communication
- **JavaScript ES6+**: Modern JavaScript features
- **CSS3**: Custom styling with responsive design
- **Cookies**: For persistent user sessions

### Backend
- **Node.js**: JavaScript runtime for server-side logic
- **Express**: Web application framework
- **Socket.IO**: WebSocket library for real-time communication
- **MongoDB**: NoSQL database for storing player data and auction results
- **Mongoose**: MongoDB object modeling for Node.js

## Architecture

The application follows a client-server architecture with real-time communication:

1. **Room Creation**: When a user creates a room, a unique room code is generated, and a collection of shuffled players is created in the database
2. **Socket Management**: Each client connects to the server via WebSockets and joins a specific room
3. **Auction Flow**: The server controls the auction flow, timer synchronization, and bid validation
4. **State Management**: Real-time state updates are broadcast to all connected clients in a room
5. **Data Persistence**: Auction results and team compositions are stored in MongoDB

## Usage Guide

1. **Home Page**: Choose to create a new room or join an existing one
2. **Create Room**: Enter your name and a room code will be generated
3. **Join Room**: Enter your name and the room code to join
4. **Auction Room**: 
   - Room creator can start the auction
   - Users can place bids when the timer is running
   - Sidebar displays your current team
   - Total purse and remaining amount are shown
5. **Post-Auction**: View all teams and unsold players after auction ends

## Future Enhancements

- Advanced user authentication with passwords
- Player statistics and performance metrics
- Team balancing rules and constraints
- Auction history and replay
- Customizable auction rules and settings
- Player images and rich media content

## Acknowledgments

Inspired by the Indian Premier League (IPL) auction format and built using React with Vite.
