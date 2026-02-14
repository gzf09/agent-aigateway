import { create } from 'zustand';
import type { ConfirmCard, AgentResponseChunk } from '@aigateway/shared';
import { useDashboardStore } from './dashboardStore.js';

export interface ChatMessageUI {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  confirmCard?: ConfirmCard;
  toolStatus?: { toolName: string; status: 'calling' | 'done' | 'error' };
  operationResult?: { success: boolean; message: string; rollbackVersionId?: number };
  isStreaming?: boolean;
}

interface ChatState {
  sessionId: string;
  messages: ChatMessageUI[];
  isProcessing: boolean;
  pendingConfirmCard: ConfirmCard | null;
  agentHealthy: boolean;

  setSessionId: (id: string) => void;
  setAgentHealthy: (v: boolean) => void;

  sendMessage: (content: string) => Promise<void>;
  sendConfirm: (confirmedName?: string) => Promise<void>;
  sendCancel: () => Promise<void>;
  sendRollback: () => Promise<void>;
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

  setSessionId: (id) => set({ sessionId: id }),
  setAgentHealthy: (v) => set({ agentHealthy: v }),

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
      appendToLastAssistant(`[请求失败: ${response.status}]`);
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
      appendToLastAssistant(chunk.content as string || '');
      break;

    case 'confirm_card':
      finalizeStream();
      useChatStore.setState({ pendingConfirmCard: chunk.card as ConfirmCard });
      break;

    case 'clarification': {
      const q = chunk.question as { question: string; options?: { label: string; value: string }[] };
      appendToLastAssistant(q.question || '');
      break;
    }

    case 'tool_start': {
      const toolName = chunk.toolName as string;
      useChatStore.setState((s) => ({
        messages: [...s.messages, {
          id: nextId(), role: 'system', content: '',
          timestamp: Date.now(),
          toolStatus: { toolName, status: 'calling' },
        }],
      }));
      break;
    }

    case 'tool_result': {
      const result = chunk.result as { toolName: string; success: boolean; data?: unknown; error?: string };
      useChatStore.setState((s) => ({
        messages: [...s.messages, {
          id: nextId(), role: 'system', content: '',
          timestamp: Date.now(),
          toolStatus: { toolName: result.toolName, status: result.success ? 'done' : 'error' },
        }],
      }));
      break;
    }

    case 'rollback_hint':
      // Show rollback version info inline
      break;

    case 'dashboard_event':
      // Will be handled by the refreshDashboard() call after stream ends
      break;

    case 'error': {
      const err = chunk.error as { message?: string };
      appendToLastAssistant(`\n[错误: ${err?.message || '未知错误'}]`);
      break;
    }

    case 'done':
      // Stream will end naturally
      break;
  }
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
    const msgs = s.messages.map((m) =>
      m.isStreaming ? { ...m, isStreaming: false } : m
    );
    // Remove empty assistant messages
    const cleaned = msgs.filter((m) => !(m.role === 'assistant' && !m.isStreaming && !m.content.trim()));
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
}
