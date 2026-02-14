import { describe, it, expect, beforeEach } from 'vitest';
import { HigressMCPClient, mockProviders, mockRoutes } from '../index.js';

describe('HigressMCPClient', () => {
  let client: HigressMCPClient;

  beforeEach(() => {
    mockProviders.clear();
    mockRoutes.clear();
    client = new HigressMCPClient({
      serverUrl: '',
      higressConsoleUrl: 'http://localhost:8080',
      mockMode: true,
    });
  });

  describe('connection state', () => {
    it('should start disconnected', () => {
      expect(client.getConnectionState()).toBe('disconnected');
    });

    it('should be connected after connect()', async () => {
      await client.connect();
      expect(client.getConnectionState()).toBe('connected');
    });

    it('should be disconnected after disconnect()', async () => {
      await client.connect();
      await client.disconnect();
      expect(client.getConnectionState()).toBe('disconnected');
    });
  });

  describe('Provider CRUD (mock mode)', () => {
    it('should list empty providers initially', async () => {
      const result = await client.callTool('list-ai-providers', {});
      expect(result.success).toBe(true);
      expect((result.data as { data: unknown[] }).data).toHaveLength(0);
    });

    it('should add a provider', async () => {
      const result = await client.callTool('add-ai-provider', {
        name: 'openai',
        type: 'openai',
        tokens: ['sk-test123'],
        protocol: 'openai/v1',
      });
      expect(result.success).toBe(true);
      const data = (result.data as { data: { name: string } }).data;
      expect(data.name).toBe('openai');
    });

    it('should get a provider', async () => {
      await client.callTool('add-ai-provider', {
        name: 'openai', type: 'openai', tokens: ['sk-test'], protocol: 'openai/v1',
      });
      const result = await client.callTool('get-ai-provider', { name: 'openai' });
      expect(result.success).toBe(true);
      expect((result.data as { data: { name: string } }).data.name).toBe('openai');
    });

    it('should list providers after adding', async () => {
      await client.callTool('add-ai-provider', {
        name: 'openai', type: 'openai', tokens: ['sk-test'], protocol: 'openai/v1',
      });
      await client.callTool('add-ai-provider', {
        name: 'deepseek', type: 'deepseek', tokens: ['sk-ds'], protocol: 'openai/v1',
      });
      const result = await client.callTool('list-ai-providers', {});
      expect(result.success).toBe(true);
      expect((result.data as { data: unknown[] }).data).toHaveLength(2);
    });

    it('should update a provider', async () => {
      await client.callTool('add-ai-provider', {
        name: 'openai', type: 'openai', tokens: ['sk-old'], protocol: 'openai/v1',
      });
      const result = await client.callTool('update-ai-provider', {
        name: 'openai', tokens: ['sk-new'],
      });
      expect(result.success).toBe(true);
      const data = (result.data as { data: { tokens: string[]; version: string } }).data;
      expect(data.tokens).toContain('sk-new');
      expect(data.version).toBe('2');
    });

    it('should delete a provider', async () => {
      await client.callTool('add-ai-provider', {
        name: 'openai', type: 'openai', tokens: ['sk-test'], protocol: 'openai/v1',
      });
      const result = await client.callTool('delete-ai-provider', { name: 'openai' });
      expect(result.success).toBe(true);

      const listResult = await client.callTool('list-ai-providers', {});
      expect((listResult.data as { data: unknown[] }).data).toHaveLength(0);
    });

    it('should detect duplicate provider on add', async () => {
      await client.callTool('add-ai-provider', {
        name: 'openai', type: 'openai', tokens: ['sk-test'], protocol: 'openai/v1',
      });
      const result = await client.callTool('add-ai-provider', {
        name: 'openai', type: 'openai', tokens: ['sk-test2'], protocol: 'openai/v1',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('已存在');
    });

    it('should fail to get non-existent provider', async () => {
      const result = await client.callTool('get-ai-provider', { name: 'nonexistent' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('不存在');
    });

    it('should fail to update non-existent provider', async () => {
      const result = await client.callTool('update-ai-provider', { name: 'nonexistent', tokens: ['sk-new'] });
      expect(result.success).toBe(false);
    });

    it('should fail to delete non-existent provider', async () => {
      const result = await client.callTool('delete-ai-provider', { name: 'nonexistent' });
      expect(result.success).toBe(false);
    });
  });

  describe('Route CRUD (mock mode)', () => {
    it('should list empty routes initially', async () => {
      const result = await client.callTool('list-ai-routes', {});
      expect(result.success).toBe(true);
      expect((result.data as { data: unknown[] }).data).toHaveLength(0);
    });

    it('should add a route', async () => {
      const result = await client.callTool('add-ai-route', {
        name: 'test-route',
        upstreams: [{ provider: 'openai', weight: 100 }],
      });
      expect(result.success).toBe(true);
      expect((result.data as { data: { name: string } }).data.name).toBe('test-route');
    });

    it('should list routes after adding', async () => {
      await client.callTool('add-ai-route', {
        name: 'route-1', upstreams: [{ provider: 'openai', weight: 100 }],
      });
      const result = await client.callTool('list-ai-routes', {});
      expect((result.data as { data: unknown[] }).data).toHaveLength(1);
    });

    it('should delete a route', async () => {
      await client.callTool('add-ai-route', {
        name: 'route-1', upstreams: [{ provider: 'openai', weight: 100 }],
      });
      const result = await client.callTool('delete-ai-route', { name: 'route-1' });
      expect(result.success).toBe(true);
    });

    it('should detect duplicate route on add', async () => {
      await client.callTool('add-ai-route', {
        name: 'route-1', upstreams: [{ provider: 'openai', weight: 100 }],
      });
      const result = await client.callTool('add-ai-route', {
        name: 'route-1', upstreams: [{ provider: 'deepseek', weight: 100 }],
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('已存在');
    });

    it('should fail to get non-existent route', async () => {
      const result = await client.callTool('get-ai-route', { name: 'nonexistent' });
      expect(result.success).toBe(false);
    });
  });

  describe('Unknown tool', () => {
    it('should return error for unknown tool name', async () => {
      const result = await client.callTool('unknown-tool', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('未知工具');
    });
  });
});
