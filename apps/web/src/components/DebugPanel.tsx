import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bug, ChevronDown, ChevronRight, Brain, Server, Crosshair, Trash2, Clock, MessageSquare } from 'lucide-react';
import { useDebugStore } from '../stores/debugStore.js';
import type { DebugLogEntry } from '@aigateway/shared';

export function DebugPanel() {
  const { logs, clearLogs, getGroupedLogs } = useDebugStore();
  const groups = useMemo(() => getGroupedLogs(), [logs]);

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-12 h-12 bg-muted rounded-2xl flex items-center justify-center mb-3">
          <Bug className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">暂无调试日志</p>
        <p className="text-[11px] text-muted-foreground mt-1">发送消息后将记录 LLM 和 MCP 调用</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Bug className="h-3.5 w-3.5" />
          调试日志
          <span className="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{logs.length}</span>
        </h3>
        <button
          onClick={clearLogs}
          className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
          title="清除日志"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      {groups.map((group, gi) => (
        <RequestGroup key={group.requestId} group={group} index={gi} />
      ))}
    </div>
  );
}

function RequestGroup({ group, index }: { group: { requestId: string; requestMessage: string; timestamp: number; logs: DebugLogEntry[] }; index: number }) {
  const [expanded, setExpanded] = useState(true);
  const totalDuration = group.logs.reduce((sum, l) => sum + (l.duration || 0), 0);
  const timeStr = new Date(group.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-xl border border-border bg-card/50 overflow-hidden"
    >
      {/* Group header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors border-b border-border/50"
      >
        {expanded
          ? <ChevronDown className="h-3.5 w-3.5 text-primary shrink-0" />
          : <ChevronRight className="h-3.5 w-3.5 text-primary shrink-0" />
        }
        <MessageSquare className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-[12px] font-medium text-foreground truncate flex-1">
          {group.requestMessage}
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground font-mono">
            {group.logs.length} 条
          </span>
          {totalDuration > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground font-mono">
              <Clock className="h-2.5 w-2.5" />
              {totalDuration}ms
            </span>
          )}
          <span className="text-[10px] text-muted-foreground font-mono">{timeStr}</span>
        </span>
      </button>

      {/* Group logs */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-2 space-y-1.5">
              {group.logs.map((log, i) => (
                <DebugLogItem key={log.id} log={log} index={i} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const categoryConfig = {
  llm: { icon: Brain, color: 'text-purple-400', bg: 'bg-purple-400/10 border-purple-400/20', label: 'LLM' },
  mcp: { icon: Server, color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/20', label: 'MCP' },
  intent: { icon: Crosshair, color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/20', label: 'Intent' },
};

function DebugLogItem({ log, index }: { log: DebugLogEntry; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const config = categoryConfig[log.category] || categoryConfig.intent;
  const Icon = config.icon;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted/40 transition-colors"
      >
        {expanded
          ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        }
        <Icon className={`h-3 w-3 shrink-0 ${config.color}`} />
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border ${config.bg} ${config.color}`}>
          {config.label}
        </span>
        <span className="text-[11px] text-foreground truncate flex-1">{log.action}</span>
        {log.duration !== undefined && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground shrink-0 font-mono">
            <Clock className="h-2.5 w-2.5" />
            {log.duration}ms
          </span>
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-2.5 pb-2.5 space-y-2">
              {log.request !== undefined && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Request</p>
                  <pre className="text-[10px] text-foreground/80 bg-background/50 rounded-md p-2 overflow-x-auto max-h-48 overflow-y-auto font-mono leading-relaxed whitespace-pre-wrap break-all">
                    {formatJSON(log.request)}
                  </pre>
                </div>
              )}
              {log.response !== undefined && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Response</p>
                  <pre className="text-[10px] text-foreground/80 bg-background/50 rounded-md p-2 overflow-x-auto max-h-48 overflow-y-auto font-mono leading-relaxed whitespace-pre-wrap break-all">
                    {formatJSON(log.response)}
                  </pre>
                </div>
              )}
              <p className="text-[9px] text-muted-foreground font-mono">
                {new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 } as Intl.DateTimeFormatOptions)}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatJSON(data: unknown): string {
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}
