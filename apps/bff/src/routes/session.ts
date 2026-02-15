import { Router, type Router as RouterType } from 'express';

export function sessionRoutes(agentUrl: string): RouterType {
  const router = Router();

  // Get agent health
  router.get('/health', async (_req, res) => {
    try {
      const resp = await fetch(`${agentUrl}/agent/health`);
      const data = await resp.json();
      res.json(data);
    } catch {
      res.status(503).json({ status: 'agent_unreachable' });
    }
  });

  // Proxy message (REST fallback for non-WebSocket clients)
  router.post('/message', async (req, res) => {
    try {
      const agentResp = await fetch(`${agentUrl}/agent/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      if (!agentResp.body) {
        res.end();
        return;
      }
      const reader = agentResp.body.getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      };
      pump().catch(() => res.end());
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Proxy confirm
  router.post('/confirm', async (req, res) => {
    try {
      const agentResp = await fetch(`${agentUrl}/agent/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      if (!agentResp.body) { res.end(); return; }
      const reader = agentResp.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Proxy LLM config GET
  router.get('/llm-config', async (_req, res) => {
    try {
      const resp = await fetch(`${agentUrl}/agent/llm-config`);
      const data = await resp.json();
      res.json(data);
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Proxy LLM config PUT
  router.put('/llm-config', async (req, res) => {
    try {
      const resp = await fetch(`${agentUrl}/agent/llm-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      const data = await resp.json();
      res.json(data);
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}
