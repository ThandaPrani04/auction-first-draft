import React from 'react'
import { useEffect,useMemo,useState } from 'react';
import {io} from 'socket.io-client';
import Cookies from 'js-cookie';
import { useNavigate } from 'react-router-dom';
import './App.css'; // Import the CSS file
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
  const [unsoldPlayers, setUnsoldPlayers] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [secondRound, setSecondRound] = useState(false);
  const [isSecondRoundStarted, setIsSecondRoundStarted] = useState(false);
  const [roomSize, setRoomSize]=useState(null);
  const [secondRoundPause, setSecondRoundPause]=useState(false);
  const [auctionEnds, setAuctionEnds]=useState(false);
  const navigate = useNavigate();
  const socket = useMemo(
    () =>
      io("http://localhost:3000", {
        withCredentials: true,
      }),
    []
  );

  useEffect(() => {
    const checkCookies = () => {
      const roomCode = Cookies.get('RoomCode');
      const userName = Cookies.get('userName');
      if (!roomCode && !userName) {  
        navigate('/joinroom');
      } else if (!roomCode) {
        navigate('/getroomcode');
      } else if (!userName) {
        navigate('/getusername'); 
      } else {
        setName(userName);
        setRoomCode(roomCode);
      }
    };
    checkCookies();
  }, [navigate]);

  
  function statechange() {
    setStatement(null);
  }

  function setStatechange(callback) {
    setTimeout(callback, 3000); // 3000 milliseconds = 3 seconds
  }

  useEffect(()=>{
    socket.on("connect",() =>{
      setSocketId(socket.id);
      console.log("connected", socket.id);
      
    })
    return () => {
      socket.disconnect();
    }
  },[])
  useEffect(()=>{
    console.log(roomcode)
    socket.emit("join-room",roomcode)
      
  },[roomcode])
  
  const handleShowPlayersInfo = () => {
    setShowPlayersInfo(prevState => !prevState);
  };

  const handleManagerPlayersInfo = () => {
    setManagerPlayersInfo(prevState => !prevState);
    
  };
  
  useEffect(()=>{
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
    .then(data => 
      setActualPlayers(data))
      
    .catch(error => console.error('Error fetching players info:', error));
  },[roomcode])
  
  useEffect(() => {
    console.log(actualPlayers)
    if (actualPlayers.length > 0) {
      setCurrentBid(actualPlayers[0].basePrice);
      setPlayerName(actualPlayers[currentIndex].name);
    }
  }, [actualPlayers]);

  const handleTimer = (e) => {
    e.preventDefault();
    socket.emit("start-all-timer",roomcode);
  };

  const handleBid = (e) => {
    e.preventDefault();
    socket.emit("continue-bid", { currentBid, socketId, roomcode, name});
  };

  const handleSecondRound = () => {
    console.log(selectedPlayers)
    socket.emit("second-round",selectedPlayers);
    
    //setSecondRound(false);
    setUnsoldPlayers(false);
    setIsTimerRunning(false);
    setTimer(10);
  };

  useEffect(() => {
    socket.on("second-round-final", (data) => {
      console.log(data);
      setActualPlayers(data);
      setSecondRoundPause(false);
    })
  }, []);
  useEffect(() => {
    socket.on("room-size", (size) => {
      console.log(`Number of people in the room: ${size}`);
      setRoomSize(size);
    })
  }, []);

  useEffect(() => {
    socket.on("start-timer", (data) => {
      setIsTimerRunning(true);
    })
  }, []);

  useEffect(() => {
    let intervalId;
    if(isTimerRunning){
      intervalId = setInterval(() => {
        setTimer((prevTimer) => prevTimer - 1);
      }, 1000);
    }
    return () => {
      clearInterval(intervalId); 
    };
  }, [isTimerRunning]);

  useEffect(()=>{
    socket.on("add-bid",(data) =>{
      const { newBid, socketId, name } = data;
      setCurrentBid(newBid);
      setBidId(socketId)
      setBidderName(name)
      setTimer(10);
    })
  },[socket])

  useEffect(()=>{
    if(timer==0 && secondRound && (currentIndex==actualPlayers.length-1)){
      if(bidId==null){
        console.log(`${actualPlayers[currentIndex].name} unsold`)
        setStatement(`${actualPlayers[currentIndex].name} unsold`)
        setUnsoldList((prevList) => [...prevList, actualPlayers[currentIndex]]);
        setStatechange(statechange)
      }else{
        console.log(`${actualPlayers[currentIndex].name} sold to manager with username: ${bidderName} at ${currentBid.toFixed(2)}`)
        setStatement(`${actualPlayers[currentIndex].name} sold to manager with username: ${bidderName} at ${currentBid.toFixed(2)}`)
        setPlayerSold((prevList) => [...prevList, actualPlayers[currentIndex]]);
        if (bidderName === name) {
          setManagerList((prevList) => [...prevList, { ...actualPlayers[currentIndex], soldPrice: currentBid }]);
        }
        setStatechange(statechange)
      }
      
      setAuctionEnds(true);
    }
    if(timer==0 && (currentIndex<actualPlayers.length-1)){
      if(bidId==null){
        console.log(`${actualPlayers[currentIndex].name} unsold`)
        setStatement(`${actualPlayers[currentIndex].name} unsold`)
        setUnsoldList((prevList) => [...prevList, actualPlayers[currentIndex]]);
        setStatechange(statechange)
      }else{
        console.log(`${actualPlayers[currentIndex].name} sold to manager with username: ${bidderName} at ${currentBid.toFixed(2)}`)
        setStatement(`${actualPlayers[currentIndex].name} sold to manager with username: ${bidderName} at ${currentBid.toFixed(2)}`)
        setPlayerSold((prevList) => [...prevList, actualPlayers[currentIndex]]);
        if (bidderName === name) {
          setManagerList((prevList) => [...prevList, { ...actualPlayers[currentIndex], soldPrice: currentBid }]);
        }
        setStatechange(statechange)
      }
      setIsTimerRunning (false)
      setTimer(10)
      setCurrentIndex(prevIndex => prevIndex+1)
      setCurrentBid(actualPlayers[currentIndex + 1].basePrice);
      setPlayerName(actualPlayers[currentIndex+1].name);
      setBidId(null)
    }else if(timer==0  && !isSecondRoundStarted){
      if(bidId==null){
        console.log(`${actualPlayers[currentIndex].name} unsold`)
        setUnsoldList((prevList) => [...prevList, actualPlayers[currentIndex]]);
      }else{
        console.log(`${actualPlayers[currentIndex].name} sold to manager with username: ${bidderName} at ${currentBid.toFixed(2)}`)
        setStatement(`${actualPlayers[currentIndex].name} sold to manager with username: ${bidderName} at ${currentBid.toFixed(2)}`)
        setStatechange(statechange)

        setPlayerSold((prevList) => [...prevList, actualPlayers[currentIndex]]);
        if (bidderName === name) {
          setManagerList((prevList) => [...prevList, { ...actualPlayers[currentIndex], soldPrice: currentBid }]);
        }
      }
      setSecondRoundPause(true);
      setIsTimerRunning (false)
      setTimer(10)
      setBidId(null)
      setCurrentIndex(0);
      setSecondRound(true); 
      setUnsoldPlayers(true);
      setIsSecondRoundStarted(true);
    }
  },[timer])

  const handlePlayerSelection = (player) => {
    setSelectedPlayers(prevSelected => {
      if (prevSelected.includes(player)) {
        return prevSelected.filter(p => p !== player);
      } else {
        if (prevSelected.length < 5) {
          return [...prevSelected, player];
        } else {
          return prevSelected;
        }
      }
    });
  };

  const startSecondRound = () => {
    if (selectedPlayers.length <= 5) {
      handleSecondRound();
      
    } else {
      alert("You can select atmost 5 players for the second round.");
    }
  };

  
  return (
    <div>
      {auctionEnds ? (
        <h1>Auction Ends, thank you for participating</h1>
      ) : (
        <div>
          {secondRound ? (<p>Auction Second Round</p>) : (<p><br></br></p>)}
          {timer >= 0 ? (<p>Timer: {timer}s</p>) : (<p>Timer: 0s</p>)}
          {currentBid > 0 ? (<p>{currentBid.toFixed(2)} Cr</p>) : (<p><br></br></p>)}
          {playerName != null ? (<p>{playerName}</p>) : (<p><br></br></p>)}
          <button onClick={handleTimer} disabled={isTimerRunning || secondRoundPause}>Start</button>
          <button onClick={handleBid} disabled={!isTimerRunning || (bidId == socketId)}>Bid</button>
          <p>Socket ID: {socketId}</p>
          <p>Room Code: {roomcode}</p>
          {statement != null ? (<p>{statement}</p>) : (<p><br></br></p>)}
          {name != null ? (<p>Username: {name}</p>) : (<p><br></br></p>)}
          <button onClick={handleShowPlayersInfo}>
            {showPlayersInfo ? 'Hide All Players Info' : 'Show All Players Info'}
          </button>
          {showPlayersInfo && playersInfo.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Team</th>
                  <th>Set</th>
                  <th>Player Type</th>
                  <th>Base Price</th>
                  <th>Points</th>
                </tr>
              </thead>
              <tbody>
                {playersInfo.map(player => (
                  <tr key={player._id}>
                    <td>{player.name}</td>
                    <td>{player.team}</td>
                    <td>{player.set}</td>
                    <td>{player.playerType}</td>
                    <td>{player.basePrice}</td>
                    <td>{player.point}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button onClick={handleManagerPlayersInfo}>
            {managerPlayersInfo ? 'Hide My Players Info' : 'Show My Players Info'}
          </button>
          {managerPlayersInfo && managerList.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Team</th>
                  <th>Set</th>
                  <th>Player Type</th>
                  <th>Base Price</th>
                  <th>Points</th>
                  <th>Sold Price</th>
                </tr>
              </thead>
              <tbody>
                {managerList.map(player => (
                  <tr key={player._id}>
                    <td>{player.name}</td>
                    <td>{player.team}</td>
                    <td>{player.set}</td>
                    <td>{player.playerType}</td>
                    <td>{player.basePrice}</td>
                    <td>{player.point}</td>
                    <td>{player.soldPrice.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {unsoldPlayers && (
            <div>
              <h2>Unsold Players</h2>
              {unsoldList.length > 0 ? (
                <div>
                  <p>Select at most 5 players for the second round of auction:</p>
                  {unsoldList.map(player => (
                    <div key={player._id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={selectedPlayers.includes(player)}
                          onChange={() => handlePlayerSelection(player)}
                          disabled={!selectedPlayers.includes(player) && selectedPlayers.length >= 5}
                        />
                        {player.name} - Base Price: {player.basePrice}
                      </label>
                    </div>
                  ))}
                  <button onClick={startSecondRound}>Start Second Round Auction</button>
                </div>
              ) : (
                <p>No unsold players available.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export default App