import 'dotenv/config';

/**
 * Validated environment. Fails loudly at startup rather than producing a
 * confusing connection error twenty seconds later.
 */
function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(
      `\n  Missing required env var ${name}.\n` +
      `  Copy server/.env.example to server/.env and fill it in.\n`
    );
    process.exit(1);
  }
  return value;
}

export const env = {
  mongoUri: required('MONGO_URI'),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  port: Number(process.env.PORT) || 3000,
};

/** Auction rules, in one place so the demo is easy to retune. */
export const RULES = {
  /** How long a lot stays open with no bid, and the reset after each bid. */
  lotDurationMs: 10_000,
  /** Countdown shown between a settlement and the next lot opening. */
  settlementPauseMs: 3_000,
  /** Starting purse, in lakhs. 12000 = 120 Cr. */
  startingPurse: 12_000,
  maxParticipants: 10,
};
