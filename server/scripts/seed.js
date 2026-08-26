/**
 * Seeds the player catalog. Run with `npm run seed`.
 *
 * This replaces the old `POST /roomcode` behaviour, which copied every player
 * document into a fresh per-room MongoDB collection. That left 48 abandoned
 * `<code>_players` collections in the local database and threw
 * OverwriteModelError the second time a room code was compiled.
 *
 * Base prices are INTEGER LAKHS (see shared/bidRules.js). Sets are skill
 * tiers, auctioned in order, so marquee players come up while purses are full.
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Player } from '../models/Player.js';

const PLAYERS = [
  // Set 1 — Marquee (base 2.00 Cr)
  ['MS Dhoni', 'CSK', 1, 'Batsman-WK', 200, 90],
  ['Virat Kohli', 'RCB', 1, 'Batsman', 200, 95],
  ['Rohit Sharma', 'MI', 1, 'Batsman', 200, 90],
  ['Jasprit Bumrah', 'MI', 1, 'Bowler', 200, 95],
  ['Ravindra Jadeja', 'CSK', 1, 'All-Rounder', 200, 88],
  ['Hardik Pandya', 'MI', 1, 'All-Rounder', 200, 85],
  ['Rishabh Pant', 'DC', 1, 'Batsman-WK', 200, 86],
  ['KL Rahul', 'LSG', 1, 'Batsman-WK', 200, 84],

  // Set 2 — Top-order batsmen (base 1.50 Cr)
  ['Suryakumar Yadav', 'MI', 2, 'Batsman', 150, 88],
  ['Shubman Gill', 'GT', 2, 'Batsman', 150, 87],
  ['Ruturaj Gaikwad', 'CSK', 2, 'Batsman', 150, 82],
  ['Yashasvi Jaiswal', 'RR', 2, 'Batsman', 150, 83],
  ['Shreyas Iyer', 'KKR', 2, 'Batsman', 150, 80],
  ['Sanju Samson', 'RR', 2, 'Batsman-WK', 150, 81],
  ['Devdutt Padikkal', 'RCB', 2, 'Batsman', 150, 72],
  ['Tilak Varma', 'MI', 2, 'Batsman', 150, 74],

  // Set 3 — Bowlers (base 1.00 Cr)
  ['Mohammed Shami', 'GT', 3, 'Bowler', 100, 85],
  ['Mohammed Siraj', 'RCB', 3, 'Bowler', 100, 82],
  ['Yuzvendra Chahal', 'RR', 3, 'Bowler', 100, 84],
  ['Ravichandran Ashwin', 'RR', 3, 'Bowler', 100, 80],
  ['Kuldeep Yadav', 'DC', 3, 'Bowler', 100, 81],
  ['Arshdeep Singh', 'PBKS', 3, 'Bowler', 100, 78],
  ['Avesh Khan', 'LSG', 3, 'Bowler', 100, 72],
  ['Harshal Patel', 'PBKS', 3, 'Bowler', 100, 75],

  // Set 4 — All-rounders & keepers (base 0.75 Cr)
  ['Axar Patel', 'DC', 4, 'All-Rounder', 75, 79],
  ['Washington Sundar', 'SRH', 4, 'All-Rounder', 75, 71],
  ['Shivam Dube', 'CSK', 4, 'All-Rounder', 75, 76],
  ['Venkatesh Iyer', 'KKR', 4, 'All-Rounder', 75, 70],
  ['Rahul Tewatia', 'GT', 4, 'All-Rounder', 75, 69],
  ['Ishan Kishan', 'MI', 4, 'Batsman-WK', 75, 77],
  ['Jitesh Sharma', 'PBKS', 4, 'Batsman-WK', 75, 68],
  ['Krunal Pandya', 'LSG', 4, 'All-Rounder', 75, 70],

  // Set 5 — Emerging (base 0.50 Cr)
  ['Abhishek Sharma', 'SRH', 5, 'All-Rounder', 50, 73],
  ['Rinku Singh', 'KKR', 5, 'Batsman', 50, 76],
  ['Mukesh Kumar', 'DC', 5, 'Bowler', 50, 64],
  ['Akash Madhwal', 'MI', 5, 'Bowler', 50, 62],
  ['Sai Sudharsan', 'GT', 5, 'Batsman', 50, 74],
  ['Nehal Wadhera', 'MI', 5, 'Batsman', 50, 60],
  ['Mayank Yadav', 'LSG', 5, 'Bowler', 50, 66],
  ['Angkrish Raghuvanshi', 'KKR', 5, 'Batsman', 50, 61],
].map(([name, team, set, playerType, basePrice, point]) => ({
  name, team, set, playerType, basePrice, point,
}));

async function seed() {
  await mongoose.connect(env.mongoUri);
  console.log(`[seed] connected to ${mongoose.connection.name}`);

  const removed = await Player.deleteMany({});
  if (removed.deletedCount) console.log(`[seed] cleared ${removed.deletedCount} existing players`);

  const inserted = await Player.insertMany(PLAYERS);
  const bySet = inserted.reduce((acc, p) => {
    acc[p.set] = (acc[p.set] || 0) + 1;
    return acc;
  }, {});

  console.log(`[seed] inserted ${inserted.length} players`);
  for (const [set, count] of Object.entries(bySet)) {
    console.log(`         set ${set}: ${count}`);
  }

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
