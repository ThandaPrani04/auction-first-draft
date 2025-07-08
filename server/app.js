import express from "express";
import {Server} from "socket.io";
import {createServer} from "http";
import cors from "cors"
import mongoose from "mongoose";
import bodyParser from "body-parser";
import dotenv from 'dotenv';
dotenv.config();
const mongoUri = process.env.MONGO_URI;
// const username = process.env.MONGO_USERNAME;
// const password = process.env.MONGO_PASSWORD;
const front=process.env.CLIENT;
const port = process.env.PORT || 3000;
mongoose.connect(mongoUri);
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

const app=express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
      origin:front,
      methods: ["GET", "POST"],
      credentials: true,
    },
});
  
app.use(
    cors({
      origin:front,
      methods: ["GET", "POST"],
      credentials: true,
    })
);
app.use(bodyParser.json());

const setno=3;

const playerSchema = new mongoose.Schema({
    name: String,
    team: String,
    set: Number,
    playerType: String,
    basePrice: Number,
    point: Number
});

function createModel(collectionName) {
    return mongoose.model(collectionName, playerSchema);
}

const Player = mongoose.model("og_players", playerSchema);

app.get("/",(req,res) => {
    res.send("Hello, world!")
})

app.get("/players", async (req, res) => {
    try{
      const players = await Player.find({});
      res.json(players);
    }catch (error) {
      res.status(500).json({ error: error.message });
    }
});

app.post("/shuffledplayers/:collectionName", async (req, res) => {
    try{
        const collectionName1 = req.params.collectionName;
        const collectionName=collectionName1.toLowerCase()+"_players";
        const ShuffledPlayerModel = createModel(collectionName);
        const shuffledPlayers = await ShuffledPlayerModel.find({});
        res.status(200).json(shuffledPlayers);
        console.log(shuffledPlayers)
    }catch (error) {
        console.error('Error occurred:', error);
        res.status(500).send('An error occurred');
    }
});

app.post('/roomcode', async (req, res) => {
    try {
      const code = req.body.code; // Assuming the request body contains the 8-digit code
      
      // Define an array to hold the shuffled players
      const shuffledPlayers = [];
  
      // Iterate over each set
      for (let i = 1; i <= setno; i++) {    
        // Fetch players from the current set
        const players = await Player.find({ set: i });
  
        // Shuffle the players
        shuffleArray(players);
        players.forEach(player => {
            player._id = new mongoose.Types.ObjectId(); // Generate new ObjectId
        });
        // Append shuffled players to the shuffledPlayers array
        shuffledPlayers.push(...players);
      }
  
      // Create a new collection with the shuffled players
      const newCollectionName = `${code}_players`;
      const NewCollectionModel = mongoose.model(newCollectionName, playerSchema);
      await NewCollectionModel.insertMany(shuffledPlayers);
  
      res.status(200).send(`Shuffled collection created with name: ${newCollectionName}`);
    } catch (error) {
      console.error('Error occurred:', error);
      res.status(500).send('An error occurred');
    }
});

// New endpoint to check if a room exists
app.get('/check-room/:roomcode', async (req, res) => {
  try {
    const roomcode = req.params.roomcode;
    
    // Check if roomcode exists in our roomState
    if (roomState.auction[roomcode]) {
      return res.status(200).json({ exists: true });
    }
    
    // If not in roomState, check if collection exists in database
    const collectionName = `${roomcode}_players`;
    const collections = await mongoose.connection.db.listCollections().toArray();
    const exists = collections.some(col => col.name === collectionName);
    
    if (exists) {
      // Initialize the room state if it doesn't exist yet
      if (!roomState.auction[roomcode]) {
        roomState.auction[roomcode] = {
          soldPlayers: [],
          unsoldPlayers: [],
          teamPlayers: {},
          // Helper Sets to track player IDs that have already been added
          soldPlayerIds: new Set(),
          unsoldPlayerIds: new Set()
        };
      }
      return res.status(200).json({ exists: true });
    }
    
    // Room doesn't exist
    return res.status(404).json({ exists: false, message: "Room not found" });
  } catch (error) {
    console.error('Error checking room:', error);
    return res.status(500).json({ error: "Server error checking room" });
  }
});

const roomState = {
    arrays: {},
    sizes: {},
    secondConfirmation: {},
    users: {},
    creators: {},
    bidHistory: {},
    auction: {},
    currentPlayerIndex: {},
    isTimerRunning: {},
    timerValue: {},
    auctionStarted: {},
    currentBidInfo: {},
    userPurse: {},
    // Add a registry to track processed players
    processedPlayers: {}
};

