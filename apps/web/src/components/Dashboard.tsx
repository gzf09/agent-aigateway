import { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, PanelRightClose, Clock, Server, GitBranch,
  CheckCircle2, Plus, RefreshCw, Trash2, Undo2, Bug
} from 'lucide-react';
import { useDashboardStore } from '../stores/dashboardStore.js';
import { useChatStore } from '../stores/chatStore.js';
import { DebugPanel } from './DebugPanel.js';
import type { ChangeLogEntry, AIProvider, AIRoute } from '@aigateway/shared';

interface DashboardProps {
  onClose: () => void;
}

export function Dashboard({ onClose }: DashboardProps) {
  const { activeTab, setActiveTab, timeline, setTimeline, providers, routes, fetchGatewayData } = useDashboardStore();
  const { sessionId, agentHealthy } = useChatStore();

  // Fetch timeline
  useEffect(() => {
    if (!sessionId) return;
    const fetchTimeline = async () => {
      try {
        const resp = await fetch(`/api/dashboard/timeline?sessionId=${encodeURIComponent(sessionId)}`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.data) setTimeline(data.data);
        }
      } catch { /* ignore */ }
    };
    fetchTimeline();
    const iv = setInterval(fetchTimeline, 8000);
    return () => clearInterval(iv);
  }, [sessionId]);

  // Fetch real gateway data (providers + routes) on mount and periodically
  useEffect(() => {
    if (!agentHealthy) return;
    fetchGatewayData();
    const iv = setInterval(fetchGatewayData, 10000);
    return () => clearInterval(iv);
  }, [agentHealthy]);

  return (
    <div className="flex h-full w-80 flex-col border-l border-border bg-sidebar">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">网关状态</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex px-4 pt-3 gap-1 shrink-0">
        {[
          { key: 'overview' as const, label: '概览', icon: GitBranch },
          { key: 'debug' as const, label: '调试', icon: Bug },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              activeTab === tab.key
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'overview' && <OverviewWithTimeline providers={providers} routes={routes} timeline={timeline} />}
        {activeTab === 'debug' && <DebugPanel />}
      </div>

      {/* Footer */}
      <div className="border-t border-border px-4 py-2">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${agentHealthy ? 'bg-success' : 'bg-warning'}`} />
          {agentHealthy ? 'Higress 网关连接正常' : '网关连接中...'}
        </div>
      </div>
    </div>
  );
}

/** Combined view: overview stats on top, operation history below */
function OverviewWithTimeline({ providers, routes, timeline }: { providers: AIProvider[]; routes: AIRoute[]; timeline: ChangeLogEntry[] }) {
  return (
    <div className="space-y-5">
      <OverviewView providers={providers} routes={routes} timeline={timeline} />
      <div className="border-t border-border pt-4">
        <TimelineView timeline={timeline} />
      </div>
    </div>
  );
}

function TimelineView({ timeline }: { timeline: ChangeLogEntry[] }) {
  const { sessionId, isProcessing } = useChatStore();

  const handleRollbackToVersion = async (entry: ChangeLogEntry) => {
    if (!sessionId || isProcessing) return;

    // Add messages to chat: user action + assistant placeholder
    useChatStore.setState((s) => ({
      isProcessing: true,
      messages: [
        ...s.messages,
        { id: `m_${++rollbackMsgId}_${Date.now()}`, role: 'user' as const, content: `回滚操作: ${entry.changeSummary} (v${entry.versionId})`, timestamp: Date.now() },
        { id: `m_${++rollbackMsgId}_${Date.now()}`, role: 'assistant' as const, content: '', timestamp: Date.now(), isStreaming: true },
      ],
    }));

    try {
      const response = await fetch('/api/dashboard/rollback-to-version', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, versionId: entry.versionId }),
      });

      if (!response.ok || !response.body) {
        appendToLastAssistant(`[回滚失败: ${response.status}]`);
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
            if (chunk.type === 'text') {
              appendToLastAssistant(chunk.content || '');
            } else if (chunk.type === 'error') {
              appendToLastAssistant(`\n[错误: ${chunk.error?.message || '未知错误'}]`);
            }
          } catch { /* skip */ }
        }
      }
    } catch (err: unknown) {
      appendToLastAssistant(`[连接错误: ${(err as Error).message}]`);
    } finally {
      finalizeStream();
      refreshDashboard(sessionId);
    }
  };

  const typeIcons = { create: Plus, update: RefreshCw, delete: Trash2 };
  const typeColors = {
    create: 'text-success',
    update: 'text-warning',
    delete: 'text-destructive',
  };
  const typeBg = {
    create: 'bg-success/10 border-success/20',
    update: 'bg-warning/10 border-warning/20',
    delete: 'bg-destructive/10 border-destructive/20',
  };
  const typeLabels = { create: '创建', update: '修改', delete: '删除' };

  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        <Clock className="h-3.5 w-3.5" />
        操作历史
        {timeline.length > 0 && (
          <span className="ml-auto rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary font-bold">
            {timeline.length}
          </span>
        )}
      </h3>
      {timeline.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-10 h-10 bg-muted rounded-xl flex items-center justify-center mb-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-[11px] text-muted-foreground">暂无操作记录</p>
        </div>
      ) : (
        timeline.map((entry, i) => {
          const op = entry.operationType as keyof typeof typeIcons;
          const Icon = typeIcons[op] || Plus;
          const isRolledBack = entry.rollbackStatus === 'rolled_back';
          const canRollback = !isRolledBack && entry.rollbackStatus === 'active';
          return (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] transition-colors hover:bg-muted/50 ${
                isRolledBack ? 'opacity-50' : ''
              }`}
            >
              <Icon className={`h-3 w-3 shrink-0 ${typeColors[op] || 'text-primary'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${typeBg[op] || ''} ${typeColors[op] || ''}`}>
                    {typeLabels[op] || op}
                  </span>
                  <span className="text-xs font-medium text-foreground truncate">{entry.resourceName}</span>
                  {isRolledBack && (
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">已回滚</span>
                  )}
                </div>
                <p className="text-muted-foreground mt-0.5 truncate">{entry.changeSummary}</p>
              </div>
              <div className="flex flex-col items-end shrink-0 gap-0.5">
                <span className="text-[10px] font-mono text-muted-foreground">v{entry.versionId}</span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                {canRollback && (
                  <button
                    onClick={() => handleRollbackToVersion(entry)}
                    disabled={isProcessing}
                    className="mt-0.5 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-warning bg-warning/10 border border-warning/20 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-warning/20 disabled:opacity-30 disabled:cursor-not-allowed"
                    title={`回滚此操作 (v${entry.versionId})`}
                  >
                    <Undo2 className="h-2.5 w-2.5" />
                    回滚
                  </button>
                )}
              </div>
            </motion.div>
          );
        })
      )}
    </div>
  );
}

