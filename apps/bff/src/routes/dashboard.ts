import { Router, type Router as RouterType } from 'express';

export function dashboardRoutes(agentUrl: string): RouterType {
  const router = Router();

  // Get timeline
  router.get('/timeline', async (req, res) => {
    const sessionId = req.query['sessionId'] as string;
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId required' });
      return;
    }
    try {
      const resp = await fetch(`${agentUrl}/agent/timeline?sessionId=${encodeURIComponent(sessionId)}`);
      const data = await resp.json();
      res.json(data);
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // List providers directly via agent endpoint
  router.get('/providers', async (_req, res) => {
    try {
      const resp = await fetch(`${agentUrl}/agent/providers`);
      const data = await resp.json();
      res.json(data);
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // List routes directly via agent endpoint
  router.get('/routes', async (_req, res) => {
    try {
      const resp = await fetch(`${agentUrl}/agent/routes`);
      const data = await resp.json();
      res.json(data);
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Get available tools
  router.get('/tools', async (_req, res) => {
    try {
      const resp = await fetch(`${agentUrl}/agent/tools`);
      const data = await resp.json();
      res.json(data);
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Metrics
  router.get('/metrics', async (_req, res) => {
    try {
      const resp = await fetch(`${agentUrl}/agent/metrics`);
      const data = await resp.json();
      res.json(data);
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Rollback
  router.post('/rollback', async (req, res) => {
    try {
      const agentResp = await fetch(`${agentUrl}/agent/rollback`, {
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

  // Rollback to version
  router.post('/rollback-to-version', async (req, res) => {
    try {
      const agentResp = await fetch(`${agentUrl}/agent/rollback-to-version`, {
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

  return router;
}
