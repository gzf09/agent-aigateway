import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HigressApiClient } from './apiClient.js';

export function registerProviderTools(server: McpServer, client: HigressApiClient) {
  server.tool(
    'list-ai-providers',
    '列出所有已配置的 AI/LLM 提供商',
    {},
    async () => {
      const result = await client.request('GET', '/v1/ai/providers');
      if (!result.success) {
        return { content: [{ type: 'text' as const, text: result.error || '操作失败' }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result.data) }] };
    },
  );

  server.tool(
    'get-ai-provider',
    '获取指定 AI 提供商的详细配置信息',
    { name: z.string().describe('提供商名称') },
    async ({ name }) => {
      const result = await client.request('GET', `/v1/ai/providers/${name}`);
      if (!result.success) {
        return { content: [{ type: 'text' as const, text: result.error || '操作失败' }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result.data) }] };
    },
  );

  server.tool(
    'add-ai-provider',
    '添加新的 AI/LLM 提供商。支持 26 种提供商类型。',
    {
      name: z.string().describe('提供商名称（唯一标识）'),
      type: z.string().describe('提供商类型，如 openai, deepseek, qwen 等'),
      tokens: z.array(z.string()).describe('API Key 列表'),
      protocol: z.string().optional().describe('协议类型，如 openai/v1 或 original'),
    },
    async (args) => {
      const body = client.buildProviderBody(args as Record<string, unknown>);
      const result = await client.request('POST', '/v1/ai/providers', body);
      if (!result.success) {
        return { content: [{ type: 'text' as const, text: result.error || '操作失败' }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result.data) }] };
    },
  );

  server.tool(
    'update-ai-provider',
    '更新已有 AI 提供商的配置，如更换 API Key、启用 Token 容灾等',
    {
      name: z.string().describe('提供商名称'),
      type: z.string().optional().describe('提供商类型'),
      tokens: z.array(z.string()).optional().describe('新的 API Key 列表'),
      protocol: z.string().optional().describe('协议类型'),
      tokenFailoverConfig: z.record(z.unknown()).optional().describe('Token 容灾配置'),
    },
    async (args) => {
      const body = client.buildProviderBody(args as Record<string, unknown>);
      const result = await client.request('PUT', `/v1/ai/providers/${args.name}`, body);
      if (!result.success) {
        return { content: [{ type: 'text' as const, text: result.error || '操作失败' }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result.data) }] };
    },
  );

  server.tool(
    'delete-ai-provider',
    '删除指定的 AI 提供商。删除前请确认没有 AI 路由引用该提供商。',
    { name: z.string().describe('提供商名称') },
    async ({ name }) => {
      const result = await client.request('DELETE', `/v1/ai/providers/${name}`);
      if (!result.success) {
        return { content: [{ type: 'text' as const, text: result.error || '操作失败' }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result.data) }] };
    },
  );
}
