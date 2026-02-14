import type { MCPToolDefinition } from '@aigateway/shared';

export const AI_PROVIDER_TOOLS: MCPToolDefinition[] = [
  {
    name: 'list-ai-providers',
    description: '列出所有已配置的 AI/LLM 提供商',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get-ai-provider',
    description: '获取指定 AI 提供商的详细配置信息',
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: '提供商名称' } }, required: ['name'] },
  },
  {
    name: 'add-ai-provider',
    description: '添加新的 AI/LLM 提供商。支持 26 种提供商类型。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '提供商名称（唯一标识）' },
        type: { type: 'string', description: '提供商类型，如 openai, deepseek, qwen 等' },
        tokens: { type: 'array', items: { type: 'string' }, description: 'API Key 列表' },
        protocol: { type: 'string', enum: ['openai/v1', 'original'], description: '协议类型' },
      },
      required: ['name', 'type', 'tokens'],
    },
  },
  {
    name: 'update-ai-provider',
    description: '更新已有 AI 提供商的配置，如更换 API Key、启用 Token 容灾等',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '提供商名称' },
        tokens: { type: 'array', items: { type: 'string' }, description: '新的 API Key 列表' },
        protocol: { type: 'string', description: '协议类型' },
        tokenFailoverConfig: { type: 'object', description: 'Token 容灾配置' },
      },
      required: ['name'],
    },
  },
  {
    name: 'delete-ai-provider',
    description: '删除指定的 AI 提供商。删除前请确认没有 AI 路由引用该提供商。',
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: '提供商名称' } }, required: ['name'] },
  },
];

export const AI_ROUTE_TOOLS: MCPToolDefinition[] = [
  {
    name: 'list-ai-routes',
    description: '列出所有 AI 路由配置',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get-ai-route',
    description: '获取指定 AI 路由的详细配置',
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: '路由名称' } }, required: ['name'] },
  },
  {
    name: 'add-ai-route',
    description: '创建新的 AI 路由。支持多模型负载均衡（权重总和必须等于100）、模型名称映射、容灾回退。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '路由名称' },
        upstreams: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              provider: { type: 'string' },
              weight: { type: 'number' },
              modelMapping: { type: 'object' },
            },
          },
          description: '上游提供商列表，权重总和必须等于 100',
        },
        fallbackConfig: { type: 'object', description: '容灾回退配置' },
      },
      required: ['name', 'upstreams'],
    },
  },
  {
    name: 'update-ai-route',
    description: '更新 AI 路由配置，如调整权重分配、添加容灾等',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '路由名称' },
        upstreams: { type: 'array', description: '上游提供商列表' },
        fallbackConfig: { type: 'object', description: '容灾回退配置' },
      },
      required: ['name'],
    },
  },
  {
    name: 'delete-ai-route',
    description: '删除指定的 AI 路由。删除后相关流量将无法路由。',
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: '路由名称' } }, required: ['name'] },
  },
];

export const ALL_TOOLS: MCPToolDefinition[] = [...AI_PROVIDER_TOOLS, ...AI_ROUTE_TOOLS];
