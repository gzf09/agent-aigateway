export { StandardMCPClient } from './client.js';
export { MockMCPClient, mockProviders, mockRoutes } from './mockClient.js';
export type { IMCPClient, MCPClientConfig } from './types.js';
export { AI_PROVIDER_TOOLS, AI_ROUTE_TOOLS, ALL_TOOLS } from './tools.js';

import type { IMCPClient, MCPClientConfig } from './types.js';
import { StandardMCPClient } from './client.js';
import { MockMCPClient } from './mockClient.js';

export function createMCPClient(config: MCPClientConfig): IMCPClient {
  return config.mockMode ? new MockMCPClient() : new StandardMCPClient(config);
}
