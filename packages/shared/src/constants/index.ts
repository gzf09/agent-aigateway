export const LLM_PROVIDER_TYPES = [
  'qwen', 'openai', 'moonshot', 'azure', 'ai360', 'github', 'groq', 'baichuan',
  'yi', 'deepseek', 'zhipuai', 'ollama', 'claude', 'baidu', 'hunyuan', 'stepfun',
  'minimax', 'cloudflare', 'spark', 'gemini', 'deepl', 'mistral', 'cohere',
  'doubao', 'coze', 'together-ai',
] as const;

export type LLMProviderType = (typeof LLM_PROVIDER_TYPES)[number];

export const RISK_LEVELS = { LOW: 'low', MEDIUM: 'medium', HIGH: 'high' } as const;
export type RiskLevel = (typeof RISK_LEVELS)[keyof typeof RISK_LEVELS];

export const OPERATION_TYPES = { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' } as const;
export type OperationType = (typeof OPERATION_TYPES)[keyof typeof OPERATION_TYPES];

export const RESOURCE_TYPES = {
  AI_PROVIDER: 'ai-provider',
  AI_ROUTE: 'ai-route',
  ROUTE: 'route',
  SERVICE_SOURCE: 'service-source',
  PLUGIN: 'plugin',
  MCP_SERVER: 'mcp-server',
} as const;

export const WRITE_TOOLS = new Set([
  'add-ai-provider', 'update-ai-provider', 'delete-ai-provider',
  'add-ai-route', 'update-ai-route', 'delete-ai-route',
  'add-route', 'update-route', 'delete-route',
  'add-service-source', 'update-service-source', 'delete-service-source',
  'update-request-block-plugin', 'delete-plugin',
  'add-or-update-mcp-server', 'delete-mcp-server',
]);

export const READ_TOOLS = new Set([
  'list-ai-providers', 'get-ai-provider',
  'list-ai-routes', 'get-ai-route',
  'list-routes', 'get-route',
  'list-service-sources', 'get-service-source',
  'list-plugin-instances', 'get-plugin',
  'list-mcp-servers', 'get-mcp-server',
]);

export const TOOL_TO_RESOURCE_TYPE: Record<string, string> = {
  'list-ai-providers': 'ai-provider', 'get-ai-provider': 'ai-provider',
  'add-ai-provider': 'ai-provider', 'update-ai-provider': 'ai-provider', 'delete-ai-provider': 'ai-provider',
  'list-ai-routes': 'ai-route', 'get-ai-route': 'ai-route',
  'add-ai-route': 'ai-route', 'update-ai-route': 'ai-route', 'delete-ai-route': 'ai-route',
};

export const TOOL_TO_OPERATION_TYPE: Record<string, string> = {
  'add-ai-provider': 'create', 'update-ai-provider': 'update', 'delete-ai-provider': 'delete',
  'add-ai-route': 'create', 'update-ai-route': 'update', 'delete-ai-route': 'delete',
};

export const ROLLBACK_TRIGGERS = ['回滚上一步', '回滚', '撤销', 'undo', 'rollback', '恢复上一步'];
