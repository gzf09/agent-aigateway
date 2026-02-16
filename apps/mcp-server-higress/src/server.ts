import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HigressApiClient } from './higress/apiClient.js';
import { registerProviderTools } from './higress/providerTools.js';
import { registerRouteTools } from './higress/routeTools.js';

export function createMcpServer(higressClient: HigressApiClient): McpServer {
  const server = new McpServer({
    name: 'mcp-server-higress',
    version: '1.0.0',
  });

  registerProviderTools(server, higressClient);
  registerRouteTools(server, higressClient);

  return server;
}
