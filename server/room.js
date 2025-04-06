// room.js



export class Room {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.playersInfo = []; // All players fetched from DB
    this.shuffledPlayers = []; // Shuffled players specific to this room
    this.currentIndex = 0;
    this.currentPlayer = null;
    this.currentBid = null;
    this.bidder = null;
    this.timer = 10;
    this.isTimerRunning = false;
    this.unsoldPlayers = [];
    this.soldPlayers = [];
    this.managerLists = {}; // { socketId: [players] }
    this.secondRound = false;
    this.secondRoundSelection = []; // Players selected for second round
    this.timerInterval = null;
  }

  async initializeRoom() {
    try {
      // Fetch all players from DB
      this.playersInfo = await Player.find({});
      
      // Shuffle players and assign to shuffledPlayers
      this.shuffledPlayers = this.shuffleArray([...this.playersInfo]);
      
      // Set current player and bid
      this.currentPlayer = this.shuffledPlayers[this.currentIndex];
      this.currentBid = this.currentPlayer.basePrice;
    } catch (error) {
      console.error(`Error initializing room ${this.roomCode}:`, error);
    }
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  startTimer(io) {
    if (this.isTimerRunning) return;
    this.isTimerRunning = true;
    this.timer = 10;
    io.to(this.roomCode).emit('timer-started', this.timer, this.currentPlayer);

    this.timerInterval = setInterval(() => {
      this.timer--;
      if (this.timer <= 0) {
        clearInterval(this.timerInterval);
        this.isTimerRunning = false;
        this.handleAuctionEnd(io);
      } else {
        io.to(this.roomCode).emit('timer-updated', this.timer);
      }
    }, 1000);
  }

  placeBid(io, bidAmount, bidderName, bidderSocketId) {
    if (!this.isTimerRunning) return;
    if (bidAmount <= this.currentBid) return;

    this.currentBid = bidAmount;
    this.bidder = { name: bidderName, socketId: bidderSocketId };
    this.timer = 10; // Reset timer on new bid
    io.to(this.roomCode).emit('bid-placed', {
      currentBid: this.currentBid,
      bidder: this.bidder,
    });
  }

  handleAuctionEnd(io) {
    if (this.bidder) {
      // Player sold
      this.soldPlayers.push({
        ...this.currentPlayer,
        soldPrice: this.currentBid,
        bidder: this.bidder.name,
      });
      // Add to manager's list
      if (!this.managerLists[this.bidder.socketId]) {
        this.managerLists[this.bidder.socketId] = [];
      }
      this.managerLists[this.bidder.socketId].push({
        ...this.currentPlayer,
        soldPrice: this.currentBid,
      });
      io.to(this.roomCode).emit('player-sold', {
        player: this.currentPlayer,
        soldPrice: this.currentBid,
        bidder: this.bidder.name,
      });
    } else {
      // Player unsold
      this.unsoldPlayers.push(this.currentPlayer);
      io.to(this.roomCode).emit('player-unsold', this.currentPlayer);
    }

    // Move to next player or handle second round initiation
    if (this.currentIndex < this.shuffledPlayers.length - 1) {
      this.currentIndex++;
      this.currentPlayer = this.shuffledPlayers[this.currentIndex];
      this.currentBid = this.currentPlayer.basePrice;
      this.bidder = null;
      io.to(this.roomCode).emit('next-player', this.currentPlayer);
    } else if (!this.secondRound && this.unsoldPlayers.length > 0) {
      // Initiate selection for second round
      this.secondRound = true;
      io.to(this.roomCode).emit('second-round-init', this.unsoldPlayers);
    } else {
      // Auction ends
      io.to(this.roomCode).emit('auction-ended', {
        soldPlayers: this.soldPlayers,
        unsoldPlayers: this.unsoldPlayers,
        managerLists: this.managerLists,
      });
    }
  }

  startSecondRound(io, selectedPlayers) {
    if (!this.secondRound) return;
    this.shuffledPlayers = selectedPlayers;
    this.currentIndex = 0;
    this.currentPlayer = this.shuffledPlayers[this.currentIndex];
    this.currentBid = this.currentPlayer.basePrice;
    this.bidder = null;
    this.secondRound = false; // Reset for any further use
    io.to(this.roomCode).emit('second-round-started', this.currentPlayer);
  }

  getState() {
    return {
      currentPlayer: this.currentPlayer,
      currentBid: this.currentBid,
      bidder: this.bidder,
      timer: this.timer,
      isTimerRunning: this.isTimerRunning,
      unsoldPlayers: this.unsoldPlayers,
      soldPlayers: this.soldPlayers,
      managerLists: this.managerLists,
      secondRound: this.secondRound,
    };
  }
}
