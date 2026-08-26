import mongoose from 'mongoose';
import { RULES } from '../config/env.js';

/**
 * A participant's durable record. Keyed by `userId` (a cookie-persisted uuid),
 * NOT by socket.id — that was the root cause of the old reconnect bugs, where
 * a refresh handed out a fresh purse and silently stripped the creator of
 * admin rights.
 */
const participantSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    name: { type: String, required: true },
    /** Remaining budget in lakhs. */
    purse: { type: Number, required: true, default: RULES.startingPurse },
    team: [
      {
        _id: false,
        playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
        price: Number,
      },
    ],
    /**
     * Set when the admin drops someone who left and did not come back. An
     * abandoned participant no longer blocks the "everyone is connected"
     * check that gates resuming a paused auction.
     */
    abandoned: { type: Boolean, default: false },
  },
  { _id: false }
);

/** One auction lot: the Nth player in this room's shuffled script. */
const lotSchema = new mongoose.Schema(
  {
    index: { type: Number, required: true },
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
    status: {
      type: String,
      enum: ['PENDING', 'SOLD', 'UNSOLD'],
      default: 'PENDING',
    },
    /** Final hammer price in lakhs. Written ONCE, at settlement. */
    soldPrice: Number,
    winnerUserId: String,
  },
  { _id: false }
);

const roomSchema = new mongoose.Schema({
  roomCode: { type: String, required: true, unique: true, index: true },
  adminUserId: { type: String, required: true },
  phase: { type: String, enum: ['LOBBY', 'LIVE', 'ENDED'], default: 'LOBBY' },

  /**
   * The room's immutable auction script: player _ids in shuffled order,
   * written once at creation. Because the order is fixed and persisted, the
   * entire live auction position collapses to a single integer (lotIndex),
   * which is what makes a reconnect a one-message snapshot.
   */
  playerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],

  participants: [participantSchema],
  lots: [lotSchema],

  maxParticipants: { type: Number, default: RULES.maxParticipants },
  lotDurationMs: { type: Number, default: RULES.lotDurationMs },
  startingPurse: { type: Number, default: RULES.startingPurse },

  createdAt: { type: Date, default: Date.now },
});

export const Room = mongoose.model('Room', roomSchema);
