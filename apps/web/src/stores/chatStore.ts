import { create } from 'zustand';
import type { ConfirmCard, AgentResponseChunk, DebugLogEntry } from '@aigateway/shared';
import { useDashboardStore } from './dashboardStore.js';
import { useDebugStore } from './debugStore.js';

export interface ToolCallStatus {
  toolName: string;
  status: 'calling' | 'done' | 'error';
}

export interface ChatMessageUI {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  confirmCard?: ConfirmCard;
  toolStatus?: { toolName: string; status: 'calling' | 'done' | 'error' };
  toolCalls?: ToolCallStatus[];
  operationResult?: { success: boolean; message: string; rollbackVersionId?: number };
  isStreaming?: boolean;
}

interface ChatState {
  sessionId: string;
  messages: ChatMessageUI[];
  isProcessing: boolean;
  pendingConfirmCard: ConfirmCard | null;
  agentHealthy: boolean;
  healthData: { mock?: boolean; higressConsoleUrl?: string; llm?: { provider?: string; model?: string; available?: boolean } } | null;

  setSessionId: (id: string) => void;
  setAgentHealthy: (v: boolean) => void;
  setHealthData: (d: ChatState['healthData']) => void;

  sendMessage: (content: string) => Promise<void>;
  sendConfirm: (confirmedName?: string) => Promise<void>;
  sendCancel: () => Promise<void>;
  sendRollback: () => Promise<void>;
  clearChat: () => Promise<void>;
}

const AGENT_BASE = '/api/session';

let msgId = 0;
const nextId = () => `m_${++msgId}_${Date.now()}`;

export const useChatStore = create<ChatState>((set, get) => ({
  sessionId: '',
  messages: [],
  isProcessing: false,
  pendingConfirmCard: null,
  agentHealthy: false,
  healthData: null,

  setSessionId: (id) => set({ sessionId: id }),
  setAgentHealthy: (v) => set({ agentHealthy: v }),
  setHealthData: (d) => set({ healthData: d }),

  sendMessage: async (content: string) => {
    const { sessionId, isProcessing } = get();
    if (!sessionId || isProcessing) return;

    // Add user message + assistant placeholder
    set((s) => ({
      isProcessing: true,
      pendingConfirmCard: null,
      messages: [
        ...s.messages,
        { id: nextId(), role: 'user', content, timestamp: Date.now() },
        { id: nextId(), role: 'assistant', content: '', timestamp: Date.now(), isStreaming: true },
      ],
    }));

    await streamRequest(`${AGENT_BASE}/message`, { sessionId, message: content });
  },

  sendConfirm: async (confirmedName?: string) => {
    const { sessionId } = get();
    if (!sessionId) return;

    set((s) => ({
      isProcessing: true,
      pendingConfirmCard: null,
      messages: [
        ...s.messages,
        { id: nextId(), role: 'assistant', content: '', timestamp: Date.now(), isStreaming: true },
      ],
    }));

    await streamRequest(`${AGENT_BASE}/confirm`, {
      sessionId,
      action: 'accept',
      confirmedName,
    });
  },

  sendCancel: async () => {
    const { sessionId } = get();
    if (!sessionId) return;

    set((s) => ({
      isProcessing: true,
      pendingConfirmCard: null,
      messages: [
        ...s.messages,
        { id: nextId(), role: 'assistant', content: '', timestamp: Date.now(), isStreaming: true },
      ],
    }));

    await streamRequest(`${AGENT_BASE}/confirm`, { sessionId, action: 'cancel' });
  },

  sendRollback: async () => {
    const { sessionId } = get();
    if (!sessionId) return;

    set((s) => ({
      isProcessing: true,
      messages: [
        ...s.messages,
        { id: nextId(), role: 'user', content: '回滚上一步', timestamp: Date.now() },
        { id: nextId(), role: 'assistant', content: '', timestamp: Date.now(), isStreaming: true },
      ],
    }));

    await streamRequest(`/api/dashboard/rollback`, { sessionId });
  },

  clearChat: async () => {
    try {
      const resp = await fetch('/api/session/create', { method: 'POST' });
      const data = await resp.json() as { sessionId: string };
      sessionStorage.setItem('aigateway_sid', data.sessionId);
      set({ sessionId: data.sessionId, messages: [], pendingConfirmCard: null, isProcessing: false });
    } catch {
      // If create fails, just clear messages with a local session id
      const id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem('aigateway_sid', id);
      set({ sessionId: id, messages: [], pendingConfirmCard: null, isProcessing: false });
    }
  },
}));

// ===== SSE Stream Parser =====

async function streamRequest(url: string, body: unknown) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      if (response.status === 404) {
        appendToLastAssistant('[Agent 服务不可用，请检查服务是否正在运行]');
        useChatStore.setState({ agentHealthy: false });
      } else {
        appendToLastAssistant(`[请求失败: ${response.status}]`);
      }
      finalizeStream();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const dataStr = line.slice(6).trim();
        if (!dataStr) continue;
        try {
          const chunk = JSON.parse(dataStr);
          handleChunk(chunk);
        } catch { /* skip */ }
      }
    }
  } catch (err: unknown) {
    appendToLastAssistant(`[连接错误: ${(err as Error).message}]`);
  } finally {
    finalizeStream();
    // Refresh dashboard data after any operation
    refreshDashboard();
  }
}