function OverviewView({ providers, routes, timeline }: { providers: AIProvider[]; routes: AIRoute[]; timeline: ChangeLogEntry[] }) {
  const rollbacks = timeline.filter((t) => t.rollbackStatus === 'rolled_back').length;

  const stats = [
    { label: '提供商', value: providers.length, icon: Server, color: 'text-primary' },
    { label: '路由', value: routes.length, icon: GitBranch, color: 'text-success' },
    { label: '总操作数', value: timeline.length, icon: Activity, color: 'text-info' },
    { label: '已回滚', value: rollbacks, icon: Undo2, color: 'text-warning' },
  ];

  return (
    <div className="space-y-4">
      {/* Stats grid - always visible */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-lg border border-border bg-muted/30 p-3"
          >
            <div className="flex items-center gap-2 mb-2">
              <s.icon className={`h-3.5 w-3.5 ${s.color}`} />
              <span className="text-[11px] text-muted-foreground font-medium">{s.label}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Providers list */}
      {providers.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Server className="h-3.5 w-3.5" />
            AI 提供商
            <span className="ml-auto rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
              {providers.length}
            </span>
          </h3>
          <div className="space-y-1.5">
            {providers.map((p, i) => (
              <motion.div
                key={p.name}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-foreground">{p.name}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">{p.type}</span>
                    <span className="text-[10px] text-muted-foreground">{p.protocol || 'openai/v1'}</span>
                    {p.tokens && (
                      <span className="text-[10px] text-muted-foreground">Token: {p.tokens.length}</span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Routes list */}
      {routes.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <GitBranch className="h-3.5 w-3.5" />
            AI 路由
            <span className="ml-auto rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
              {routes.length}
            </span>
          </h3>
          <div className="space-y-1.5">
            {routes.map((r, i) => (
              <motion.div
                key={r.name}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-foreground">{r.name}</span>
                  {r.upstreams && r.upstreams.length > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                      {r.upstreams.map(u => `${u.provider}(${u.weight}%)`).join(' + ')}
                    </p>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper functions for rollback stream handling
let rollbackMsgId = 1000;

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
    const cleaned = msgs.filter((m) => !(m.role === 'assistant' && !m.isStreaming && !m.content.trim()));
    return { messages: cleaned, isProcessing: false };
  });
}

async function refreshDashboard(sessionId: string) {
  try {
    const resp = await fetch(`/api/dashboard/timeline?sessionId=${encodeURIComponent(sessionId)}`);
    if (resp.ok) {
      const data = await resp.json();
      if (data.data) {
        useDashboardStore.getState().setTimeline(data.data);
      }
    }
  } catch { /* ignore */ }
  useDashboardStore.getState().fetchGatewayData();
}
