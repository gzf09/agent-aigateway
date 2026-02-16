import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HigressApiClient } from './apiClient.js';

const upstreamSchema = z.object({
  provider: z.string(),
  weight: z.number(),
  modelMapping: z.record(z.string()).optional(),
});

export function registerRouteTools(server: McpServer, client: HigressApiClient) {
  server.tool(
    'list-ai-routes',
    '列出所有 AI 路由配置',
    {},
    async () => {
      const result = await client.request('GET', '/v1/ai/routes');
      if (!result.success) {
        return { content: [{ type: 'text' as const, text: result.error || '操作失败' }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result.data) }] };
    },
  );

  server.tool(
    'get-ai-route',
    '获取指定 AI 路由的详细配置',
    { name: z.string().describe('路由名称') },
    async ({ name }) => {
      const result = await client.request('GET', `/v1/ai/routes/${name}`);
      if (!result.success) {
        return { content: [{ type: 'text' as const, text: result.error || '操作失败' }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result.data) }] };
    },
  );

  server.tool(
    'add-ai-route',
    '创建新的 AI 路由。支持多模型负载均衡（权重总和必须等于100）、模型名称映射、容灾回退。',
    {
      name: z.string().describe('路由名称'),
      upstreams: z.array(upstreamSchema).describe('上游提供商列表，权重总和必须等于 100'),
      fallbackConfig: z.record(z.unknown()).optional().describe('容灾回退配置'),
    },
    async (args) => {
      const result = await client.request('POST', '/v1/ai/routes', args);
      if (!result.success) {
        return { content: [{ type: 'text' as const, text: result.error || '操作失败' }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result.data) }] };
    },
  );

  server.tool(
    'update-ai-route',
    '更新 AI 路由配置，如调整权重分配、添加容灾等',
    {
      name: z.string().describe('路由名称'),
      upstreams: z.array(upstreamSchema).optional().describe('上游提供商列表'),
      fallbackConfig: z.record(z.unknown()).optional().describe('容灾回退配置'),
    },
    async (args) => {
      const result = await client.request('PUT', `/v1/ai/routes/${args.name}`, args);
      if (!result.success) {
        return { content: [{ type: 'text' as const, text: result.error || '操作失败' }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result.data) }] };
    },
  );

  server.tool(
    'delete-ai-route',
    '删除指定的 AI 路由。删除后相关流量将无法路由。',
    { name: z.string().describe('路由名称') },
    async ({ name }) => {
      const result = await client.request('DELETE', `/v1/ai/routes/${name}`);
      if (!result.success) {
        return { content: [{ type: 'text' as const, text: result.error || '操作失败' }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result.data) }] };
    },
  );
}
