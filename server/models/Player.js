import mongoose from 'mongoose';

/**
 * The player catalog. Seeded once by scripts/seed.js and never written to at
 * runtime — rooms reference these documents by _id instead of copying them.
 */
const playerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  team: { type: String, required: true },
  /** Skill tier. Lower sets are auctioned first so marquee players come up early. */
  set: { type: Number, required: true, index: true },
  playerType: {
    type: String,
    required: true,
    enum: ['Batsman', 'Bowler', 'All-Rounder', 'Batsman-WK'],
  },
  /** INTEGER LAKHS. See shared/bidRules.js. */
  basePrice: { type: Number, required: true },
  point: { type: Number, required: true },
});

export const Player = mongoose.model('Player', playerSchema);
