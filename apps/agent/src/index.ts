import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

import express from 'express';
import cors from 'cors';
import { createMCPClient, type IMCPClient } from '@aigateway/mcp-client';
import { AgentOrchestrator } from './engine/orchestrator.js';
import { MetricsCollector } from './metrics/index.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = parseInt(process.env['AGENT_ENGINE_PORT'] || '4000', 10);
const REDIS_URL = process.env['REDIS_URL'] || 'redis://localhost:6379';
const MOCK_MODE = process.env['MOCK_MODE'] === 'true';

const mcpClient: IMCPClient = createMCPClient({
  mcpServerUrl: process.env['MCP_SERVER_URL'] || 'http://localhost:5000',
  mockMode: MOCK_MODE,
});

// Connect to MCP Server with retry
async function connectMCP() {
  try {
    await mcpClient.connect();
    console.log('[Agent] MCP Client connected');
  } catch (e: unknown) {
    console.error(`[Agent] MCP Client connection failed: ${(e as Error).message}, retrying in 5s...`);
    setTimeout(connectMCP, 5000);
  }
}
connectMCP();

const orchestrator = new AgentOrchestrator(mcpClient, REDIS_URL);
const metrics = new MetricsCollector();

// Health check
app.get('/agent/health', (_req, res) => {
  const llmConfig = orchestrator.getLLMConfig();
  res.json({
    status: 'ok',
    mock: MOCK_MODE,
    timestamp: Date.now(),
    higressConsoleUrl: process.env['HIGRESS_CONSOLE_EXTERNAL_URL'] || process.env['HIGRESS_CONSOLE_URL'] || 'http://localhost:8001',
    llm: {
      available: llmConfig.available,
      provider: llmConfig.provider,
      model: llmConfig.model,
    },
    mcp: {
      connected: mcpClient.getConnectionState() === 'connected',
      serverUrl: process.env['MCP_SERVER_URL'] || 'http://localhost:5000',
    },
  });
});

// MCP status
app.get('/agent/mcp-status', async (_req, res) => {
  const state = mcpClient.getConnectionState();
  let tools: { name: string; description: string }[] = [];
  try {
    const toolList = await mcpClient.listTools();
    tools = toolList.map(t => ({ name: t.name, description: t.description }));
  } catch {
    // tools unavailable
  }
  res.json({
    connected: state === 'connected',
    state,
    serverUrl: process.env['MCP_SERVER_URL'] || 'http://localhost:5000',
    toolCount: tools.length,
    tools,
  });
});

// LLM config
app.get('/agent/llm-config', (_req, res) => {
  res.json({ data: orchestrator.getLLMConfig() });
});

app.post('/agent/llm-config', (req, res) => {
  const { provider, apiKey, baseURL, model } = req.body as {
    provider?: string; apiKey?: string; baseURL?: string; model?: string;
  };
  orchestrator.updateLLMConfig({ provider, apiKey, baseURL, model });
  res.json({ data: orchestrator.getLLMConfig() });
});

// Process user message - returns SSE stream
app.post('/agent/message', async (req, res) => {
  const start = Date.now();
  const { sessionId, message } = req.body as { sessionId: string; message: string };
  if (!sessionId || !message) {
    res.status(400).json({ error: 'sessionId and message required' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let success = true;
  try {
    for await (const chunk of orchestrator.processMessage(sessionId, message)) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  } catch (err: unknown) {
    success = false;
    res.write(`data: ${JSON.stringify({ type: 'error', error: { code: 'INTERNAL', message: (err as Error).message } })}\n\n`);
  }
  metrics.recordRequest(Date.now() - start, success);
  res.end();
});

// Handle confirm/cancel
app.post('/agent/confirm', async (req, res) => {
  const { sessionId, action, confirmedName } = req.body as { sessionId: string; action: 'accept' | 'cancel'; confirmedName?: string };
  if (!sessionId || !action) {
    res.status(400).json({ error: 'sessionId and action required' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    for await (const chunk of orchestrator.handleConfirm(sessionId, action, confirmedName)) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  } catch (err: unknown) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: { code: 'INTERNAL', message: (err as Error).message } })}\n\n`);
  }
  res.end();
});

// Rollback last
app.post('/agent/rollback', async (req, res) => {
  const { sessionId } = req.body as { sessionId: string };
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');

  for await (const chunk of orchestrator.processMessage(sessionId, '回滚上一步')) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
  res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  res.end();
});

// Rollback to version
app.post('/agent/rollback-to-version', async (req, res) => {
  const { sessionId, targetVersionId } = req.body as { sessionId: string; targetVersionId: number };
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');

  for await (const chunk of orchestrator.handleRollbackToVersion(sessionId, targetVersionId)) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
  res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  res.end();
});

// Get timeline
app.get('/agent/timeline', async (req, res) => {
  const sessionId = req.query['sessionId'] as string;
  if (!sessionId) { res.status(400).json({ error: 'sessionId required' }); return; }
  const timeline = await orchestrator.getTimeline(sessionId);
  res.json({ data: timeline });
});

// List tools (dynamic discovery from MCP Server)
app.get('/agent/tools', async (_req, res) => {
  try {
    const tools = await mcpClient.listTools();
    res.json({ data: tools });
  } catch {
    // Fallback to static tools if MCP not connected
    const { ALL_TOOLS } = await import('@aigateway/mcp-client');
    res.json({ data: ALL_TOOLS });
  }
});

// List providers directly
app.get('/agent/providers', async (_req, res) => {
  try {
    const result = await mcpClient.callTool('list-ai-providers', {});
    res.json(result.success ? result.data : { data: [] });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// List routes directly
app.get('/agent/routes', async (_req, res) => {
  try {
    const result = await mcpClient.callTool('list-ai-routes', {});
    res.json(result.success ? result.data : { data: [] });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Metrics snapshot
app.get('/agent/metrics', (_req, res) => {
  res.json({ data: metrics.getSnapshot() });
});

app.listen(PORT, () => {
  console.log(`Agent Engine running on http://localhost:${PORT}`);
  console.log(`Mode: ${MOCK_MODE ? 'MOCK' : 'LIVE'}`);
});
