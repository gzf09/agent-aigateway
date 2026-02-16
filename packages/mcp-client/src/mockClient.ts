import type { AIProvider, AIRoute, MCPToolDefinition } from '@aigateway/shared';
import type { IMCPClient } from './types.js';
import { ALL_TOOLS } from './tools.js';

// Mock data store for local development
export const mockProviders: Map<string, AIProvider> = new Map();
export const mockRoutes: Map<string, AIRoute> = new Map();

export class MockMCPClient implements IMCPClient {
  private connected = false;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  getConnectionState(): 'connected' | 'disconnected' | 'connecting' | 'error' {
    return this.connected ? 'connected' : 'disconnected';
  }

  async listTools(): Promise<MCPToolDefinition[]> {
    return ALL_TOOLS;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }> {
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
