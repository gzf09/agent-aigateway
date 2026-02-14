import { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, PanelRightClose, Clock, Server, GitBranch,
  CheckCircle2, XCircle, Plus, RefreshCw, Trash2, Undo2, Shield
} from 'lucide-react';
import { useDashboardStore } from '../stores/dashboardStore.js';
import { useChatStore } from '../stores/chatStore.js';
import type { ChangeLogEntry } from '@aigateway/shared';

interface DashboardProps {
  onClose: () => void;
}

export function Dashboard({ onClose }: DashboardProps) {
  const { activeTab, setActiveTab, timeline, setTimeline } = useDashboardStore();
  const { sessionId, agentHealthy } = useChatStore();

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
          { key: 'timeline' as const, label: '操作历史', icon: Clock },
          { key: 'topology' as const, label: '概览', icon: GitBranch },
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
            {tab.key === 'timeline' && timeline.length > 0 && (
              <span className={`ml-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold ${
                activeTab === tab.key ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
              }`}>
                {timeline.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'timeline' && <TimelineView timeline={timeline} />}
        {activeTab === 'topology' && <OverviewView timeline={timeline} />}
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

function TimelineView({ timeline }: { timeline: ChangeLogEntry[] }) {
  if (timeline.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-12 h-12 bg-muted rounded-2xl flex items-center justify-center mb-3">
          <Clock className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">暂无操作记录</p>
        <p className="text-[11px] text-muted-foreground mt-1">执行配置变更后将在这里显示</p>
      </div>
    );
  }

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
  const dotColors = {
    create: 'bg-success',
    update: 'bg-info',
    delete: 'bg-destructive',
  };

  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        <Clock className="h-3.5 w-3.5" />
        最近操作
      </h3>
      {timeline.map((entry, i) => {
        const op = entry.operationType as keyof typeof typeIcons;
        const Icon = typeIcons[op] || Plus;
        const isRolledBack = entry.rollbackStatus === 'rolled_back';
        return (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] transition-colors hover:bg-muted/50 ${
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
            <div className="flex flex-col items-end shrink-0">
              <span className="text-[10px] font-mono text-muted-foreground">v{entry.versionId}</span>
              <span className="text-[10px] text-muted-foreground">
                {new Date(entry.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function OverviewView({ timeline }: { timeline: ChangeLogEntry[] }) {
  const activeOps = timeline.filter((t) => t.rollbackStatus === 'active');
  const providers = new Set(activeOps.filter((t) => t.resourceType === 'ai-provider' && t.operationType === 'create').map((t) => t.resourceName));
  const routes = new Set(activeOps.filter((t) => t.resourceType === 'ai-route' && t.operationType === 'create').map((t) => t.resourceName));
  const rollbacks = timeline.filter((t) => t.rollbackStatus === 'rolled_back').length;

  const stats = [
    { label: '活跃提供商', value: providers.size, icon: Server, color: 'text-primary' },
    { label: '活跃路由', value: routes.size, icon: GitBranch, color: 'text-success' },
    { label: '总操作数', value: timeline.length, icon: Activity, color: 'text-info' },
    { label: '已回滚', value: rollbacks, icon: Undo2, color: 'text-warning' },
  ];

  if (timeline.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-12 h-12 bg-muted rounded-2xl flex items-center justify-center mb-3">
          <GitBranch className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">网关概览</p>
        <p className="text-[11px] text-muted-foreground mt-1">添加提供商和路由后将显示概览数据</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats grid */}
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

      {/* Active providers */}
      {providers.size > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Server className="h-3.5 w-3.5" />
            活跃提供商
            <span className="ml-auto rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
              {providers.size}
            </span>
          </h3>
          <div className="space-y-1.5">
            {[...providers].map((p, i) => (
              <motion.div
                key={p}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                <span className="text-xs font-medium text-foreground">{p}</span>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Active routes */}
      {routes.size > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <GitBranch className="h-3.5 w-3.5" />
            活跃路由
            <span className="ml-auto rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
              {routes.size}
            </span>
          </h3>
          <div className="space-y-1.5">
            {[...routes].map((r, i) => (
              <motion.div
                key={r}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                <span className="text-xs font-medium text-foreground">{r}</span>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
