import type { MCPToolDefinition } from '@aigateway/shared';

export interface MCPClientConfig {
  mcpServerUrl?: string;
  mockMode?: boolean;
}

export interface IMCPClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getConnectionState(): 'connected' | 'disconnected' | 'connecting' | 'error';
  listTools(): Promise<MCPToolDefinition[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }>;
}
