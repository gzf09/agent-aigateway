import express from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { HigressApiClient } from './higress/apiClient.js';
import { createMcpServer } from './server.js';

const PORT = parseInt(process.env['MCP_SERVER_PORT'] || '5000', 10);
const HIGRESS_CONSOLE_URL = process.env['HIGRESS_CONSOLE_URL'] || 'http://localhost:8001';
const HIGRESS_CONSOLE_USERNAME = process.env['HIGRESS_CONSOLE_USERNAME'] || 'admin';
const HIGRESS_CONSOLE_PASSWORD = process.env['HIGRESS_CONSOLE_PASSWORD'] || 'admin';

const app = express();

// Store active transports by sessionId
const transports = new Map<string, SSEServerTransport>();

const higressClient = new HigressApiClient({
  consoleUrl: HIGRESS_CONSOLE_URL,
  username: HIGRESS_CONSOLE_USERNAME,
  password: HIGRESS_CONSOLE_PASSWORD,
});

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    serverName: 'mcp-server-higress',
    activeSessions: transports.size,
    timestamp: Date.now(),
  });
});

// SSE endpoint - establishes SSE connection
app.get('/sse', async (req, res) => {
  const server = createMcpServer(higressClient);
  const transport = new SSEServerTransport('/messages', res);
  transports.set(transport.sessionId, transport);

  res.on('close', () => {
    transports.delete(transport.sessionId);
  });

  await server.connect(transport);
});

// Messages endpoint - receives JSON-RPC messages from client
app.post('/messages', async (req, res) => {
  const sessionId = req.query['sessionId'] as string;
  const transport = transports.get(sessionId);

  if (!transport) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  await transport.handlePostMessage(req, res);
});

app.listen(PORT, () => {
  console.log(`MCP Server Higress running on http://localhost:${PORT}`);
  console.log(`Higress Console URL: ${HIGRESS_CONSOLE_URL}`);
});
