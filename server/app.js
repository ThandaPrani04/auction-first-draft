/**
 * Bootstrap only. All behaviour lives in routes/, sockets/, services/, state/.
 *
 * The previous app.js was 546 lines holding the REST routes, every socket
 * handler, the Mongoose schemas, and a 13-map global object, and it called
 * listen() whether or not MongoDB was reachable.
 */
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

import { env } from './config/env.js';
import { connectDB } from './db.js';
import { roomsRouter } from './routes/rooms.js';
import { registerSocketHandlers } from './sockets/index.js';

const app = express();
const server = createServer(app);

const corsOptions = {
  origin: env.clientOrigin,
  methods: ['GET', 'POST'],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use('/api', roomsRouter);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

const io = new Server(server, { cors: corsOptions });
registerSocketHandlers(io);

// Connect BEFORE listening, so the server never accepts traffic it cannot serve.
try {
  await connectDB();
  server.listen(env.port, () => {
    console.log(`[server] listening on http://localhost:${env.port}`);
    console.log(`[server] accepting browser origin ${env.clientOrigin}`);
  });
} catch (err) {
  console.error('[server] startup failed:', err.message);
  process.exit(1);
}
