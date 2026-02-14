import type { PlannedToolCall, PreprocessorResult } from '@aigateway/shared';

interface PreprocessorRule {
  id: string;
  description: string;
  evaluate(toolCalls: PlannedToolCall[]): PreprocessorResult | null;
}

const rules: PreprocessorRule[] = [
  {
    id: 'R001',
    description: '全量流量切换检测',
    evaluate(toolCalls) {
      for (const tc of toolCalls) {
        if (tc.toolName === 'update-ai-route') {
          const upstreams = tc.args['upstreams'] as { weight: number }[] | undefined;
          if (upstreams?.some(u => u.weight === 0 || u.weight === 100)) {
            return { allowed: true, riskOverride: 'high', additionalWarnings: ['此操作会将全部流量切换到单一提供商，请谨慎操作'] };
          }
        }
      }
      return null;
    },
  },
  {
    id: 'R002',
    description: '删除生产路由检测',
    evaluate(toolCalls) {
      for (const tc of toolCalls) {
        if (tc.toolName === 'delete-ai-route') {
          const name = tc.args['name'] as string;
          if (name && /prod|production|main/.test(name)) {
            return { allowed: true, riskOverride: 'high', additionalWarnings: [`检测到正在删除疑似生产路由 "${name}"，请确认这不是生产环境的关键路由`] };
          }
        }
      }
      return null;
    },
  },
  {
    id: 'R003',
    description: 'API Key 变更检测',
    evaluate(toolCalls) {
      for (const tc of toolCalls) {
        if (tc.toolName === 'update-ai-provider' && tc.args['tokens']) {
          return { allowed: true, additionalWarnings: ['API Key 即将变更，请确认新 Key 有效'] };
        }
      }
      return null;
    },
  },
  {
    id: 'R005',
    description: 'AI 路由权重总和校验',
    evaluate(toolCalls) {
      for (const tc of toolCalls) {
        if ((tc.toolName === 'add-ai-route' || tc.toolName === 'update-ai-route') && tc.args['upstreams']) {
          const upstreams = tc.args['upstreams'] as { weight: number }[];
          const total = upstreams.reduce((sum, u) => sum + (u.weight || 0), 0);
          if (total !== 100) {
            return { allowed: false, blockReason: `上游权重总和为 ${total}，必须等于 100。请调整后重试。` };
          }
        }
      }
      return null;
    },
  },
  {
    id: 'R007',
    description: '批量操作检测',
    evaluate(toolCalls) {
      const writeCalls = toolCalls.filter(tc => tc.toolName.startsWith('add-') || tc.toolName.startsWith('update-') || tc.toolName.startsWith('delete-'));
      if (writeCalls.length >= 3) {
        return { allowed: true, additionalWarnings: [`此次操作包含 ${writeCalls.length} 个写操作，属于批量操作`] };
      }
      return null;
    },
  },
];

export class StaticRulePreprocessor {
  evaluate(toolCalls: PlannedToolCall[]): PreprocessorResult {
    const allWarnings: string[] = [];
    let highestRisk: 'medium' | 'high' | undefined;

    for (const rule of rules) {
      const result = rule.evaluate(toolCalls);
      if (!result) continue;
      if (!result.allowed) return result;
      if (result.riskOverride) {
        if (!highestRisk || result.riskOverride === 'high') highestRisk = result.riskOverride;
      }
      if (result.additionalWarnings) allWarnings.push(...result.additionalWarnings);
    }

    return {
      allowed: true,
      riskOverride: highestRisk,
      additionalWarnings: allWarnings.length > 0 ? allWarnings : undefined,
    };
  }
}
