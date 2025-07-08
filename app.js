import express from "express";
import {Server} from "socket.io";
import {createServer} from "http";
import cors from "cors"
import mongoose from "mongoose";
import bodyParser from "body-parser";

const port=3000;
mongoose.connect("mongodb://localhost:27017/Auction", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

const app=express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
      origin: "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
});
  
app.use(
    cors({
      origin: "http://localhost:5173",
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

const roomArrays = {};
const roomArraysSize = {};
const roomSecondConfirmation={};
io.on("connection",(socket)=>{
    console.log("Id", socket.id);
    let previousRoomCode = null;
    socket.on("join-room", (roomcode) => {
        if (previousRoomCode !== roomcode) {
            if (!roomArrays[roomcode]) {
                roomArrays[roomcode] = []; // Initialize array2 for this room if it doesn't exist
            }
        }
        previousRoomCode = roomcode;
        socket.join(roomcode);
        roomArraysSize[roomcode] = io.sockets.adapter.rooms.get(roomcode)?.size || 0;
        console.log(`Number of people in room ${roomcode}: ${roomArraysSize[roomcode]}`);
    });
    socket.on("start-all-timer",(roomcode)=>{
        io.to(roomcode).emit("start-timer",10)
    })
    socket.on("second-round",(array1)=>{
        console.log("YO")
        console.log(array1)
        roomArrays[previousRoomCode] = [
            ...roomArrays[previousRoomCode], 
            ...array1
        ].reduce((acc, current) => {
            if (!acc.find(item => item._id === current._id)) {
                acc.push(current);
            }
            return acc;
        }, []);
        if (!roomSecondConfirmation[previousRoomCode]) {
            roomSecondConfirmation[previousRoomCode] = 0;
        }
        console.log(roomArrays[previousRoomCode]);
        roomSecondConfirmation[previousRoomCode]++;
        if(roomSecondConfirmation[previousRoomCode]==roomArraysSize[previousRoomCode]){
            io.to(previousRoomCode).emit("second-round-final",roomArrays[previousRoomCode])
        }
    })
    socket.on("continue-bid",(data)=>{
        const { currentBid, socketId, roomcode, name } = data;
        let newBid;
        if (currentBid < 1) {
            newBid=currentBid+0.05;
        } else if (currentBid < 2) {
            newBid=currentBid+0.1;
        } else if (currentBid < 9.95) {
            newBid=currentBid+0.2;
        } else {
            newBid=currentBid+0.5;
        }
        io.to(roomcode).emit("add-bid",{ newBid, socketId, name })
    })
    socket.on("disconnect",()=>{
        console.log("User Gone",socket.id);
        if (previousRoomCode) {
            roomArraysSize[previousRoomCode] = io.sockets.adapter.rooms.get(previousRoomCode)?.size || 0;
            console.log(`Number of people in room ${previousRoomCode}: ${roomArraysSize[previousRoomCode]}`);

            // Optionally, emit the updated room size to all users in the room
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