function handleChunk(chunk: Record<string, unknown>) {
  switch (chunk.type) {
    case 'text':
      // When text arrives, auto-finalize any pending tool calls (LLM responds after tools complete)
      autoFinalizeToolCalls();
      appendToLastAssistant(chunk.content as string || '');
      break;

    case 'confirm_card':
      autoFinalizeToolCalls();
      finalizeStream();
      useChatStore.setState({ pendingConfirmCard: chunk.card as ConfirmCard });
      break;

    case 'clarification': {
      autoFinalizeToolCalls();
      const q = chunk.question as { question: string; options?: { label: string; value: string }[] };
      appendToLastAssistant(q.question || '');
      break;
    }

    case 'tool_start': {
      const toolName = chunk.toolName as string;
      // Attach tool call to the current streaming assistant message
      useChatStore.setState((s) => {
        const msgs = [...s.messages];
        for (let i = msgs.length - 1; i >= 0; i--) {
          const m = msgs[i];
          if (m && m.role === 'assistant' && m.isStreaming) {
            const toolCalls = [...(m.toolCalls || []), { toolName, status: 'calling' as const }];
            msgs[i] = { ...m, toolCalls };
            break;
          }
        }
        return { messages: msgs };
      });
      break;
    }

    case 'tool_result': {
      const result = chunk.result as { toolName: string; success: boolean; data?: unknown; error?: string };
      useChatStore.setState((s) => {
        const msgs = [...s.messages];
        // Find the last assistant message with matching tool call
        for (let i = msgs.length - 1; i >= 0; i--) {
          const m = msgs[i];
          if (m && m.role === 'assistant' && m.toolCalls) {
            const toolCalls = [...m.toolCalls];
            // Find the last matching calling tool
            for (let j = toolCalls.length - 1; j >= 0; j--) {
              if (toolCalls[j]!.toolName === result.toolName && toolCalls[j]!.status === 'calling') {
                toolCalls[j] = { ...toolCalls[j]!, status: result.success ? 'done' : 'error' };
                break;
              }
            }
            msgs[i] = { ...m, toolCalls };
            break;
          }
        }
        return { messages: msgs };
      });
      break;
    }

    case 'rollback_hint':
      // Show rollback version info inline
      break;

    case 'dashboard_event':
      // Will be handled by the refreshDashboard() call after stream ends
      break;

    case 'error': {
      autoFinalizeToolCalls();
      const err = chunk.error as { message?: string };
      appendToLastAssistant(`\n[错误: ${err?.message || '未知错误'}]`);
      break;
    }

    case 'debug_log': {
      const log = chunk.log as DebugLogEntry;
      useDebugStore.getState().addLog(log);
      break;
    }

    case 'done':
      // Stream will end naturally
      break;
  }
}

/** When text starts streaming, mark any still-calling tool calls as done */
function autoFinalizeToolCalls() {
  useChatStore.setState((s) => {
    const msgs = [...s.messages];
    let changed = false;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m && m.role === 'assistant' && m.isStreaming && m.toolCalls) {
        const hasCallingTools = m.toolCalls.some((t) => t.status === 'calling');
        if (hasCallingTools) {
          const toolCalls = m.toolCalls.map((t) =>
            t.status === 'calling' ? { ...t, status: 'done' as const } : t
          );
          msgs[i] = { ...m, toolCalls };
          changed = true;
        }
        break;
      }
    }
    return changed ? { messages: msgs } : s;
  });
}

function appendToLastAssistant(text: string) {
  useChatStore.setState((s) => {
    const msgs = [...s.messages];
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m && m.role === 'assistant' && m.isStreaming) {
        msgs[i] = { ...m, content: m.content + text };
        break;
      }
    }
    return { messages: msgs };
  });
}

function finalizeStream() {
  useChatStore.setState((s) => {
    const msgs = s.messages.map((m) => {
      if (!m.isStreaming) return m;
      // Auto-finalize any remaining calling tools
      const toolCalls = m.toolCalls?.map((t) =>
        t.status === 'calling' ? { ...t, status: 'done' as const } : t
      );
      return { ...m, isStreaming: false, toolCalls: toolCalls || m.toolCalls };
    });
    // Remove empty assistant messages (no content and no tool calls)
    const cleaned = msgs.filter((m) =>
      !(m.role === 'assistant' && !m.isStreaming && !m.content.trim() && (!m.toolCalls || m.toolCalls.length === 0))
    );
    return { messages: cleaned, isProcessing: false };
  });
}

async function refreshDashboard() {
  const { sessionId } = useChatStore.getState();
  if (!sessionId) return;

  try {
    const resp = await fetch(`/api/dashboard/timeline?sessionId=${encodeURIComponent(sessionId)}`);
    if (resp.ok) {
      const data = await resp.json();
      if (data.data) {
        useDashboardStore.getState().setTimeline(data.data);
      }
    }
  } catch { /* ignore */ }

  // Also refresh gateway data (providers + routes) since a write op may have changed them
  useDashboardStore.getState().fetchGatewayData();
}
