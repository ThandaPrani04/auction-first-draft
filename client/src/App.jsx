import React from 'react'
import { useEffect,useMemo,useState,useRef } from 'react';
import {io} from 'socket.io-client';
import Cookies from 'js-cookie';
import { useNavigate } from 'react-router-dom';
import './App.css'; // Import the CSS file
import createSocket from './socket';

const App = () => {

  const [timer, setTimer] = useState(10);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [currentBid, setCurrentBid] = useState(null); 
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [bidId, setBidId]=useState(null);
  const [socketId, setSocketId] = useState(null);
  const [playersInfo, setPlayersInfo] = useState([]);
  const [actualPlayers, setActualPlayers] = useState([]);
  const [showPlayersInfo, setShowPlayersInfo] = useState(false);
  const [managerPlayersInfo, setManagerPlayersInfo] = useState(false);
  const [name,setName]=useState(null);
  const [roomcode,setRoomCode]=useState(null);
  const [bidderName, setBidderName]=useState(null);
  const [playerName, setPlayerName]=useState(null);
  const [statement, setStatement]=useState(null);
  const [managerList, setManagerList] = useState([]);
  const [unsoldList, setUnsoldList] = useState([]);
  const [playerSold, setPlayerSold] = useState([]);
  const [auctionEnds, setAuctionEnds] = useState(false);
  const [roomSize, setRoomSize] = useState(0);
  const [roomUsers, setRoomUsers] = useState([]);
  const [isCreator, setIsCreator] = useState(false);
  const [lastBidder, setLastBidder] = useState(null);
  const [winningBid, setWinningBid] = useState(null);
  const [auctionState, setAuctionState] = useState({
    soldPlayers: [],
    unsoldPlayers: [],
    teamPlayers: {}
  });
  const [isFirstBid, setIsFirstBid] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [timerSynced, setTimerSynced] = useState(false);
  const timerIntervalRef = useRef(null);
  const navigate = useNavigate();
  const [playerStatusMessage, setPlayerStatusMessage] = useState(null);
  const statusTimeoutRef = useRef(null);
  const transitionTimeoutRef = useRef(null);
  const [basePrice, setBasePrice] = useState(null);
  const [nextBidAmount, setNextBidAmount] = useState(null);
  const [purseAmount, setPurseAmount] = useState(120); // Initial purse of 120Cr
  const [selectedManager, setSelectedManager] = useState(null);
  const [viewingUnsold, setViewingUnsold] = useState(false);
  const [activeTab, setActiveTab] = useState('all'); // Track the active tab in unsold players view
  // Add audio related state with localStorage initialization
  const backgroundMusicRef = useRef(null);
  const [musicVolume, setMusicVolume] = useState(() => {
    const savedVolume = localStorage.getItem('auctionMusicVolume');
    return savedVolume ? parseFloat(savedVolume) : 0.5; // Default to 50% if not saved
  });
  const [isMusicPlaying, setIsMusicPlaying] = useState(() => {
    const savedPlayingState = localStorage.getItem('auctionMusicPlaying');
    return savedPlayingState ? savedPlayingState === 'true' : true; // Default to true if not saved
  });
  // State to show autoplay notification
  const [showAutoplayNotice, setShowAutoplayNotice] = useState(false);
  // State to toggle team sidebar visibility
  const [showTeamSidebar, setShowTeamSidebar] = useState(true);
  
  // Create socket instance
  const socket = useMemo(() => createSocket(), []);

  useEffect(() => {
    const checkCookies = async () => {
      let roomCode = Cookies.get('RoomCode');
      let userName = Cookies.get('userName');
      
      // Try to recover from sessionStorage if cookies are missing
      if (!roomCode) {
        try {
          roomCode = sessionStorage.getItem('RoomCode');
          if (roomCode) {
            // Restore the cookie from sessionStorage
            Cookies.set('RoomCode', roomCode, { path: '/', expires: 1 });
            console.log('Recovered room code from sessionStorage');
          }
        } catch (error) {
          console.warn('Failed to access sessionStorage:', error);
        }
      }
      
      if (!userName) {
        try {
          userName = sessionStorage.getItem('userName');
          if (userName) {
            // Restore the cookie from sessionStorage
            Cookies.set('userName', userName, { path: '/', expires: 1 });
            console.log('Recovered user name from sessionStorage');
          }
        } catch (error) {
          console.warn('Failed to access sessionStorage:', error);
        }
      }
      
      if (!roomCode && !userName) {  
        navigate('/joinroom');
      } else if (!roomCode) {
        navigate('/getroomcode');
      } else if (!userName) {
        navigate('/getusername'); 
      } else {
        setName(userName);
        setRoomCode(roomCode);
        // Connect to socket
        socket.connect();
        setIsLoading(false);
      }
    };
    checkCookies();
    
    return () => {
      // Clean up socket connection on unmount
      if (socket && socket.connected) {
        socket.disconnect();
      }
    };
  }, [navigate, socket]);

  function statechange() {
    setStatement(null);
  }

  function setStatechange(callback) {
    setTimeout(callback, 3000); // 3000 milliseconds = 3 seconds
  }

  useEffect(()=>{
    socket.on("connect",() =>{
      console.log("Connected with socket ID:", socket.id);
      setSocketId(socket.id);
    });
    
    socket.on("connect_error", (err) => {
      console.error("Connection error:", err);
      setStatement("Connection error. Trying to reconnect...");
    });
    
    socket.on("disconnect", (reason) => {
      console.log("Disconnected:", reason);
      // Stop timer if it was running
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    });
    
    socket.on("reconnect", (attemptNumber) => {
      console.log("Reconnected after", attemptNumber, "attempts");
      setStatement("Reconnected successfully!");
      setStatechange(statechange);
    });
    
    return () => {
      socket.off("connect");
      socket.off("connect_error");
      socket.off("disconnect");
      socket.off("reconnect");
    };
  },[socket]);
  
  useEffect(()=>{
    if (!roomcode || isLoading) return;
    
    socket.emit("join-room", roomcode);
    console.log("Joining room:", roomcode);
  },[roomcode, isLoading, socket]);
  
  const handleShowPlayersInfo = () => {
    setShowPlayersInfo(prevState => !prevState);
  };

  const handleManagerPlayersInfo = () => {
    setManagerPlayersInfo(prevState => !prevState);
  };
  
  useEffect(()=>{
    if (!roomcode) return;
    
    fetch('http://localhost:3000/players')
      .then(response => response.json())
      .then(data => setPlayersInfo(data))
      .catch(error => console.error('Error fetching players info:', error)); 
    
    fetch(`http://localhost:3000/shuffledplayers/${roomcode}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ roomcode })
    })
    .then(response => response.json())
    .then(data => {
      setActualPlayers(data);
      // Add total players count to each player for reference
      data.forEach(player => {
        player.totalPlayers = data.length;
      });
    })
    .catch(error => console.error('Error fetching players info:', error));
  },[roomcode]);
  
  useEffect(() => {
    if (actualPlayers.length > 0 && currentIndex < actualPlayers.length) {
      const currentPlayer = actualPlayers[currentIndex];
      setPlayerName(currentPlayer.name);
      
      const playerBasePrice = parseFloat(currentPlayer.basePrice) || 0;
      setBasePrice(playerBasePrice);
      
      // If no current bid is set, use the base price as the starting bid
      if (!currentBid) {
        setCurrentBid(playerBasePrice);
        setNextBidAmount(playerBasePrice); // First bid is base price
      }
      
      // Reset first bid status for new player
      setIsFirstBid(true);
    }
  }, [actualPlayers, currentIndex, currentBid]);

  useEffect(() => {
    if (isFirstBid) {
      setNextBidAmount(parseFloat(basePrice) || 0);
    } else {
      setNextBidAmount((parseFloat(currentBid) || 0) + 0.2);
    }
  }, [currentBid, isFirstBid, basePrice]);

  const handleTimer = (e) => {
    e.preventDefault();
    socket.emit("start-all-timer", roomcode);
  };

  // Check if user can afford the next bid
  const canAffordBid = () => {
    // If it's the first bid, check if purse can cover the base price
    if (isFirstBid) {
      return purseAmount >= (parseFloat(basePrice) || 0);
    }
    // Otherwise check if purse can cover the current bid + 0.2
    return purseAmount >= ((parseFloat(currentBid) || 0) + 0.2);
  };

  // Update handleBid to send isFirstBid and basePrice
  const handleBid = (e) => {
    e.preventDefault();
    
    // Check if user can afford the bid before proceeding
    if (!canAffordBid()) {
      console.log("Cannot afford bid");
      return;
    }
    
    // Log for debugging
    console.log("Placing bid:", {
      isFirstBid, 
      currentBid, 
      basePrice,
      currentIndex,
      playerName
    });
    
    // Send bid info to server
    socket.emit("continue-bid", { 
      currentBid, 
      socketId, 
      roomcode, 
      name,
      isFirstBid,
      basePrice
    });
    
    // After bid is placed, isFirstBid should be false
    setIsFirstBid(false);
  };

  // Handle socket events related to room info
  useEffect(() => {
    socket.on("room-size", (size) => {
      console.log(`Number of people in the room: ${size}`);
      setRoomSize(size);
    });
    
    socket.on("set-creator", (isCreator) => {
      setIsCreator(isCreator);
    });
    
    return () => {
      socket.off("room-size");
      socket.off("set-creator");
    };
  }, [socket]);

  // Handle timer related socket events
  useEffect(() => {
    socket.on("start-timer", (data) => {
      console.log("Timer started with value:", data);
      setIsTimerRunning(true);
      setTimerSynced(true);
      
      // If data is a number, use it to set timer
      if (typeof data === 'number') {
        setTimer(data);
      }
    });
    
    socket.on("sync-timer-update", (timerValue) => {
      setTimer(timerValue);
    });
    
    return () => {
      socket.off("start-timer");
      socket.off("sync-timer-update");
    };
  }, [socket]);

  // Set up timer interval when timer is running
  useEffect(() => {
    if (isTimerRunning) {
      // Clear any existing interval
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      
      // Set up new interval
      timerIntervalRef.current = setInterval(() => {
        setTimer((prevTimer) => {
          const newValue = prevTimer - 1;
          // Don't go below zero
          if (newValue <= 0) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
            // Notify server that timer is complete
            socket.emit("timer-complete", { roomcode, currentIdx: currentIndex });
            return 0;
          }
          // Sync with server every second
          socket.emit("sync-timer", { roomcode, timerValue: newValue });
          return newValue;
        });
      }, 1000);
    } else if (timerIntervalRef.current) {
      // Clear interval if timer is not running
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    
    // Clean up on unmount
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [isTimerRunning, roomcode, socket, currentIndex]);

  // Handle bid updates
  useEffect(() => {
    socket.on("add-bid", (data) => {
      const { newBid, socketId, name } = data;
      // Ensure the bid is a valid number
      const validBid = parseFloat(newBid) || 0;
      
      console.log("Received new bid:", validBid);
      
      // Update current bid and bidder info
      setCurrentBid(validBid);
      setBidId(socketId);
      setBidderName(name);
      setTimer(10);
      
      // No longer first bid for this player
      setIsFirstBid(false);
      
      // Calculate next bid amount (current bid + 0.2)
      const nextBid = validBid + 0.2;
      setNextBidAmount(nextBid);
      
      console.log(`Updated bid: ${validBid}, next bid will be: ${nextBid}`);
    });
    
    return () => socket.off("add-bid");
  }, [socket]);

  // Handle auction in progress (for reconnecting clients)
  useEffect(() => {
    socket.on("auction-in-progress", (data) => {
      console.log("Received auction in progress data:", data);
      const { currentIndex: serverIndex, isTimerRunning: serverTimerRunning, 
        timerValue: serverTimerValue, currentBidInfo } = data;
      
      // Sync state with server
      setCurrentIndex(serverIndex);
      setIsTimerRunning(serverTimerRunning);
      setTimer(serverTimerValue);
      
      // Set the base price from the current player
      if (actualPlayers.length > 0 && serverIndex < actualPlayers.length) {
        const playerBasePrice = parseFloat(actualPlayers[serverIndex].basePrice) || 0;
        setBasePrice(playerBasePrice);
        
        // Set default next bid amount to base price initially
        setNextBidAmount(playerBasePrice);
      }
      
      // If there's current bid info, use it
      if (currentBidInfo) {
        const bidAmount = parseFloat(currentBidInfo.bidAmount) || 0;
        setCurrentBid(bidAmount);
        setBidId(currentBidInfo.bidderId);
        setBidderName(currentBidInfo.bidderName);
        
        // Set next bid amount to current bid + 0.2
        setNextBidAmount(bidAmount + 0.2);
        
        // If we have a current bid, we're no longer on first bid
        setIsFirstBid(false);
      } else {
        // No bid placed yet - show "None" for current bid by setting it to null
        setCurrentBid(null);
        setIsFirstBid(true);
      }
    });
    
    socket.on("auction-ended", () => {
      setAuctionEnds(true);
    });
    
    return () => {
      socket.off("auction-in-progress");
      socket.off("auction-ended");
    };
  }, [socket, actualPlayers]);

  // Player timer ended logic
  useEffect(() => {
    if (timer === 0) {
      try {
        // If we don't have the players yet, don't do anything
        if (!actualPlayers.length || currentIndex >= actualPlayers.length) {
          return;
        }
        
        // Show sold/unsold message
        const status = bidId ? "sold" : "unsold";
        const currentPlayer = actualPlayers[currentIndex];
        setPlayerStatusMessage({
          status,
          player: currentPlayer.name,
          bidder: bidderName,
          price: currentBid
        });
        
        // Clear the message after 3 seconds
        if (statusTimeoutRef.current) {
          clearTimeout(statusTimeoutRef.current);
        }
        statusTimeoutRef.current = setTimeout(() => {
          setPlayerStatusMessage(null);
          statusTimeoutRef.current = null;
        }, 3000);
        
        socket.emit("player-status-update", {
          player: actualPlayers[currentIndex],
          status: status,
          buyer: bidderName,
          price: currentBid,
          roomcode: roomcode,
          currentIdx: currentIndex
        });

        if (currentIndex === actualPlayers.length - 1) {
          if (bidId === null) {
            setUnsoldList(prevList => [...prevList, actualPlayers[currentIndex]]);
          } else {
            setPlayerSold(prevList => [...prevList, actualPlayers[currentIndex]]);
            if (bidderName === name) {
              setManagerList(prevList => [...prevList, { ...actualPlayers[currentIndex], soldPrice: currentBid }]);
              // Purse amount is updated by the server via purse-update event
            }
          }
          setAuctionEnds(true);
        } else {
          const nextIndex = currentIndex + 1;
          
          if (bidId === null) {
            setUnsoldList(prevList => [...prevList, actualPlayers[currentIndex]]);
          } else {
            setPlayerSold(prevList => [...prevList, actualPlayers[currentIndex]]);
            if (bidderName === name) {
              setManagerList(prevList => [...prevList, { ...actualPlayers[currentIndex], soldPrice: currentBid }]);
              // Purse amount is updated by the server via purse-update event
            }
          }
          
          // Schedule the next player after message display
          if (transitionTimeoutRef.current) {
            clearTimeout(transitionTimeoutRef.current);
          }
          transitionTimeoutRef.current = setTimeout(() => {
            setIsTimerRunning(false);
            setTimer(10);
            setCurrentIndex(nextIndex);
            
            // Set up new player data
            if (nextIndex < actualPlayers.length) {
              const nextPlayer = actualPlayers[nextIndex];
              const nextPlayerBasePrice = parseFloat(nextPlayer.basePrice) || 0;
              
              console.log("Moving to next player with base price:", nextPlayerBasePrice);
              
              // Reset all bidding state for the new player
              setBasePrice(nextPlayerBasePrice);
              setCurrentBid(null); // Set to null initially to show "None"
              setNextBidAmount(nextPlayerBasePrice); // First bid will be base price
              setPlayerName(nextPlayer.name);
              
              // Reset bidding flags
              setIsFirstBid(true); // Critical: ensure first bid flag is reset
            }
            
            // Clear bidder info
            setBidId(null);
            setBidderName(null);
            
            transitionTimeoutRef.current = null;
          }, 3000);
        }
      } catch (error) {
        console.error("Error during player transition:", error);
      }
    }
    
    // Clean up timeouts on unmount or when timer changes
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
        statusTimeoutRef.current = null;
      }
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }
    };
  }, [timer, currentIndex, actualPlayers, bidId, bidderName, name, currentBid, roomcode, socket]);

  useEffect(() => {
    socket.on("room-users", (users) => {
      setRoomUsers(users);
    });

    socket.on("room-full", () => {
      alert("Room has reached maximum capacity (10 users)");
      navigate('/');
    });

    socket.on("user-kicked", () => {
      alert("You have been removed from the room");
      navigate('/');
    });

    socket.on("bid-update", ({ bidder, amount }) => {
      setLastBidder(`${bidder} bid ${amount.toFixed(2)} Cr`);
    });

    socket.on("player-won", ({ player, winner, amount }) => {
      setWinningBid(`${player} sold to ${winner} for ${amount.toFixed(2)} Cr`);
    });

    socket.on("auction-state-update", (newState) => {
      setAuctionState(newState);
      
      // Ensure that we don't have duplicate players in the team lists
      if (newState.teamPlayers[name]) {
        // Create a new array with only unique players by ID
        const uniquePlayers = [];
        const playerIds = new Set();
        
        newState.teamPlayers[name].forEach(player => {
          if (!playerIds.has(player._id)) {
            playerIds.add(player._id);
            uniquePlayers.push(player);
          }
        });
        
        setManagerList(uniquePlayers);
      } else {
        setManagerList([]);
      }
      
      // Deduplicate soldPlayers list
      const uniqueSoldPlayers = [];
      const soldPlayerIds = new Set();
      newState.soldPlayers.forEach(player => {
        if (!soldPlayerIds.has(player._id)) {
          soldPlayerIds.add(player._id);
          uniqueSoldPlayers.push(player);
        }
      });
      setPlayerSold(uniqueSoldPlayers);
      
      // Deduplicate unsoldPlayers list
      const uniqueUnsoldPlayers = [];
      const unsoldPlayerIds = new Set();
      newState.unsoldPlayers.forEach(player => {
        if (!unsoldPlayerIds.has(player._id)) {
          unsoldPlayerIds.add(player._id);
          uniqueUnsoldPlayers.push(player);
        }
      });
      setUnsoldList(uniqueUnsoldPlayers);
    });

    socket.on("purse-update", ({ newPurse }) => {
      const oldPurse = purseAmount;
      const parsedNewPurse = parseFloat(newPurse) || 0;
      
      // Only update if there's actually a change
      if (parsedNewPurse !== oldPurse) {
        console.log(`Updating purse: ${oldPurse} -> ${parsedNewPurse} (changed by ${parsedNewPurse - oldPurse} Cr)`);
        setPurseAmount(parsedNewPurse);
      }
    });

    socket.on("bid-error", ({ message }) => {
      console.error(`Bid error: ${message}`);
      // Could display a temporary error message to the user here
    });

    return () => {
      socket.off("room-users");
      socket.off("room-full");
      socket.off("user-kicked");
      socket.off("bid-update");
      socket.off("player-won");
      socket.off("auction-state-update");
      socket.off("purse-update");
      socket.off("bid-error");
    };
  }, [name, navigate, socket]);

  const handleKickUser = (userId) => {
    if (isCreator) {
      socket.emit("kick-user", { roomcode, userId });
    }
  };

  // Initialize background music with autoplay policy considerations
  useEffect(() => {
    if (!isLoading) {
      // Create audio element for background music
      const audioElement = new Audio('/sounds/ipl_melody.mp3');
      audioElement.loop = true;
      audioElement.volume = musicVolume;
      
      // Set up the background music
      backgroundMusicRef.current = audioElement;
      
      // Function to initialize audio on user interaction
      const initializeAudio = () => {
        if (isMusicPlaying && backgroundMusicRef.current) {
          backgroundMusicRef.current.play().catch(error => {
            console.log("Background music playback failed:", error);
            // If autoplay fails, we'll rely on user clicking the music button
            setIsMusicPlaying(false);
          });
        }
        
        // Hide autoplay notice once user has interacted
        setShowAutoplayNotice(false);
        
        // Remove event listeners after first interaction
        document.removeEventListener('click', initializeAudio);
        document.removeEventListener('touchstart', initializeAudio);
      };
      
      // Add event listeners for user interaction to satisfy autoplay policies
      document.addEventListener('click', initializeAudio);
      document.addEventListener('touchstart', initializeAudio);
      
      // Try to play immediately (might fail due to browser autoplay policy)
      if (isMusicPlaying) {
        backgroundMusicRef.current.play().catch(() => {
          // Show autoplay notice if initial play attempt fails
          setShowAutoplayNotice(true);
        });
      }
      
      return () => {
        // Clean up audio and event listeners on unmount
        document.removeEventListener('click', initializeAudio);
        document.removeEventListener('touchstart', initializeAudio);
        
        if (backgroundMusicRef.current) {
          backgroundMusicRef.current.pause();
          backgroundMusicRef.current.src = '';
        }
      };
    }
  }, [isLoading, musicVolume, isMusicPlaying]);

  // Handle music toggle with localStorage
  const handleMusicToggle = () => {
    setIsMusicPlaying(prevState => {
      const newState = !prevState;
      
      if (backgroundMusicRef.current) {
        if (newState) {
          backgroundMusicRef.current.play().catch(error => {
            console.log("Background music playback failed:", error);
          });
        } else {
          backgroundMusicRef.current.pause();
        }
      }
      
      // Save to localStorage
      localStorage.setItem('auctionMusicPlaying', newState.toString());
      
      return newState;
    });
  };

  // Handle volume change with localStorage
  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setMusicVolume(newVolume);
    
    // Save to localStorage
    localStorage.setItem('auctionMusicVolume', newVolume.toString());
    
    // Update audio volume immediately if it exists
    if (backgroundMusicRef.current) {
      backgroundMusicRef.current.volume = newVolume;
    }
  };

  if (isLoading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="auction-container">
      {/* Display autoplay notice if needed */}
      {showAutoplayNotice && (
        <div className="autoplay-notice">
          <p>Click anywhere to enable music 🎵</p>
        </div>
      )}

      <div className="user-info" style={{ position: 'absolute', top: '20px', right: '20px' }}>
        <p>Welcome, {name}</p>
        <p className="purse-info">Purse: ₹{purseAmount.toFixed(2)} Cr</p>
        {/* Add music controls */}
        <div className="music-controls">
          <button 
            className="music-toggle" 
            onClick={handleMusicToggle}
            title={isMusicPlaying ? "Pause Music" : "Play Music"}
          >
            {isMusicPlaying ? "🔊" : "🔇"}
          </button>
          <div className="volume-control">
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={musicVolume}
              onChange={handleVolumeChange}
              className="volume-slider"
              title={`Volume: ${Math.round(musicVolume * 100)}%`}
            />
            <div className="volume-level">
              <div 
                className="volume-fill" 
                style={{ width: `${musicVolume * 100}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {!isTimerRunning && !playerStatusMessage && (
        <div className="room-status">
          <h2>Room Participants ({roomUsers.length}/10)</h2>
          <div className="users-list">
            {roomUsers.map(user => (
              <div key={user.id} className="user-item">
                <span>{user.name}</span>
                {isCreator && user.id !== socketId && (
                  <button onClick={() => handleKickUser(user.id)}>Kick</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Display sold/unsold message */}
      {playerStatusMessage && (
        <div className="player-status-message">
          <h2>
            {playerStatusMessage.player} is {playerStatusMessage.status.toUpperCase()}
            {playerStatusMessage.status === "sold" ? 
              ` to ${playerStatusMessage.bidder} for ₹${playerStatusMessage.price.toFixed(2)} Cr` : 
              ""}
          </h2>
        </div>
      )}

      {isTimerRunning && (
        <div className="bid-status">
          {lastBidder && <p className="last-bid">{lastBidder}</p>}
          {winningBid && <p className="winning-bid">{winningBid}</p>}
        </div>
      )}

      {auctionEnds ? (
        <div className="auction-results">
          <h1>Auction Complete!</h1>
          
          {/* Back button when viewing team details or unsold players */}
          {(selectedManager || viewingUnsold) && (
            <button 
              className="back-btn" 
              onClick={() => {
                setSelectedManager(null);
                setViewingUnsold(false);
                setActiveTab('all'); // Reset active tab
              }}
            >
              Back to All Managers
            </button>
          )}
          
          {/* Unsold players view */}
          {viewingUnsold && (
            <div className="unsold-players-view">
              <h2>Unsold Players</h2>
              
              {/* Unsold player type tabs */}
              <div className="player-type-tabs">
                <button 
                  className={`type-tab ${activeTab === 'all' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('all');
                    document.getElementById('all-unsold').scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  All ({unsoldList.length})
                </button>
                <button 
                  className={`type-tab ${activeTab === 'batsmen' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('batsmen');
                    document.getElementById('batsmen-unsold').scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  Batsmen ({unsoldList.filter(p => p.playerType && p.playerType.toLowerCase().includes('bat')).length})
                </button>
                <button 
                  className={`type-tab ${activeTab === 'bowlers' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('bowlers');
                    document.getElementById('bowlers-unsold').scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  Bowlers ({unsoldList.filter(p => p.playerType && p.playerType.toLowerCase().includes('bowl')).length})
                </button>
                <button 
                  className={`type-tab ${activeTab === 'allrounders' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('allrounders');
                    document.getElementById('allrounders-unsold').scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  All Rounders ({unsoldList.filter(p => p.playerType && p.playerType.toLowerCase().includes('all')).length})
                </button>
                <button 
                  className={`type-tab ${activeTab === 'keepers' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('keepers');
                    document.getElementById('keepers-unsold').scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  Wicket Keepers ({unsoldList.filter(p => p.playerType && p.playerType.toLowerCase().includes('keeper')).length})
                </button>
              </div>
              
              <div id="all-unsold" className="player-type-section">
                <h3>All Unsold Players</h3>
                <div className="player-grid">
                  {unsoldList.map((player) => (
                    <div key={player._id} className="player-card">
                      <h3>{player.name}</h3>
                      <p>Team: {player.team}</p>
                      <p>Type: {player.playerType}</p>
                      <p>Points: {player.point}</p>
                      <p className="price">Base: ₹{(player.basePrice).toFixed(2)} Cr</p>
                    </div>
                  ))}
                </div>
              </div>
              
              <div id="batsmen-unsold" className="player-type-section">
                <h3>Batsmen</h3>
                <div className="player-grid">
                  {unsoldList.filter(p => p.playerType && p.playerType.toLowerCase().includes('bat')).map((player) => (
                    <div key={player._id} className="player-card">
                      <h3>{player.name}</h3>
                      <p>Team: {player.team}</p>
                      <p>Type: {player.playerType}</p>
                      <p>Points: {player.point}</p>
                      <p className="price">Base: ₹{(player.basePrice).toFixed(2)} Cr</p>
                    </div>
                  ))}
                </div>
              </div>
              
              <div id="bowlers-unsold" className="player-type-section">
                <h3>Bowlers</h3>
                <div className="player-grid">
                  {unsoldList.filter(p => p.playerType && p.playerType.toLowerCase().includes('bowl')).map((player) => (
                    <div key={player._id} className="player-card">
                      <h3>{player.name}</h3>
                      <p>Team: {player.team}</p>
                      <p>Type: {player.playerType}</p>
                      <p>Points: {player.point}</p>
                      <p className="price">Base: ₹{(player.basePrice).toFixed(2)} Cr</p>
                    </div>
                  ))}
                </div>
              </div>
              
              <div id="allrounders-unsold" className="player-type-section">
                <h3>All Rounders</h3>
                <div className="player-grid">
                  {unsoldList.filter(p => p.playerType && p.playerType.toLowerCase().includes('all')).map((player) => (
                    <div key={player._id} className="player-card">
                      <h3>{player.name}</h3>
                      <p>Team: {player.team}</p>
                      <p>Type: {player.playerType}</p>
                      <p>Points: {player.point}</p>
                      <p className="price">Base: ₹{(player.basePrice).toFixed(2)} Cr</p>
                    </div>
                  ))}
                </div>
              </div>
              
              <div id="keepers-unsold" className="player-type-section">
                <h3>Wicket Keepers</h3>
                <div className="player-grid">
                  {unsoldList.filter(p => p.playerType && p.playerType.toLowerCase().includes('keeper')).map((player) => (
                    <div key={player._id} className="player-card">
                      <h3>{player.name}</h3>
                      <p>Team: {player.team}</p>
                      <p>Type: {player.playerType}</p>
                      <p>Points: {player.point}</p>
                      <p className="price">Base: ₹{(player.basePrice).toFixed(2)} Cr</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          {/* Selected manager's team view */}
          {selectedManager && !viewingUnsold && (
            <div className="manager-team-view">
              <h2>{selectedManager}'s Team</h2>
              
              <div className="team-stats">
                {auctionState.teamPlayers[selectedManager] && (
                  <>
                    <p>Total Players: {auctionState.teamPlayers[selectedManager].length}</p>
                    <p>Total Spent: ₹{auctionState.teamPlayers[selectedManager].reduce((sum, p) => sum + (p.price || 0), 0).toFixed(2)} Cr</p>
                  </>
                )}
              </div>
              
              <div className="player-grid">
                {auctionState.teamPlayers[selectedManager] && auctionState.teamPlayers[selectedManager].map((player) => (
                  <div key={player._id} className="player-card">
                    <h3>{player.name}</h3>
                    <p>Team: {player.team}</p>
                    <p>Type: {player.playerType}</p>
                    <p>Points: {player.point}</p>
                    <p className="price">₹{(player.price).toFixed(2)} Cr</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Managers list view - show only when not viewing a specific manager or unsold players */}
          {!selectedManager && !viewingUnsold && (
            <div>
              <div className="managers-list">
                <h2>All Managers</h2>
                {Object.keys(auctionState.teamPlayers).map((managerName) => (
                  <div 
                    key={managerName} 
                    className="manager-card"
                    onClick={() => setSelectedManager(managerName)}
                  >
                    <h3>{managerName}</h3>
                    <p>Players: {auctionState.teamPlayers[managerName].length}</p>
                    <p>Spent: ₹{auctionState.teamPlayers[managerName].reduce((sum, p) => sum + (p.price || 0), 0).toFixed(2)} Cr</p>
                  </div>
                ))}
              </div>
              
              <button 
                className="unsold-btn"
                onClick={() => setViewingUnsold(true)}
              >
                View Unsold Players ({unsoldList.length})
              </button>
              
              <div className="results-container">
                <div className="my-team">
                  <h2>My Team</h2>
                  <div className="team-stats">
                    <p>Total Players: {managerList.length}</p>
                    <p>Total Spent: ₹{managerList.reduce((sum, p) => sum + (p.soldPrice || p.price), 0).toFixed(2)} Cr</p>
                    <p>Remaining Purse: ₹{purseAmount.toFixed(2)} Cr</p>
                  </div>
                  <div className="player-grid">
                    {managerList.map((player) => (
                      <div key={player._id} className="player-card">
                        <h3>{player.name}</h3>
                        <p>Team: {player.team}</p>
                        <p>Type: {player.playerType}</p>
                        <p>Points: {player.point}</p>
                        <p className="price">₹{(player.soldPrice || player.price).toFixed(2)} Cr</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="auction-summary">
                  <h2>Auction Summary</h2>
                  <p>Total Players Sold: {playerSold.length}</p>
                  <p>Total Players Unsold: {unsoldList.length}</p>
                  <p>Total Players: {playerSold.length + unsoldList.length}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="auction-live-container">
          {/* Team sidebar */}
          <div className="team-sidebar">
            <div className="sidebar-header">
              <h3>My Team</h3>
              <p>Remaining Purse: ₹{purseAmount.toFixed(2)} Cr</p>
              <button 
                className="toggle-sidebar-btn"
                onClick={() => setShowTeamSidebar(!showTeamSidebar)}
              >
                {showTeamSidebar ? "Hide" : "Show"}
              </button>
            </div>
            
            {showTeamSidebar && (
              <div className="sidebar-content">
                {managerList.length === 0 ? (
                  <div className="no-players-yet">
                    <p>No Players Yet</p>
                  </div>
                ) : (
                  <div className="sidebar-players">
                    {managerList.map((player) => (
                      <div key={player._id} className="sidebar-player-card">
                        <h4>{player.name}</h4>
                        <div className="player-details">
                          <span>{player.playerType}</span>
                          <span className="player-price">₹{(player.soldPrice || player.price).toFixed(2)} Cr</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="auction-live">
            <div className="auction-header">
              <h1>Live Auction</h1>
              <p className="room-info">Room: {roomcode} | Players: {roomSize}</p>
            </div>
            <div className="current-player">
              {playerName && (
                <div className="player-info">
                  <h2>{playerName}</h2>
                  <div className="price-info">
                    <div className="price-box">
                      <div className="price-label">Base Price</div>
                      <div className="price-value">₹{basePrice ? basePrice.toFixed(2) : '0.00'} Cr</div>
                    </div>
                    <div className="price-box current">
                      <div className="price-label">Current Bid</div>
                      <div className="price-value">
                        {bidId ? `₹${currentBid.toFixed(2)} Cr` : 'None'}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="auction-controls">
              <div className="timer">
                <p>{timer}s</p>
              </div>
              <div className="bid-controls">
                {isCreator && (
                  <button className="start-btn" onClick={handleTimer} disabled={isTimerRunning}>
                    Start Bidding
                  </button>
                )}
                <button className="bid-btn" onClick={handleBid} disabled={!isTimerRunning || bidId === socketId || !canAffordBid()}>
                  Place Bid
                </button>
              </div>
            </div>
            {statement && <p className="status-message">{statement}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
export default App