import mongoose from 'mongoose';
import { env } from './config/env.js';

/**
 * Connect to MongoDB. Replaces the old 0-byte database.js.
 *
 * The old app.js called server.listen() unconditionally, so the server would
 * happily accept traffic with no database behind it and fail on the first
 * query. Here the caller awaits this before listening.
 */
export async function connectDB() {
  mongoose.connection.on('error', (err) =>
    console.error('[db] connection error:', err.message)
  );
  mongoose.connection.on('disconnected', () =>
    console.warn('[db] disconnected')
  );

  // useNewUrlParser / useUnifiedTopology were removed here: they are no-ops on
  // mongoose 8 and only emit deprecation warnings.
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5_000 });
  console.log(`[db] connected to ${mongoose.connection.name}`);
}

export function dbStatus() {
  return mongoose.connection.readyState === 1 ? 'up' : 'down';
}
