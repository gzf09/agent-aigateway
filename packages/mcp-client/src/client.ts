import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { MCPToolDefinition } from '@aigateway/shared';
import type { IMCPClient, MCPClientConfig } from './types.js';

export class StandardMCPClient implements IMCPClient {
  private client: Client;
  private transport: SSEClientTransport | null = null;
  private mcpServerUrl: string;
  private state: 'connected' | 'disconnected' | 'connecting' | 'error' = 'disconnected';
  private toolsCache: MCPToolDefinition[] | null = null;

  constructor(config: MCPClientConfig) {
    this.mcpServerUrl = config.mcpServerUrl || 'http://localhost:5000';
    this.client = new Client({ name: 'aigateway-agent', version: '1.0.0' });
  }

  async connect(): Promise<void> {
    this.state = 'connecting';
    try {
      // If the URL already ends with /sse, use it directly; otherwise append /sse
      const sseUrl = this.mcpServerUrl.replace(/\/+$/, '').endsWith('/sse')
        ? this.mcpServerUrl
        : `${this.mcpServerUrl}/sse`;
      this.transport = new SSEClientTransport(new URL(sseUrl));
      await this.client.connect(this.transport);
      this.state = 'connected';
      console.log(`[StandardMCPClient] Connected to MCP Server at ${sseUrl}`);
    } catch (e: unknown) {
      this.state = 'error';
      console.error(`[StandardMCPClient] Connection failed: ${(e as Error).message}`);
      throw e;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.close();
    } catch {
      // ignore close errors
    }
    this.state = 'disconnected';
    this.toolsCache = null;
  }

  getConnectionState(): 'connected' | 'disconnected' | 'connecting' | 'error' {
    return this.state;
  }

  async listTools(): Promise<MCPToolDefinition[]> {
    if (this.toolsCache) return this.toolsCache;

    if (this.state !== 'connected') {
      throw new Error('MCP Client is not connected');
    }

    const result = await this.client.listTools();
    this.toolsCache = result.tools.map((t) => ({
      name: t.name,
      description: t.description || '',
      inputSchema: (t.inputSchema || {}) as Record<string, unknown>,
    }));
    return this.toolsCache;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }> {
    if (this.state !== 'connected') {
      return { success: false, error: 'MCP Client is not connected' };
    }

    try {
      const result = await this.client.callTool({ name, arguments: args });

      // Parse MCP tool result: extract text content
      const textContent = result.content as { type: string; text: string }[];
      const text = textContent
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('');

      if (result.isError) {
        return { success: false, error: text || 'Tool call failed' };
      }

      // Parse JSON response to match existing format
      try {
        const data = JSON.parse(text);
        return { success: true, data };
      } catch {
        return { success: true, data: text };
      }
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message };
    }
  }
}
