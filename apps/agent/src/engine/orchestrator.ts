import type { AgentResponseChunk, ConfirmCard, PlannedToolCall, ChangeLogEntry, DashboardEvent } from '@aigateway/shared';
import { WRITE_TOOLS, ROLLBACK_TRIGGERS, TOOL_TO_RESOURCE_TYPE, TOOL_TO_OPERATION_TYPE } from '@aigateway/shared';
import { generateId, maskApiKey } from '@aigateway/shared';
import { HigressMCPClient } from '@aigateway/mcp-client';
import { ALL_TOOLS } from '@aigateway/mcp-client';
import { ConversationMemory } from '../conversation/memory.js';
import { StaticRulePreprocessor } from '../safety/preprocessor.js';
import { assessRisk, buildConfirmCard } from '../safety/riskAssessor.js';
import { ChangelogManager } from '../rollback/changelogManager.js';
import { RollbackExecutor } from '../rollback/rollbackExecutor.js';
import { SYSTEM_PROMPT } from '../prompts/system.js';

interface SessionState {
  memory: ConversationMemory;
  pendingConfirmation?: {
    toolCalls: PlannedToolCall[];
    card: ConfirmCard;
    beforeStates: Map<string, Record<string, unknown> | null>;
  };
}

export class AgentOrchestrator {
  private sessions = new Map<string, SessionState>();
  private mcpClient: HigressMCPClient;
  private preprocessor = new StaticRulePreprocessor();
  private changelog: ChangelogManager;
  private rollbackExecutor: RollbackExecutor;
  private llmAvailable: boolean;

  constructor(mcpClient: HigressMCPClient, redisUrl?: string) {
    this.mcpClient = mcpClient;
    this.changelog = new ChangelogManager(redisUrl);
    this.rollbackExecutor = new RollbackExecutor(this.changelog, mcpClient);
    this.llmAvailable = !!process.env['LLM_API_KEY'] && process.env['LLM_API_KEY'] !== 'sk-mock-key-for-dev';
  }

