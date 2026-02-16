import type { AgentResponseChunk, ConfirmCard, PlannedToolCall, ChangeLogEntry, DashboardEvent, DebugLogEntry } from '@aigateway/shared';
import { WRITE_TOOLS, ROLLBACK_TRIGGERS, TOOL_TO_RESOURCE_TYPE, TOOL_TO_OPERATION_TYPE } from '@aigateway/shared';
import { generateId, maskApiKey } from '@aigateway/shared';
import type { IMCPClient } from '@aigateway/mcp-client';
import { ConversationMemory } from '../conversation/memory.js';
import { StaticRulePreprocessor } from '../safety/preprocessor.js';
import { assessRisk, buildConfirmCard } from '../safety/riskAssessor.js';
import { ChangelogManager } from '../rollback/changelogManager.js';
import { RollbackExecutor } from '../rollback/rollbackExecutor.js';
import { SYSTEM_PROMPT } from '../prompts/system.js';
import { LLMService } from '../llm/llmService.js';
import { INTENT_PARSING_PROMPT } from '../prompts/intentParsing.js';

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
  private mcpClient: IMCPClient;
  private preprocessor = new StaticRulePreprocessor();
  private changelog: ChangelogManager;
  private rollbackExecutor: RollbackExecutor;
  private llmAvailable: boolean;
  private llmService: LLMService;
  private debugId = 0;
  private _debugQueue: AgentResponseChunk[] = [];
  private _currentRequestId = '';
  private _currentRequestMessage = '';

  constructor(mcpClient: IMCPClient, redisUrl?: string) {
    this.mcpClient = mcpClient;
    this.changelog = new ChangelogManager(redisUrl);
    this.rollbackExecutor = new RollbackExecutor(this.changelog, mcpClient);
    this.llmService = new LLMService();
    this.llmAvailable = this.llmService.isAvailable();
    console.log('[Orchestrator] Initialized (v3 - JSON safeguard in dispatchIntent)');
  }

  private makeDebugLog(category: DebugLogEntry['category'], action: string, request?: unknown, response?: unknown, duration?: number): AgentResponseChunk {
    return {
      type: 'debug_log',
      log: {
        id: `dbg_${++this.debugId}`, timestamp: Date.now(), category, action, request, response, duration,
        requestId: this._currentRequestId, requestMessage: this._currentRequestMessage,
      },
    };
  }

  private pushDebug(category: DebugLogEntry['category'], action: string, request?: unknown, response?: unknown, duration?: number) {
    this._debugQueue.push(this.makeDebugLog(category, action, request, response, duration));
  }

  private *flushDebug(): Generator<AgentResponseChunk> {
    while (this._debugQueue.length > 0) {
      yield this._debugQueue.shift()!;
    }
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

    // Set request context for debug logs
    this._currentRequestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this._currentRequestMessage = userMessage;

    // Check for rollback intent (simple keyword match, always fast path)
    if (ROLLBACK_TRIGGERS.some(t => userMessage.includes(t))) {
      yield* this.handleRollbackIntent(sessionId);
      return;
    }

    // Primary path: LLM-based semantic understanding
    if (this.llmAvailable) {
      const intent = await this.parseLLMIntent(userMessage, session);
      yield* this.flushDebug();
      if (intent) {
        this.pushDebug('intent', 'Parsed Intent', userMessage, intent);
        yield* this.flushDebug();
        yield* this.dispatchIntent(sessionId, session, intent, userMessage);
        return;
      }
      // LLM call failed, fall through to rule-based parsing
    }

    // Fallback path: regex-based rule engine (when LLM unavailable or fails)
    let parsedIntent: ParsedIntent;
    try {
      parsedIntent = this.parseIntent(userMessage, session);
      this.pushDebug('intent', 'Regex Intent Parse', userMessage, parsedIntent);
      yield* this.flushDebug();
    } catch (err: unknown) {
      console.error('[Orchestrator] parseIntent error:', err);
      const msg = `解析意图时出错: ${(err as Error).message}`;
      session.memory.addMessage('assistant', msg);
      yield { type: 'error', error: { code: 'PARSE_ERROR', message: msg } };
      return;
    }

    yield* this.dispatchIntent(sessionId, session, parsedIntent, userMessage);
  }

  private async *dispatchIntent(sessionId: string, session: SessionState, intent: ParsedIntent, userMessage: string): AsyncGenerator<AgentResponseChunk> {
    if (intent.type === 'clarification' || intent.type === 'chat') {
      let message = intent.message;
      // Safeguard: if message looks like raw JSON intent, re-parse and re-dispatch
      if (message.trimStart().startsWith('{')) {
        try {
          const reparsed = JSON.parse(message) as Record<string, unknown>;
          if (reparsed.type === 'read' && reparsed.toolName) {
            const readIntent: ParsedIntent = {
              type: 'read',
              toolCalls: [{ toolName: reparsed.toolName as string, args: (reparsed.args as Record<string, unknown>) || {} }],
            };
            yield* this.dispatchIntent(sessionId, session, readIntent, userMessage);
            return;
          }
          if (reparsed.type === 'write' && reparsed.toolName) {
            const writeIntent: ParsedIntent = {
              type: 'write',
              toolCalls: [{ toolName: reparsed.toolName as string, args: (reparsed.args as Record<string, unknown>) || {} }],
            };
            yield* this.dispatchIntent(sessionId, session, writeIntent, userMessage);
            return;
          }
          if (reparsed.type === 'chat' && reparsed.message) {
            message = reparsed.message as string;
          } else if (reparsed.type === 'clarification' && reparsed.message) {
            message = reparsed.message as string;
          }
        } catch {
          // Not valid JSON — use as-is
        }
      }
      session.memory.addMessage('assistant', message);
      yield { type: 'text', content: message };
      return;
    }

    if (intent.type === 'read') {
      const firstToolCall = intent.toolCalls[0];
      if (!firstToolCall) {
        yield { type: 'error', error: { code: 'NO_TOOL', message: '未能解析出工具调用' } };
        return;
      }
      yield { type: 'tool_start', toolName: firstToolCall.toolName };
      for (const tc of intent.toolCalls) {
        const t0 = Date.now();
        const result = await this.mcpClient.callTool(tc.toolName, tc.args);
        yield this.makeDebugLog('mcp', `callTool: ${tc.toolName}`, { toolName: tc.toolName, args: tc.args }, result, Date.now() - t0);
        if (result.success) {
          const formatted = this.formatToolResult(tc.toolName, result.data);
          session.memory.addMessage('assistant', formatted);
          yield { type: 'text', content: formatted };
        } else {
          const friendly = this.friendlyError(tc.toolName, tc.args, result.error || '操作失败');
          console.error(`[Orchestrator] Tool ${tc.toolName} failed:`, result.error);
          session.memory.addMessage('assistant', friendly);
          yield { type: 'text', content: friendly };
        }
      }
      return;
    }

    if (intent.type === 'write') {
      yield* this.handleWriteIntent(sessionId, session, intent.toolCalls);
      return;
    }

    // type === 'default': static fallback
    const msg = this.generateDefaultResponse(userMessage, session);
    session.memory.addMessage('assistant', msg);
    yield { type: 'text', content: msg };
  }

  private async *handleWriteIntent(sessionId: string, session: SessionState, toolCalls: PlannedToolCall[]): AsyncGenerator<AgentResponseChunk> {
    // Auto-fill defaults for add-ai-provider
    for (const tc of toolCalls) {
      if (tc.toolName === 'add-ai-provider') {
        if (!tc.args['protocol']) tc.args['protocol'] = 'openai/v1';
        // Ensure tokens is an array
        if (typeof tc.args['tokens'] === 'string') {
          tc.args['tokens'] = [tc.args['tokens']];
        }
      }
    }

    // Run preprocessor
    const ppResult = this.preprocessor.evaluate(toolCalls);
    if (!ppResult.allowed) {
      const msg = `⚠ 操作被拦截: ${ppResult.blockReason}`;
      session.memory.addMessage('assistant', msg);
      yield { type: 'text', content: msg };
      return;
    }

    // Assess risk
    const risk = assessRisk(toolCalls, ppResult);
    const warnings = ppResult.additionalWarnings;

    // Get before states for update/delete operations
    const beforeStates = new Map<string, Record<string, unknown> | null>();
    for (const tc of toolCalls) {
      const opType = TOOL_TO_OPERATION_TYPE[tc.toolName];
      if (opType === 'update' || opType === 'delete') {
        const resourceType = TOOL_TO_RESOURCE_TYPE[tc.toolName];
        const getName = `get-${resourceType}`;
        const t0bs = Date.now();
        const result = await this.mcpClient.callTool(getName, { name: tc.args['name'] });
        this.pushDebug('mcp', `beforeState: ${getName}`, { toolName: getName, args: { name: tc.args['name'] } }, result, Date.now() - t0bs);

        if (!result.success) {
          // Resource doesn't exist — abort with friendly message for update/delete
          yield* this.flushDebug();
          const friendly = this.friendlyError(getName, tc.args as Record<string, unknown>, result.error || 'not found');
          session.memory.addMessage('assistant', friendly);
          yield { type: 'text', content: friendly };
          return;
        }

        const currentState = (result.data as { data: Record<string, unknown> })?.data || null;
        beforeStates.set(tc.toolName, currentState);

        // For update operations, merge existing state into args so required fields (type, protocol, etc.) are present
        if (opType === 'update' && currentState) {
          for (const [key, value] of Object.entries(currentState)) {
            if (tc.args[key] === undefined) {
              tc.args[key] = value;
            }
          }
        }
      } else {
        beforeStates.set(tc.toolName, null);
      }
    }

    yield* this.flushDebug();

    // Build confirmation card for the first write operation
    const firstWrite = toolCalls[0];
    if (!firstWrite) {
      yield { type: 'error', error: { code: 'NO_TOOL', message: '未能解析出写操作工具调用' } };
      return;
    }
    const beforeState = beforeStates.get(firstWrite.toolName) || null;
    const card = buildConfirmCard(firstWrite.toolName, firstWrite.args, beforeState, risk, warnings);

    session.pendingConfirmation = { toolCalls, card, beforeStates };

    // Show plan for multi-step operations
    if (toolCalls.length > 1) {
      const planText = this.formatMultiStepPlan(toolCalls);
      yield { type: 'text', content: planText };
    }

    yield { type: 'confirm_card', card };
  }

  private async parseLLMIntent(message: string, session: SessionState): Promise<ParsedIntent | null> {
    let response = '';
    try {
      // Build conversation context for LLM
      const recentMessages = session.memory.buildLLMMessages().slice(-6);
      // Include recent conversation for context, the last message is the current user message
      const llmMessages: { role: 'user' | 'assistant'; content: string }[] = [];
      for (const msg of recentMessages) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          llmMessages.push({ role: msg.role, content: msg.content });
        }
      }
      // Ensure the last message is the current user message
      if (llmMessages.length === 0 || llmMessages[llmMessages.length - 1]?.content !== message) {
        llmMessages.push({ role: 'user', content: message });
      }

      const t0 = Date.now();
      response = await this.llmService.chat(INTENT_PARSING_PROMPT, llmMessages);
      this.pushDebug('llm', 'LLM Intent Parse', { system: '(INTENT_PARSING_PROMPT)', messages: llmMessages }, { raw: response }, Date.now() - t0);

      const parsed = this.extractIntentJSON(response);
      if (!parsed) {
        console.error('[Orchestrator] Failed to extract JSON from LLM response:', response.slice(0, 300));
        return null;
      }

      if (parsed.type === 'read' && parsed.toolName) {
        return {
          type: 'read',
          toolCalls: [{ toolName: parsed.toolName as string, args: (parsed.args as Record<string, unknown>) || {} }],
        };
      }
      if (parsed.type === 'write' && parsed.toolName) {
        return {
          type: 'write',
          toolCalls: [{ toolName: parsed.toolName as string, args: (parsed.args as Record<string, unknown>) || {} }],
        };
      }
      if (parsed.type === 'clarification' && parsed.message) {
        return { type: 'clarification', message: parsed.message as string };
      }
      if (parsed.type === 'chat' && parsed.message) {
        return { type: 'chat', message: parsed.message as string };
      }

      return null;
    } catch (e: unknown) {
      console.error('[Orchestrator] parseLLMIntent error:', (e as Error).message);
      // Never return raw JSON-like strings as a chat message — fall through to regex parser
      return null;
    }
  }

  /**
   * Extract a JSON intent object from the LLM response string.
   * Handles: BOM, smart/curly quotes (common in Chinese LLMs), code fences, surrounding text.
   */
  private extractIntentJSON(text: string): Record<string, unknown> | null {
    // Step 1: Normalize characters that break JSON.parse
    const normalized = text
      .replace(/^\uFEFF/, '')                                   // BOM
      .replace(/[\u201C\u201D\u2018\u2019\uFF02]/g, '"')       // Smart/curly/fullwidth double quotes → "
      .replace(/[\uFF1A]/g, ':')                                // Fullwidth colon → :
      .replace(/[\uFF0C]/g, ',')                                // Fullwidth comma → ,
      .replace(/^```(?:json)?\s*/s, '')                         // Opening code fence
      .replace(/\s*```\s*$/s, '')                               // Closing code fence
      .trim();

    // Step 2: Try parsing the entire cleaned string
    try { return JSON.parse(normalized); } catch { /* continue */ }

    // Step 3: Extract first JSON object { ... } from the string
    const match = normalized.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* continue */ }
    }

    return null;
  }

  getLLMConfig() {
    return this.llmService.getConfig();
  }

  updateLLMConfig(config: { provider?: string; apiKey?: string; baseURL?: string; model?: string }) {
    this.llmService.updateConfig(config);
    this.llmAvailable = this.llmService.isAvailable();
  }

  async *handleConfirm(sessionId: string, action: 'accept' | 'cancel', confirmedName?: string): AsyncGenerator<AgentResponseChunk> {
    const session = this.getSession(sessionId);
    const pending = session.pendingConfirmation;

    // Set request context for debug logs
    this._currentRequestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this._currentRequestMessage = action === 'accept' ? `确认: ${pending?.card.title || '执行操作'}` : '取消操作';

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

      const t0w = Date.now();
      const result = await this.mcpClient.callTool(tc.toolName, tc.args);
      yield this.makeDebugLog('mcp', `callTool: ${tc.toolName}`, { toolName: tc.toolName, args: tc.args }, result, Date.now() - t0w);

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

        // Read-after-write verification for create operations
        if (opType === 'create' && resourceName) {
          const getToolName = `get-${resourceType}`;
          const t0v = Date.now();
          const verifyResult = await this.mcpClient.callTool(getToolName, { name: resourceName });
          yield this.makeDebugLog('mcp', `verify: ${getToolName}`, { toolName: getToolName, args: { name: resourceName } }, verifyResult, Date.now() - t0v);
          if (!verifyResult.success) {
            results.push(`⚠ 验证警告: ${resourceName} 创建返回成功，但验证读取失败: ${verifyResult.error}`);
          }
        }

        yield { type: 'tool_result', result: { toolName: tc.toolName, success: true, data: result.data } };
        yield { type: 'rollback_hint', snapshotId: entry.id, versionId: entry.versionId };

        // Dashboard event
        const event: DashboardEvent = {
          eventType: resourceType.includes('provider') ? 'provider_changed' : 'route_changed',
          resourceType, resourceName, action: opType,
        };
        yield { type: 'dashboard_event', event };
      } else {
        const friendly = this.friendlyError(tc.toolName, tc.args, result.error || '操作失败');
        results.push(`✗ ${this.describeToolCall(tc)} 失败: ${friendly}`);
        yield { type: 'tool_result', result: { toolName: tc.toolName, success: false, error: friendly } };
        yield { type: 'text', content: friendly };
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

  // ===== Rule-based Intent Parsing (fallback when LLM unavailable) =====
  private parseIntent(message: string, session: SessionState): ParsedIntent {
    const lower = message.toLowerCase();

    // List operations — broad patterns to match various Chinese input styles
    if (/列出|查看|看.*所有|所有.*看|show all|list|有哪些/.test(lower) && /提供商|provider/.test(lower)) {
      return { type: 'read', toolCalls: [{ toolName: 'list-ai-providers', args: {} }] };
    }
    if (/列出|查看|看.*所有|所有.*看|show all|list|有哪些/.test(lower) && /路由|route/.test(lower)) {
      return { type: 'read', toolCalls: [{ toolName: 'list-ai-routes', args: {} }] };
    }
    if (/整体配置|全局状态|概览|overview|网关状态|gateway status/.test(lower)) {
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

    // Knowledge questions about AI gateway concepts
    if (/什么是|是什么|有什么用|怎么理解|为什么要|的含义|的概念|的作用/.test(lower)) {
      const answer = this.answerKnowledgeQuestion(lower);
      if (answer) return { type: 'chat', message: answer };
    }

    // Greetings and chat
    if (/^(你好|hi|hello|hey|嗨|您好|早上好|下午好|晚上好)/.test(lower) || /你是谁|你能做什么/.test(lower)) {
      return { type: 'chat', message: '你好！我是 AIGateway Agent，可以帮你管理 Higress AI 网关的提供商和路由配置。你可以用自然语言告诉我你想做什么，比如"添加一个 OpenAI 提供商"或"查看当前路由配置"。' };
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

  private answerKnowledgeQuestion(lower: string): string | null {
    if (/提供商|provider/.test(lower)) {
      return 'AI 提供商（AI Provider）是指提供大语言模型 API 服务的平台，例如 OpenAI、DeepSeek、通义千问等。在 Higress AI 网关中，你需要先配置提供商（包括类型和 API Key），然后才能通过路由将用户请求转发到对应的模型服务。一个提供商代表一个 LLM 服务的接入点。';
    }
    if (/路由|route/.test(lower)) {
      return 'AI 路由（AI Route）是 Higress AI 网关中的流量分发规则。它决定用户的请求被转发到哪个 AI 提供商。通过路由，你可以实现：\n- **流量分配**：将请求按比例分发到多个提供商（如 70% OpenAI + 30% DeepSeek）\n- **灰度发布**：逐步将流量从旧模型切换到新模型\n- **容灾切换**：当主提供商不可用时自动切换到备用提供商';
    }
    if (/权重|weight|流量分配/.test(lower)) {
      return '权重（Weight）用于控制 AI 路由中各提供商的流量分配比例。所有上游提供商的权重总和必须等于 100。例如设置 OpenAI 权重 70、DeepSeek 权重 30，表示 70% 的请求会发送到 OpenAI，30% 发送到 DeepSeek。通过调整权重，你可以实现流量的灵活分配和平滑迁移。';
    }
    if (/higress/.test(lower)) {
      return 'Higress 是一个开源的云原生 API 网关，支持 AI 网关功能。它可以统一管理多个 LLM 提供商的接入，提供流量分发、负载均衡、容灾切换、API Key 管理等能力。通过 Higress AI 网关，你可以用统一的 API 接口访问不同的大模型服务，而无需修改业务代码。';
    }
    if (/网关|gateway/.test(lower)) {
      return 'AI 网关是介于用户应用和 AI 模型服务之间的中间层。它的主要作用包括：\n- **统一入口**：用一个 API 接口访问多个 LLM 提供商\n- **流量管理**：按比例分配请求到不同模型\n- **安全管控**：统一管理 API Key，避免密钥泄露\n- **容灾保障**：主服务不可用时自动切换备用服务\n- **可观测性**：监控各提供商的调用量和延迟';
    }
    if (/容灾|fallback|切换/.test(lower)) {
      return '容灾（Fallback）是 AI 路由的一项保障机制。当主提供商出现故障或超时时，网关会自动将请求切换到预设的备用提供商，确保服务不中断。你可以为路由配置容灾策略，包括触发条件（如特定 HTTP 状态码）和备用提供商列表。';
    }
    if (/token|api.?key|密钥/.test(lower)) {
      return 'Token（API Key）是访问 AI 提供商服务所需的身份凭证。每个提供商都需要配置至少一个有效的 API Key。在网关中，Token 可以统一管理，用户应用无需直接持有各提供商的 Key，从而降低密钥泄露风险。一个提供商可以配置多个 Token 以实现 Key 轮转和故障转移。';
    }
    return null;
  }

  private formatToolResult(toolName: string, data: unknown): string {
    const d = data as { data?: unknown };
    if (toolName === 'list-ai-providers') {
      const providers = (d?.data as { name: string; type: string; protocol?: string; tokens?: string[] }[]) || [];
      if (providers.length === 0) return '当前没有配置任何 AI 提供商。';
      const rows = providers.map(p =>
        `| ${p.name} | ${p.type} | ${p.protocol || 'openai/v1'} | ${p.tokens?.length || 0} |`
      ).join('\n');
      return `当前配置了 ${providers.length} 个 AI 提供商：\n\n| 名称 | 类型 | 协议 | Token 数 |\n|------|------|------|---------|` + '\n' + rows;
    }
    if (toolName === 'list-ai-routes') {
      const routes = (d?.data as { name: string; upstreams?: { provider: string; weight: number }[] }[]) || [];
      if (routes.length === 0) return '当前没有配置任何 AI 路由。';
      const rows = routes.map(r => {
        const traffic = r.upstreams?.map(u => `${u.provider}(${u.weight}%)`).join(' + ') || '无上游';
        return `| ${r.name} | ${traffic} |`;
      }).join('\n');
      return `当前配置了 ${routes.length} 条 AI 路由：\n\n| 路由名 | 流量分配 |\n|--------|---------|` + '\n' + rows;
    }
    if (toolName === 'get-ai-provider') {
      const p = d?.data as { name?: string; type?: string; protocol?: string; tokens?: string[] } | undefined;
      if (!p) return '未找到该提供商。';
      const maskedTokens = p.tokens?.map(t => t.length > 6 ? t.slice(0, 3) + '•••' + t.slice(-3) : '•••').join(', ') || '无';
      return `**提供商: ${p.name}**\n- 类型: ${p.type}\n- 协议: ${p.protocol || 'openai/v1'}\n- Token: ${maskedTokens}`;
    }
    if (toolName === 'get-ai-route') {
      const r = d?.data as { name?: string; upstreams?: { provider: string; weight: number }[]; fallbackConfig?: { enabled?: boolean } } | undefined;
      if (!r) return '未找到该路由。';
      const traffic = r.upstreams?.map(u => `${u.provider}(${u.weight}%)`).join(' + ') || '无上游';
      const fallback = r.fallbackConfig?.enabled ? '已启用' : '未启用';
      return `**路由: ${r.name}**\n- 流量分配: ${traffic}\n- 容灾: ${fallback}`;
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

  /**
   * Convert raw HTTP errors (e.g. "HTTP 404: null") into user-friendly messages.
   */
  private friendlyError(toolName: string, args: Record<string, unknown>, rawError: string): string {
    const name = (args['name'] as string) || '';
    const is404 = /HTTP\s*404/i.test(rawError);

    if (is404) {
      switch (toolName) {
        case 'get-ai-provider':
        case 'update-ai-provider':
        case 'delete-ai-provider':
          return `当前不存在名为 "${name}" 的 AI 提供商。`;
        case 'get-ai-route':
        case 'update-ai-route':
        case 'delete-ai-route':
          return `当前不存在名为 "${name}" 的 AI 路由。`;
        default:
          return `未找到请求的资源 "${name}"。`;
      }
    }

    // Check for other common HTTP errors
    const httpMatch = rawError.match(/HTTP\s*(\d+)/i);
    if (httpMatch) {
      const code = parseInt(httpMatch[1]!, 10);
      if (code === 409) return `资源 "${name}" 已存在，无法重复创建。`;
      if (code === 400) return `请求参数有误，请检查输入内容。`;
      if (code === 401 || code === 403) return `认证失败，请检查 Higress Console 的账号密码配置。`;
      if (code >= 500) return `Higress 服务端错误 (${code})，请检查 Higress Console 是否正常运行。`;
    }

    return rawError;
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
  | { type: 'chat'; message: string }
  | { type: 'default'; message: string };
