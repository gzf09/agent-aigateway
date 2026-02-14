import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { setupWebSocket } from './ws/chatGateway.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { sessionRoutes } from './routes/session.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = parseInt(process.env['BFF_PORT'] || '3000', 10);
const AGENT_URL = process.env['AGENT_URL'] || `http://localhost:${process.env['AGENT_ENGINE_PORT'] || '4000'}`;

// Session routes
app.use('/api/session', sessionRoutes(AGENT_URL));

// Dashboard routes
app.use('/api/dashboard', dashboardRoutes(AGENT_URL));

// Health
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Create session
app.post('/api/session/create', (_req, res) => {
  const sessionId = uuidv4();
  res.json({ sessionId });
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

setupWebSocket(wss, AGENT_URL);

server.listen(PORT, () => {
  console.log(`BFF running on http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
});