  private getSession(sessionId: string): SessionState {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, { memory: new ConversationMemory(sessionId) });
    }
    return this.sessions.get(sessionId)!;
  }

  async *processMessage(sessionId: string, userMessage: string): AsyncGenerator<AgentResponseChunk> {
    const session = this.getSession(sessionId);
    session.memory.addMessage('user', userMessage);

    // Check for rollback intent
    if (ROLLBACK_TRIGGERS.some(t => userMessage.includes(t))) {
      yield* this.handleRollbackIntent(sessionId);
      return;
    }

    // Use intelligent parsing to determine what tools to call
    let parsedIntent: ParsedIntent;
    try {
      parsedIntent = this.parseIntent(userMessage, session);
    } catch (err: unknown) {
      const msg = `解析意图时出错: ${(err as Error).message}`;
      session.memory.addMessage('assistant', msg);
      yield { type: 'error', error: { code: 'PARSE_ERROR', message: msg } };
      return;
    }

    if (parsedIntent.type === 'clarification') {
      const msg = parsedIntent.message;
      session.memory.addMessage('assistant', msg);
      yield { type: 'text', content: msg };
      return;
    }

    if (parsedIntent.type === 'read') {
      const firstToolCall = parsedIntent.toolCalls[0];
      if (!firstToolCall) {
        yield { type: 'error', error: { code: 'NO_TOOL', message: '未能解析出工具调用' } };
        return;
      }
      yield { type: 'tool_start', toolName: firstToolCall.toolName };
      for (const tc of parsedIntent.toolCalls) {
        const result = await this.mcpClient.callTool(tc.toolName, tc.args);
        if (result.success) {
          const formatted = this.formatToolResult(tc.toolName, result.data);
          session.memory.addMessage('assistant', formatted);
          yield { type: 'text', content: formatted };
        } else {
          yield { type: 'error', error: { code: 'TOOL_ERROR', message: result.error || '操作失败' } };
        }
      }
      return;
    }

    if (parsedIntent.type === 'write') {
      // Run preprocessor
      const ppResult = this.preprocessor.evaluate(parsedIntent.toolCalls);
      if (!ppResult.allowed) {
        const msg = `⚠ 操作被拦截: ${ppResult.blockReason}`;
        session.memory.addMessage('assistant', msg);
        yield { type: 'text', content: msg };
        return;
      }

      // Assess risk
      const risk = assessRisk(parsedIntent.toolCalls, ppResult);
      const warnings = ppResult.additionalWarnings;

      // Get before states for update/delete operations
      const beforeStates = new Map<string, Record<string, unknown> | null>();
      for (const tc of parsedIntent.toolCalls) {
        const opType = TOOL_TO_OPERATION_TYPE[tc.toolName];
        if (opType === 'update' || opType === 'delete') {
          const resourceType = TOOL_TO_RESOURCE_TYPE[tc.toolName];
          const getName = `get-${resourceType}`;
          const result = await this.mcpClient.callTool(getName, { name: tc.args['name'] });
          beforeStates.set(tc.toolName, result.success ? (result.data as { data: Record<string, unknown> })?.data || null : null);
        } else {
          beforeStates.set(tc.toolName, null);
        }
      }

      // Build confirmation card for the first write operation
      const firstWrite = parsedIntent.toolCalls[0];
      if (!firstWrite) {
        yield { type: 'error', error: { code: 'NO_TOOL', message: '未能解析出写操作工具调用' } };
        return;
      }
      const beforeState = beforeStates.get(firstWrite.toolName) || null;
      const card = buildConfirmCard(firstWrite.toolName, firstWrite.args, beforeState, risk, warnings);

      session.pendingConfirmation = { toolCalls: parsedIntent.toolCalls, card, beforeStates };

      // Show plan for multi-step operations
      if (parsedIntent.toolCalls.length > 1) {
        const planText = this.formatMultiStepPlan(parsedIntent.toolCalls);
        yield { type: 'text', content: planText };
      }

      yield { type: 'confirm_card', card };
      return;
    }

    // Default: natural language response
    const msg = this.generateDefaultResponse(userMessage, session);
    session.memory.addMessage('assistant', msg);
    yield { type: 'text', content: msg };
  }

  async *handleConfirm(sessionId: string, action: 'accept' | 'cancel', confirmedName?: string): AsyncGenerator<AgentResponseChunk> {
    const session = this.getSession(sessionId);
    const pending = session.pendingConfirmation;

    if (!pending) {
      yield { type: 'text', content: '当前没有待确认的操作。' };
      return;
    }

    if (action === 'cancel') {
      session.pendingConfirmation = undefined;
      const msg = '操作已取消。';
      session.memory.addMessage('assistant', msg);
      yield { type: 'text', content: msg };
      return;
    }

    // For name_input type, validate the name
    if (pending.card.type === 'name_input') {
      if (confirmedName !== pending.card.resourceName) {
        yield { type: 'text', content: `名称不匹配。请输入 "${pending.card.resourceName}" 以确认删除。` };
        return;
      }
    }

    // Execute all tool calls
    session.pendingConfirmation = undefined;
    const results: string[] = [];

    for (let i = 0; i < pending.toolCalls.length; i++) {
      const tc = pending.toolCalls[i]!;
      yield { type: 'tool_start', toolName: tc.toolName };

      const result = await this.mcpClient.callTool(tc.toolName, tc.args);

      if (result.success) {
        // Record in changelog
        const beforeState = pending.beforeStates.get(tc.toolName) || null;
        const opType = (TOOL_TO_OPERATION_TYPE[tc.toolName] || 'create') as ChangeLogEntry['operationType'];
        const resourceType = (TOOL_TO_RESOURCE_TYPE[tc.toolName] || 'ai-provider') as ChangeLogEntry['resourceType'];
        const resourceName = (tc.args['name'] as string) || '';

        const entry = await this.changelog.addEntry(sessionId, {
          sessionId, operationType: opType, resourceType, resourceName,
          beforeState, afterState: (result.data as { data?: Record<string, unknown> })?.data || null,
          changeSummary: this.buildChangeSummary(tc),
        });

        session.memory.addResourceReference(resourceType, resourceName);
        results.push(`✓ ${this.describeToolCall(tc)} 完成`);

        yield { type: 'tool_result', result: { toolName: tc.toolName, success: true, data: result.data } };
        yield { type: 'rollback_hint', snapshotId: entry.id, versionId: entry.versionId };

        // Dashboard event
        const event: DashboardEvent = {
          eventType: resourceType.includes('provider') ? 'provider_changed' : 'route_changed',
          resourceType, resourceName, action: opType,
        };
        yield { type: 'dashboard_event', event };
      } else {
        results.push(`✗ ${this.describeToolCall(tc)} 失败: ${result.error}`);
        yield { type: 'error', error: { code: 'TOOL_ERROR', message: result.error || '操作失败' } };
        break;
      }
    }

    const summary = results.join('\n') + '\n\n如有异常，回复"回滚上一步"即可撤销。';
    session.memory.addMessage('assistant', summary);
    yield { type: 'text', content: summary };
  }

  private async *handleRollbackIntent(sessionId: string): AsyncGenerator<AgentResponseChunk> {
    const result = await this.rollbackExecutor.rollbackLast(sessionId);
    if (result.success) {
      const entry = await this.changelog.getEntry(sessionId, result.fromVersion);
      const msg = `✓ 已回滚。${entry ? `操作 "${entry.changeSummary}" 已撤销。` : '上一步操作已撤销。'}`;
      const session = this.getSession(sessionId);
      session.memory.addMessage('assistant', msg);
      yield { type: 'text', content: msg };
      if (entry) {
        yield { type: 'dashboard_event', event: { eventType: 'operation_added', resourceType: entry.resourceType, resourceName: entry.resourceName, action: 'rollback' } };
      }
    } else {
      yield { type: 'text', content: `回滚失败: ${result.failedAt?.error || '未知错误'}` };
    }
  }

  async *handleRollbackToVersion(sessionId: string, targetVersionId: number): AsyncGenerator<AgentResponseChunk> {
    const result = await this.rollbackExecutor.rollbackToVersion(sessionId, targetVersionId);
    if (result.success) {
      const msg = `✓ 已回滚到版本 v${targetVersionId}，共撤销 ${result.stepsRolledBack} 个操作。`;
      yield { type: 'text', content: msg };
      yield { type: 'dashboard_event', event: { eventType: 'operation_added', resourceType: 'ai-route', action: 'rollback' } };
    } else {
      yield { type: 'text', content: `回滚失败: 在步骤 v${result.failedAt?.versionId} 处失败 - ${result.failedAt?.error}。已成功回滚 ${result.stepsRolledBack} 步。` };
    }
  }

  async getTimeline(sessionId: string) {
    return this.rollbackExecutor.getTimeline(sessionId);
  }

  // ===== Intent Parsing (Rule-based for MVP, LLM-enhanced later) =====
  private parseIntent(message: string, session: SessionState): ParsedIntent {
    const lower = message.toLowerCase();

    // List operations
    if (/列出|查看所有|show all|list/.test(lower) && /提供商|provider/.test(lower)) {
      return { type: 'read', toolCalls: [{ toolName: 'list-ai-providers', args: {} }] };
    }
    if (/列出|查看所有|show all|list/.test(lower) && /路由|route/.test(lower)) {
      return { type: 'read', toolCalls: [{ toolName: 'list-ai-routes', args: {} }] };
    }
    if (/整体配置|全局状态|概览|overview/.test(lower)) {
      return { type: 'read', toolCalls: [{ toolName: 'list-ai-providers', args: {} }, { toolName: 'list-ai-routes', args: {} }] };
    }

    // Get detail
    if (/查看|详情|get|detail/.test(lower) && /提供商|provider/.test(lower)) {
      const name = this.extractName(message, 'provider') || session.memory.resolveReference('提供商')?.name;
      if (name) return { type: 'read', toolCalls: [{ toolName: 'get-ai-provider', args: { name } }] };
    }
    if (/查看|详情|get|detail/.test(lower) && /路由|route/.test(lower)) {
      const name = this.extractName(message, 'route') || session.memory.resolveReference('路由')?.name;
      if (name) return { type: 'read', toolCalls: [{ toolName: 'get-ai-route', args: { name } }] };
    }

    // Add route (must check before Add provider, since route messages may contain provider names)
    if (/创建|添加|搭建|create|add/.test(lower) && /路由|route|网关|gateway/.test(lower)) {
      const parsed = this.parseRouteFromMessage(message, session);
      if (parsed) return { type: 'write', toolCalls: parsed };
      return { type: 'clarification', message: '创建 AI 路由需要以下信息：\n1. 使用哪些 AI 提供商？\n2. 各提供商的流量分配比例（权重总和需为100）？\n\n例如："创建 AI 路由，70% OpenAI 30% DeepSeek"' };
    }

    // Add provider
    if (/配置|添加|创建|接入|add|create/.test(lower) && /提供商|provider|openai|deepseek|qwen|claude|azure/.test(lower)) {
      const parsed = this.parseProviderFromMessage(message);
      if (parsed.name && parsed.type && (parsed.tokens as string[] | undefined)?.length) {
        return { type: 'write', toolCalls: [{ toolName: 'add-ai-provider', args: parsed }] };
      }
      if (parsed.type) {
        return { type: 'clarification', message: `请提供 ${parsed.type} 的 API Key 以完成配置。` };
      }
      return { type: 'clarification', message: '请告诉我要配置哪种 LLM 提供商？（如 openai, deepseek, qwen 等）以及对应的 API Key。' };
    }

    // Delete provider
    if (/删除|移除|remove|delete/.test(lower) && /提供商|provider/.test(lower)) {
      const name = this.extractName(message, 'provider');
      if (name) return { type: 'write', toolCalls: [{ toolName: 'delete-ai-provider', args: { name } }] };
      return { type: 'clarification', message: '请告诉我要删除哪个提供商？' };
    }

    // Update provider
    if (/更新|修改|update|change/.test(lower) && /提供商|provider|key/.test(lower)) {
      const name = this.extractName(message, 'provider');
      if (name) {
        const args: Record<string, unknown> = { name };
        const keys = this.extractApiKeys(message);
        if (keys.length) args['tokens'] = keys;
        return { type: 'write', toolCalls: [{ toolName: 'update-ai-provider', args }] };
      }
      return { type: 'clarification', message: '请告诉我要更新哪个提供商以及更新什么内容？' };
    }

    // Update route (traffic switch)
    if (/切|调整|更新|update|switch/.test(lower) && (/流量|权重|weight|traffic/.test(lower) || /deepseek|openai|qwen/.test(lower))) {
      const parsed = this.parseRouteUpdateFromMessage(message, session);
      if (parsed) return { type: 'write', toolCalls: [parsed] };
    }

    // Delete route
    if (/删除|移除|remove|delete/.test(lower) && /路由|route/.test(lower)) {
      const name = this.extractName(message, 'route');
      if (name) return { type: 'write', toolCalls: [{ toolName: 'delete-ai-route', args: { name } }] };
      return { type: 'clarification', message: '请告诉我要删除哪个路由？' };
    }

    // Complex scenario: build AI gateway from scratch
    if (/搭建|建立|构建/.test(lower) && /网关|gateway/.test(lower)) {
      return this.parseComplexSetup(message);
    }

    // Default
    return { type: 'default', message: '' };
  }

  private parseProviderFromMessage(message: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const lower = message.toLowerCase();

    // Detect provider type
    for (const type of ['openai', 'deepseek', 'qwen', 'claude', 'azure', 'moonshot', 'zhipuai', 'baichuan', 'gemini', 'mistral', 'cohere', 'ollama']) {
      if (lower.includes(type)) {
        result['type'] = type;
        result['name'] = type;
        result['protocol'] = 'openai/v1';
        break;
      }
    }

    // Extract API keys
    const keys = this.extractApiKeys(message);
    if (keys.length) result['tokens'] = keys;

    return result;
  }

  private extractApiKeys(message: string): string[] {
    // Pattern 1: standard API key format (sk-xxx, key-xxx)
    const keyPattern = /(?:sk|key|api[-_]?key)[-_][\w-]{3,}/gi;
    const matches = message.match(keyPattern) || [];
    if (matches.length) return matches;

    // Pattern 2: Chinese "Key是xxx" / "key 是 xxx" / "Key: xxx"
    const cnPattern = /(?:key|api[-_]?key|密钥|token)\s*[是为:\s]\s*([\w-]{5,})/gi;
    let match;
    while ((match = cnPattern.exec(message)) !== null) {
      return [match[1]!];
    }

    // Pattern 3: quoted strings that look like keys
    const quotedPattern = /['"]([\w-]{8,})['"]/g;
    const quoted: string[] = [];
    while ((match = quotedPattern.exec(message)) !== null) {
      quoted.push(match[1]!);
    }
    return quoted;
  }

  private extractName(message: string, type: 'provider' | 'route'): string | null {
    // Try to find quoted names
    const quotedMatch = message.match(/["']([\w-]+)["']/);
    if (quotedMatch) return quotedMatch[1]!;

    // Try common patterns
    if (type === 'provider') {
      for (const p of ['openai', 'deepseek', 'qwen', 'claude', 'azure', 'moonshot']) {
        if (message.toLowerCase().includes(p)) return p;
      }
    }

    // Try to find name after keywords
    const nameMatch = message.match(/(?:名称|名字|叫|name)[是为:\s]+(\S+)/);
    if (nameMatch) return nameMatch[1]!;

    return null;
  }

  private parseRouteFromMessage(message: string, session: SessionState): PlannedToolCall[] | null {
    const lower = message.toLowerCase();
    const upstreams: { provider: string; weight: number; modelMapping?: Record<string, string> }[] = [];
    const providerNames = ['openai', 'deepseek', 'qwen', 'claude', 'azure', 'moonshot', 'zhipuai', 'baichuan', 'gemini', 'mistral', 'cohere', 'ollama'];

    // Pattern: "70% OpenAI 30% DeepSeek" or "openai 70% deepseek 30%"
    const weightPattern = /(\d+)\s*%\s*(openai|deepseek|qwen|claude|azure|moonshot|zhipuai|baichuan|gemini|mistral|cohere|ollama)/gi;
    let match;
    while ((match = weightPattern.exec(message)) !== null) {
      upstreams.push({ provider: match[2]!.toLowerCase(), weight: parseInt(match[1]!, 10) });
    }

    if (upstreams.length === 0) {
      // Try reverse pattern: "openai 70%", "deepseek 30%"
      const reversePattern = /(openai|deepseek|qwen|claude|azure|moonshot|zhipuai|baichuan|gemini|mistral|cohere|ollama)[\s\S]*?(\d+)\s*%/gi;
      while ((match = reversePattern.exec(message)) !== null) {
        upstreams.push({ provider: match[1]!.toLowerCase(), weight: parseInt(match[2]!, 10) });
      }
    }

    if (upstreams.length === 0) {
      // Try single provider with "使用/use provider" pattern (no weight = 100%)
      for (const p of providerNames) {
        if (lower.includes(p)) {
          upstreams.push({ provider: p, weight: 100 });
          break;
        }
      }
    }

    if (upstreams.length === 0) return null;

    const routeName = this.extractName(message, 'route') || `${upstreams.map(u => u.provider).join('-')}-route`;
    const toolCalls: PlannedToolCall[] = [
      { toolName: 'add-ai-route', args: { name: routeName, upstreams } },
    ];

    return toolCalls;
  }

  private parseRouteUpdateFromMessage(message: string, session: SessionState): PlannedToolCall | null {
    const routeRef = session.memory.resolveReference('路由');
    const routeName = this.extractName(message, 'route') || routeRef?.name;
    if (!routeName) return null;

    const lower = message.toLowerCase();
    const upstreams: { provider: string; weight: number }[] = [];

    // "全切到 DeepSeek" pattern
    if (/全切|全部|100%|all/.test(lower)) {
      for (const p of ['openai', 'deepseek', 'qwen', 'claude']) {
        if (lower.includes(p)) {
          upstreams.push({ provider: p, weight: 100 });
          break;
        }
      }
    }

    // Weight pattern
    if (upstreams.length === 0) {
      const weightPattern = /(\d+)\s*%?\s*(openai|deepseek|qwen|claude|[\w-]+)/gi;
      let match;
      while ((match = weightPattern.exec(message)) !== null) {
        upstreams.push({ provider: match[2]!.toLowerCase(), weight: parseInt(match[1]!, 10) });
      }
    }

    if (upstreams.length === 0) return null;

    return { toolName: 'update-ai-route', args: { name: routeName, upstreams } };
  }

  private parseComplexSetup(message: string): ParsedIntent {
    const providers = this.parseProviderFromMessage(message);
    // For complex setup, guide the user
    return {
      type: 'clarification',
      message: '好的，搭建 AI 网关需要以下步骤：\n\n1. **添加 LLM 提供商** — 配置 API Key\n2. **创建 AI 路由** — 设置流量分配和模型映射\n3. **（可选）配置容灾** — 主提供商失败时自动切换\n\n请告诉我：\n- 要接入哪些 LLM 提供商？\n- 各自的 API Key？\n- 流量分配比例？',
    };
  }

  private formatToolResult(toolName: string, data: unknown): string {
    const d = data as { data?: unknown };
    if (toolName === 'list-ai-providers') {
      const providers = (d?.data as { name: string; type: string; tokens?: string[] }[]) || [];
      if (providers.length === 0) return '当前没有配置任何 AI 提供商。';
      return '**AI 提供商列表：**\n\n' + providers.map(p =>
        `- **${p.name}** — 类型: ${p.type}, Token: ${p.tokens?.length || 0} 个`
      ).join('\n');
    }
    if (toolName === 'list-ai-routes') {
      const routes = (d?.data as { name: string; upstreams?: { provider: string; weight: number }[] }[]) || [];
      if (routes.length === 0) return '当前没有配置任何 AI 路由。';
      return '**AI 路由列表：**\n\n' + routes.map(r =>
        `- **${r.name}** — ${r.upstreams?.map(u => `${u.provider}(${u.weight}%)`).join(' + ') || '无上游'}`
      ).join('\n');
    }
    if (toolName.startsWith('get-')) {
      return '```json\n' + JSON.stringify(d?.data, null, 2) + '\n```';
    }
    return JSON.stringify(d, null, 2);
  }

  private formatMultiStepPlan(toolCalls: PlannedToolCall[]): string {
    return '需要执行以下步骤：\n\n' + toolCalls.map((tc, i) =>
      `**步骤 ${i + 1}** — ${this.describeToolCall(tc)}`
    ).join('\n');
  }

  private describeToolCall(tc: PlannedToolCall): string {
    const name = (tc.args['name'] as string) || '';
    switch (tc.toolName) {
      case 'add-ai-provider': return `添加 AI 提供商 ${name}`;
      case 'update-ai-provider': return `更新 AI 提供商 ${name}`;
      case 'delete-ai-provider': return `删除 AI 提供商 ${name}`;
      case 'add-ai-route': return `创建 AI 路由 ${name}`;
      case 'update-ai-route': return `更新 AI 路由 ${name}`;
      case 'delete-ai-route': return `删除 AI 路由 ${name}`;
      default: return `执行 ${tc.toolName}`;
    }
  }

  private buildChangeSummary(tc: PlannedToolCall): string {
    const name = (tc.args['name'] as string) || '';
    const upstreams = tc.args['upstreams'] as { provider: string; weight: number }[] | undefined;
    if (upstreams) {
      return `${this.describeToolCall(tc)}: ${upstreams.map(u => `${u.provider}(${u.weight}%)`).join(' + ')}`;
    }
    return this.describeToolCall(tc);
  }

  private generateDefaultResponse(message: string, session: SessionState): string {
    return `我是 AIGateway Agent，可以帮你管理 AI 网关配置。支持以下操作：

**AI 提供商管理：**
- "列出所有 AI 提供商"
- "配置 OpenAI 接入，Key 是 sk-xxx"
- "删除 deepseek 提供商"

**AI 路由管理：**
- "列出所有 AI 路由"
- "创建 AI 路由，70% OpenAI 30% DeepSeek"
- "把流量全切到 DeepSeek"

**状态查询：**
- "查看网关整体配置"

**回滚操作：**
- "回滚上一步"

请告诉我你需要什么帮助？`;
  }
}

type ParsedIntent =
  | { type: 'read'; toolCalls: PlannedToolCall[] }
  | { type: 'write'; toolCalls: PlannedToolCall[] }
  | { type: 'clarification'; message: string }
  | { type: 'default'; message: string };
