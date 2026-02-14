import type { PlannedToolCall, PreprocessorResult, ConfirmCard, SummaryCard, DiffCard, NameInputCard } from '@aigateway/shared';
import { WRITE_TOOLS, TOOL_TO_OPERATION_TYPE } from '@aigateway/shared';
import { maskApiKey } from '@aigateway/shared';

export function assessRisk(toolCalls: PlannedToolCall[], preprocessorResult: PreprocessorResult): 'low' | 'medium' | 'high' {
  let risk: 'low' | 'medium' | 'high' = 'low';
  for (const tc of toolCalls) {
    if (!WRITE_TOOLS.has(tc.toolName)) continue;
    const opType = TOOL_TO_OPERATION_TYPE[tc.toolName];
    if (opType === 'delete') risk = 'high';
    else if (opType === 'update' && risk !== 'high') risk = 'medium';
    else if (opType === 'create' && risk === 'low') risk = 'low';
  }
  if (preprocessorResult.riskOverride) {
    if (preprocessorResult.riskOverride === 'high') risk = 'high';
    else if (preprocessorResult.riskOverride === 'medium' && risk === 'low') risk = 'medium';
  }
  return risk;
}

export function buildConfirmCard(
  toolName: string,
  args: Record<string, unknown>,
  currentState: Record<string, unknown> | null,
  risk: 'low' | 'medium' | 'high',
  warnings?: string[],
): ConfirmCard {
  const opType = TOOL_TO_OPERATION_TYPE[toolName] || 'create';
  const resourceName = (args['name'] as string) || 'unknown';

  if (opType === 'delete') {
    return buildNameInputCard(toolName, resourceName, currentState, warnings);
  }
  if (opType === 'update' && currentState) {
    return buildDiffCard(toolName, args, currentState, risk as 'medium' | 'high', warnings);
  }
  return buildSummaryCard(toolName, args);
}

function buildSummaryCard(toolName: string, args: Record<string, unknown>): SummaryCard {
  const fields: { label: string; value: string }[] = [];
  const resourceName = (args['name'] as string) || '';

  if (toolName.includes('provider')) {
    fields.push({ label: '名称', value: resourceName });
    fields.push({ label: '类型', value: (args['type'] as string) || '' });
    fields.push({ label: '协议', value: (args['protocol'] as string) || 'openai/v1' });
    const tokens = args['tokens'] as string[] | undefined;
    if (tokens?.length) {
      fields.push({ label: 'API Key', value: tokens.map(t => maskApiKey(t)).join(', ') });
    }
  } else if (toolName.includes('route')) {
    fields.push({ label: '路由名称', value: resourceName });
    const upstreams = args['upstreams'] as { provider: string; weight: number }[] | undefined;
    if (upstreams) {
      fields.push({ label: '上游分配', value: upstreams.map(u => `${u.provider} (${u.weight}%)`).join(' + ') });
    }
    const fc = args['fallbackConfig'] as { enabled?: boolean } | undefined;
    fields.push({ label: '容灾', value: fc?.enabled ? '已启用' : '未启用' });
  }

  return {
    type: 'summary', riskLevel: 'low',
    title: toolName.includes('provider') ? `创建 AI 提供商` : `创建 AI 路由`,
    resourceType: toolName.includes('provider') ? 'ai-provider' : 'ai-route',
    resourceName, fields,
  };
}

function buildDiffCard(toolName: string, args: Record<string, unknown>, currentState: Record<string, unknown>, risk: 'medium' | 'high', warnings?: string[]): DiffCard {
  const changes: DiffCard['changes'] = [];
  const resourceName = (args['name'] as string) || '';

  if (toolName.includes('route') && args['upstreams'] && currentState['upstreams']) {
    const oldUpstreams = currentState['upstreams'] as { provider: string; weight: number }[];
    const newUpstreams = args['upstreams'] as { provider: string; weight: number }[];
    for (const nu of newUpstreams) {
      const ou = oldUpstreams.find(o => o.provider === nu.provider);
      if (!ou) {
        changes.push({ field: `${nu.provider} 权重`, oldValue: '无', newValue: `${nu.weight}%`, changeType: 'added' });
      } else if (ou.weight !== nu.weight) {
        changes.push({ field: `${nu.provider} 权重`, oldValue: `${ou.weight}%`, newValue: `${nu.weight}%`, changeType: 'modified' });
      }
    }
    for (const ou of oldUpstreams) {
      if (!newUpstreams.find(n => n.provider === ou.provider)) {
        changes.push({ field: `${ou.provider} 权重`, oldValue: `${ou.weight}%`, newValue: '已移除', changeType: 'removed' });
      }
    }
  }

  if (toolName.includes('provider') && args['tokens']) {
    changes.push({ field: 'API Key', oldValue: '(已配置)', newValue: '(已更新)', changeType: 'modified' });
  }

  if (changes.length === 0) {
    changes.push({ field: '配置', oldValue: '(当前配置)', newValue: '(更新后配置)', changeType: 'modified' });
  }

  return {
    type: 'diff', riskLevel: risk,
    title: `更新 ${toolName.includes('provider') ? 'AI 提供商' : 'AI 路由'}: ${resourceName}`,
    resourceType: toolName.includes('provider') ? 'ai-provider' : 'ai-route',
    resourceName, changes, warnings,
  };
}

function buildNameInputCard(toolName: string, resourceName: string, currentState: Record<string, unknown> | null, warnings?: string[]): NameInputCard {
  let impactDescription = `删除后相关配置将被移除。`;
  if (toolName.includes('route') && currentState) {
    const upstreams = currentState['upstreams'] as { provider: string; weight: number }[] | undefined;
    if (upstreams) {
      impactDescription = `该路由当前承载流量: ${upstreams.map(u => `${u.provider}(${u.weight}%)`).join(' + ')}。删除后相关流量将无法路由。`;
    }
  }
  return {
    type: 'name_input', riskLevel: 'high',
    title: `删除 ${toolName.includes('provider') ? 'AI 提供商' : 'AI 路由'}: ${resourceName}`,
    resourceType: toolName.includes('provider') ? 'ai-provider' : 'ai-route',
    resourceName, impactDescription,
    warnings: warnings || ['请谨慎操作，删除后可通过回滚恢复'],
  };
}