io.on("connection", (socket) => {
    console.log("Id", socket.id);
    let previousRoomCode = null;
    socket.auth = {};

    socket.on("join-room", (roomcode) => {
        // Store auth data for reconnection purposes
        const userName = socket.handshake.auth.userName || "Anonymous";
        socket.auth.userName = userName;
        socket.auth.roomcode = roomcode;
        
        // Check room capacity
        const currentUsers = roomState.users[roomcode] || [];
        if (currentUsers.length >= 10) {
            socket.emit("room-full");
            return;
        }

        // First user becomes creator
        if (currentUsers.length === 0) {
            roomState.creators[roomcode] = socket.id;
            socket.emit("set-creator", true);
        }

        // Add user to room
        roomState.users[roomcode] = [...currentUsers.filter(u => u.id !== socket.id), { id: socket.id, name: userName }];

        // Join socket room
        socket.join(roomcode);
        io.to(roomcode).emit("room-users", roomState.users[roomcode]);
        
        // Initialize room state if needed
        if (!roomState.arrays[roomcode]) {
            roomState.arrays[roomcode] = [];
        }
        
        // Initialize bid history object if needed
        if (!roomState.bidHistory) {
            roomState.bidHistory = {};
        }
        
        // Initialize user purse if not done already
        if (!roomState.userPurse) {
            roomState.userPurse = {};
        }
        
        if (!roomState.userPurse[roomcode]) {
            roomState.userPurse[roomcode] = {};
        }
        
        // Set initial purse for user if not already set
        if (!roomState.userPurse[roomcode][socket.id]) {
            roomState.userPurse[roomcode][socket.id] = 120; // Initial purse of 120Cr
        }

        previousRoomCode = roomcode;
        roomState.sizes[roomcode] = io.sockets.adapter.rooms.get(roomcode)?.size || 0;
        io.to(roomcode).emit("room-size", roomState.sizes[roomcode]);

        // Initialize auction state if needed
        if (!roomState.auction[roomcode]) {
            roomState.auction[roomcode] = {
                soldPlayers: [],
                unsoldPlayers: [],
                teamPlayers: {},
                // Helper Sets to track player IDs that have already been added
                soldPlayerIds: new Set(),
                unsoldPlayerIds: new Set()
            };
            roomState.currentPlayerIndex[roomcode] = 0;
            roomState.isTimerRunning[roomcode] = false;
            roomState.timerValue[roomcode] = 10;
            roomState.auctionStarted[roomcode] = false;
            roomState.currentBidInfo[roomcode] = null;
        }

        // Send complete auction state to reconnecting user
        socket.emit("auction-state-update", roomState.auction[roomcode]);
        
        // Send current purse amount
        if (roomState.userPurse[roomcode] && roomState.userPurse[roomcode][socket.id]) {
            socket.emit("purse-update", {
                newPurse: roomState.userPurse[roomcode][socket.id]
            });
        }
        
        // Send current auction details if auction has started
        if (roomState.auctionStarted[roomcode]) {
            socket.emit("auction-in-progress", {
                currentIndex: roomState.currentPlayerIndex[roomcode],
                isTimerRunning: roomState.isTimerRunning[roomcode],
                timerValue: roomState.timerValue[roomcode],
                currentBidInfo: roomState.currentBidInfo[roomcode]
            });
            
            // Restart timer if it was running
            if (roomState.isTimerRunning[roomcode]) {
                socket.emit("start-timer", roomState.timerValue[roomcode]);
            }
        }
    });

    socket.on("start-all-timer",(roomcode)=>{
        // Check if the request is coming from the room creator
        if (roomState.creators[roomcode] !== socket.id) {
            console.log(`Non-creator ${socket.id} attempted to start timer in room ${roomcode}`);
            return; // Silently reject if not the creator
        }
        
        console.log(`Room creator ${socket.id} started timer in room ${roomcode}`);
        roomState.isTimerRunning[roomcode] = true;
        roomState.auctionStarted[roomcode] = true;
        roomState.timerValue[roomcode] = 10;
        io.to(roomcode).emit("start-timer", 10);
    });
    
    // Handle player timer completion
    socket.on("timer-complete", ({roomcode, currentIdx}) => {
        // Ensure we don't process duplicate timer completions
        if (roomState.currentPlayerIndex[roomcode] !== currentIdx) {
            return; // Ignore if we've already moved past this player
        }
        
        roomState.isTimerRunning[roomcode] = false;
        // Reset for next player
        roomState.timerValue[roomcode] = 10;
    });
    
    // New event to sync timer across clients
    socket.on("sync-timer", ({roomcode, timerValue}) => {
        // Ensure timer never goes below zero
        roomState.timerValue[roomcode] = Math.max(0, timerValue);
        // Don't broadcast to sender
        socket.to(roomcode).emit("sync-timer-update", roomState.timerValue[roomcode]);
    });
    
    socket.on("second-round",(array1)=>{
        console.log("YO")
        console.log(array1)
        roomState.arrays[previousRoomCode] = [
            ...roomState.arrays[previousRoomCode], 
            ...array1
        ].reduce((acc, current) => {
            if (!acc.find(item => item._id === current._id)) {
                acc.push(current);
            }
            return acc;
        }, []);
        if (!roomState.secondConfirmation[previousRoomCode]) {
            roomState.secondConfirmation[previousRoomCode] = 0;
        }
        console.log(roomState.arrays[previousRoomCode]);
        roomState.secondConfirmation[previousRoomCode]++;
        if(roomState.secondConfirmation[previousRoomCode]==roomState.sizes[previousRoomCode]){
            io.to(previousRoomCode).emit("second-round-final",roomState.arrays[previousRoomCode])
        }
    })
    
    socket.on("kick-user", ({ roomcode, userId }) => {
        if (roomState.creators[roomcode] === socket.id) {
            io.to(userId).emit("user-kicked");
            // Remove user from room
            roomState.users[roomcode] = roomState.users[roomcode].filter(u => u.id !== userId);
            io.to(roomcode).emit("room-users", roomState.users[roomcode]);
        }
    });
    
    socket.on("continue-bid", (data) => {
        const { currentBid, socketId, roomcode, name, isFirstBid, basePrice } = data;
        
        // Parse numeric values with fallbacks
        const numericBasePrice = parseFloat(basePrice) || 0;
        const numericCurrentBid = parseFloat(currentBid) || 0;
        
        // Check if user can afford the bid
        const userPurse = roomState.userPurse[roomcode]?.[socketId] || 0;
        const bidAmount = isFirstBid ? numericBasePrice : numericCurrentBid + 0.2;
        
        if (userPurse < bidAmount) {
            console.log(`User ${name} cannot afford bid of ${bidAmount}. Current purse: ${userPurse}`);
            // Send a message to the user that they can't afford this bid
            socket.emit("bid-error", { 
                message: "You don't have enough funds for this bid",
                requiredAmount: bidAmount,
                availablePurse: userPurse
            });
            return;
        }
        
        // Determine the new bid amount
        let newBid;
        
        // Create a key that uniquely identifies the current player in this room
        const currentPlayerKey = `${roomcode}_player_${roomState.currentPlayerIndex[roomcode]}`;
        
        // Check if this is the first bid for the current player
        if (!roomState.bidHistory[currentPlayerKey]) {
            // First bid for this player - always use base price
            newBid = numericBasePrice;
            console.log(`First bid for ${currentPlayerKey}: using base price ${numericBasePrice}`);
            
            // Initialize bid history for this player
            roomState.bidHistory[currentPlayerKey] = {
                bidCount: 1,
                lastBid: newBid
            };
        } else {
            // Subsequent bid - increment by 0.2
            newBid = numericCurrentBid + 0.2;
            console.log(`Subsequent bid for ${currentPlayerKey}: ${numericCurrentBid} + 0.2 = ${newBid}`);
            
            // Update bid history
            roomState.bidHistory[currentPlayerKey].bidCount++;
            roomState.bidHistory[currentPlayerKey].lastBid = newBid;
        }
        
        // Store current bid information
        roomState.currentBidInfo[roomcode] = {
            bidAmount: newBid,
            bidderId: socketId,
            bidderName: name,
            basePrice: numericBasePrice
        };
        
        // Reset timer value on new bid
        roomState.timerValue[roomcode] = 10;
        
        // Log for debugging
        console.log(`Bid placed: ${name} bid ${newBid} for player index ${roomState.currentPlayerIndex[roomcode]}`);
        
        // Emit events to all clients
        io.to(roomcode).emit("bid-update", { bidder: name, amount: newBid });
        io.to(roomcode).emit("add-bid", { newBid, socketId, name });
    });

    socket.on("player-status-update", ({ player, status, buyer, price, roomcode, currentIdx }) => {
        if (!roomState.auction[roomcode]) return;

        // Update the current player index
        const oldIndex = roomState.currentPlayerIndex[roomcode];
        roomState.currentPlayerIndex[roomcode] = currentIdx + 1;
        roomState.isTimerRunning[roomcode] = false;
        roomState.currentBidInfo[roomcode] = null;
        
        // Clean up bid history for the completed player
        const completedPlayerKey = `${roomcode}_player_${oldIndex}`;
        if (roomState.bidHistory[completedPlayerKey]) {
            console.log(`Cleaning up bid history for ${completedPlayerKey}`);
            delete roomState.bidHistory[completedPlayerKey];
        }

        // Track player status to prevent duplicate processing
        const playerStatusKey = `${roomcode}_player_status_${player._id}`;
        
        // Initialize processed players registry for this room if needed
        if (!roomState.processedPlayers[roomcode]) {
            roomState.processedPlayers[roomcode] = new Set();
        }
        
        // Only process player once
        if (!roomState.processedPlayers[roomcode].has(player._id)) {
            // Mark this player as processed
            roomState.processedPlayers[roomcode].add(player._id);
            
            console.log(`Processing player ${player.name} (${player._id}) with status ${status}`);
            
            if (status === "sold") {
                // Find the socket ID for the buyer
                const buyerSocketId = roomState.users[roomcode].find(u => u.name === buyer)?.id;
                
                // Update the buyer's purse (if found)
                if (buyerSocketId && roomState.userPurse[roomcode] && roomState.userPurse[roomcode][buyerSocketId]) {
                    const numericPrice = parseFloat(price) || 0;
                    const oldPurse = roomState.userPurse[roomcode][buyerSocketId];
                    
                    roomState.userPurse[roomcode][buyerSocketId] = Math.max(
                        0, 
                        oldPurse - numericPrice
                    );
                    
                    console.log(`Updated purse for ${buyer} (${buyerSocketId}): ${oldPurse} -> ${roomState.userPurse[roomcode][buyerSocketId]} (deducted ${numericPrice} Cr)`);
                    
                    // Send updated purse to the buyer
                    io.to(buyerSocketId).emit("purse-update", {
                        newPurse: roomState.userPurse[roomcode][buyerSocketId]
                    });
                }
                
                // Check if player has already been registered as sold
                if (!roomState.auction[roomcode].soldPlayerIds.has(player._id)) {
                    // Add player ID to the set of sold players
                    roomState.auction[roomcode].soldPlayerIds.add(player._id);
                    // Add to sold players list
                    roomState.auction[roomcode].soldPlayers.push({ ...player, buyer, price });
                }
                
                // Add to buyer's team if not already there
                if (!roomState.auction[roomcode].teamPlayers[buyer]) {
                    roomState.auction[roomcode].teamPlayers[buyer] = [];
                }
                
                // Check if player is already in the team (avoid duplicates)
                const playerAlreadyInTeam = roomState.auction[roomcode].teamPlayers[buyer].some(
                    p => p._id === player._id
                );
                
                // Only add if not already in team
                if (!playerAlreadyInTeam) {
                    roomState.auction[roomcode].teamPlayers[buyer].push({ ...player, price });
                }
                
                io.to(roomcode).emit("player-won", { 
                    player: player.name, 
                    winner: buyer, 
                    amount: price 
                });
            } else {
                // Check if player has already been registered as unsold
                if (!roomState.auction[roomcode].unsoldPlayerIds.has(player._id)) {
                    // Add player ID to the set of unsold players
                    roomState.auction[roomcode].unsoldPlayerIds.add(player._id);
                    // Add to unsold players list
                    roomState.auction[roomcode].unsoldPlayers.push(player);
                }
            }
        } else {
            console.log(`Skipping duplicate processing for player ${player.name} (${player._id})`);
        }

        // Send updated auction state to all clients
        io.to(roomcode).emit("auction-state-update", {
            soldPlayers: roomState.auction[roomcode].soldPlayers,
            unsoldPlayers: roomState.auction[roomcode].unsoldPlayers,
            teamPlayers: roomState.auction[roomcode].teamPlayers
        });
        
        // If we're at the end of the auction
        if (currentIdx === player.totalPlayers - 1) {
            roomState.auctionStarted[roomcode] = false;
            
            // Reset processed players for potential future auction rounds
            if (roomState.processedPlayers[roomcode]) {
                roomState.processedPlayers[roomcode].clear();
                console.log(`Cleared processed players registry for room ${roomcode}`);
            }
            
            io.to(roomcode).emit("auction-ended");
        }
    });

    socket.on("disconnect",()=>{
        console.log("User Gone",socket.id);
        if (previousRoomCode) {
            roomState.sizes[previousRoomCode] = io.sockets.adapter.rooms.get(previousRoomCode)?.size || 0;
            console.log(`Number of people in room ${previousRoomCode}: ${roomState.sizes[previousRoomCode]}`);
            // Emit updated room size when someone disconnects
            io.to(previousRoomCode).emit("room-size", roomState.sizes[previousRoomCode]);
            roomState.users[previousRoomCode] = (roomState.users[previousRoomCode] || [])
                .filter(u => u.id !== socket.id);
            io.to(previousRoomCode).emit("room-users", roomState.users[previousRoomCode]);
        }
    })
})

server.listen(port,() => {
    console.log("Server running!");
});

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
}