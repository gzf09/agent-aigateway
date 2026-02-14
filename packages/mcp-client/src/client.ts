import type { AIProvider, AIRoute } from '@aigateway/shared';

export interface MCPClientConfig {
  serverUrl: string;
  higressConsoleUrl: string;
  auth?: { username: string; password: string };
  connectTimeout?: number;
  callTimeout?: number;
  mockMode?: boolean;
}

// Mock data store for local development
export const mockProviders: Map<string, AIProvider> = new Map();
export const mockRoutes: Map<string, AIRoute> = new Map();

export class HigressMCPClient {
  private config: MCPClientConfig;
  private connected = false;

  constructor(config: MCPClientConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  getConnectionState() {
    return this.connected ? 'connected' : 'disconnected';
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }> {
    if (this.config.mockMode) {
      return this.callToolMock(name, args);
    }
    return this.callToolHttp(name, args);
  }

  private async callToolHttp(name: string, args: Record<string, unknown>) {
    const url = this.config.higressConsoleUrl;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.auth) {
      headers['Authorization'] = 'Basic ' + Buffer.from(`${this.config.auth.username}:${this.config.auth.password}`).toString('base64');
    }

    try {
      const { method, path, body } = this.mapToolToApi(name, args);
      const resp = await fetch(`${url}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) return { success: false, error: `HTTP ${resp.status}: ${JSON.stringify(data)}` };
      return { success: true, data };
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message };
    }
  }

  private mapToolToApi(name: string, args: Record<string, unknown>): { method: string; path: string; body?: unknown } {
    const n = args['name'] as string;
    switch (name) {
      case 'list-ai-providers': return { method: 'GET', path: '/v1/ai/providers' };
      case 'get-ai-provider': return { method: 'GET', path: `/v1/ai/providers/${n}` };
      case 'add-ai-provider': return { method: 'POST', path: '/v1/ai/providers', body: args };
      case 'update-ai-provider': return { method: 'PUT', path: `/v1/ai/providers/${n}`, body: args };
      case 'delete-ai-provider': return { method: 'DELETE', path: `/v1/ai/providers/${n}` };
      case 'list-ai-routes': return { method: 'GET', path: '/v1/ai/routes' };
      case 'get-ai-route': return { method: 'GET', path: `/v1/ai/routes/${n}` };
      case 'add-ai-route': return { method: 'POST', path: '/v1/ai/routes', body: args };
      case 'update-ai-route': return { method: 'PUT', path: `/v1/ai/routes/${n}`, body: args };
      case 'delete-ai-route': return { method: 'DELETE', path: `/v1/ai/routes/${n}` };
      default: return { method: 'GET', path: '/' };
    }
  }

  private async callToolMock(name: string, args: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const n = args['name'] as string | undefined;
    switch (name) {
      case 'list-ai-providers':
        return { success: true, data: { data: Array.from(mockProviders.values()) } };
      case 'get-ai-provider':
        if (!n || !mockProviders.has(n)) return { success: false, error: `提供商 ${n} 不存在` };
        return { success: true, data: { data: mockProviders.get(n) } };
      case 'add-ai-provider': {
        if (!n) return { success: false, error: '缺少提供商名称' };
        if (mockProviders.has(n)) return { success: false, error: `提供商 ${n} 已存在` };
        const provider: AIProvider = { name: n, type: args['type'] as string, protocol: (args['protocol'] as string) || 'openai/v1', tokens: args['tokens'] as string[], version: '1' };
        mockProviders.set(n, provider);
        return { success: true, data: { data: provider } };
      }
      case 'update-ai-provider': {
        if (!n || !mockProviders.has(n)) return { success: false, error: `提供商 ${n} 不存在` };
        const existing = mockProviders.get(n)!;
        const updated = { ...existing, ...args, version: String(Number(existing.version || '1') + 1) };
        mockProviders.set(n, updated);
        return { success: true, data: { data: updated } };
      }
      case 'delete-ai-provider': {
        if (!n || !mockProviders.has(n)) return { success: false, error: `提供商 ${n} 不存在` };
        mockProviders.delete(n);
        return { success: true, data: { message: `提供商 ${n} 已删除` } };
      }
      case 'list-ai-routes':
        return { success: true, data: { data: Array.from(mockRoutes.values()) } };
      case 'get-ai-route':
        if (!n || !mockRoutes.has(n)) return { success: false, error: `路由 ${n} 不存在` };
        return { success: true, data: { data: mockRoutes.get(n) } };
      case 'add-ai-route': {
        if (!n) return { success: false, error: '缺少路由名称' };
        if (mockRoutes.has(n)) return { success: false, error: `路由 ${n} 已存在` };
        const route: AIRoute = { name: n, upstreams: args['upstreams'] as AIRoute['upstreams'], fallbackConfig: args['fallbackConfig'] as AIRoute['fallbackConfig'], version: '1' };
        mockRoutes.set(n, route);
        return { success: true, data: { data: route } };
      }
      case 'update-ai-route': {
        if (!n || !mockRoutes.has(n)) return { success: false, error: `路由 ${n} 不存在` };
        const existingRoute = mockRoutes.get(n)!;
        const updatedRoute = { ...existingRoute, ...args, version: String(Number(existingRoute.version || '1') + 1) };
        mockRoutes.set(n, updatedRoute);
        return { success: true, data: { data: updatedRoute } };
      }
      case 'delete-ai-route': {
        if (!n || !mockRoutes.has(n)) return { success: false, error: `路由 ${n} 不存在` };
        mockRoutes.delete(n);
        return { success: true, data: { message: `路由 ${n} 已删除` } };
      }
      default:
        return { success: false, error: `未知工具: ${name}` };
    }
  }
}
