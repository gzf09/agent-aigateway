import { useState, useEffect } from 'react';
import { X, RefreshCw } from 'lucide-react';

interface MCPTool {
  name: string;
  description: string;
}

interface MCPStatusData {
  connected: boolean;
  state: string;
  serverUrl: string;
  toolCount: number;
  tools: MCPTool[];
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function MCPConfigDialog({ open, onClose }: Props) {
  const [status, setStatus] = useState<MCPStatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchStatus = () => {
    setLoading(true);
    setError('');
    fetch('/api/session/mcp-status')
      .then((r) => r.json())
      .then((d: MCPStatusData) => {
        setStatus(d);
      })
      .catch((e: Error) => {
        setError(e.message);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!open) return;
    fetchStatus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-foreground">MCP Server 配置</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Connection Status */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
            <div className="flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${
                status?.connected ? 'bg-success' : 'bg-destructive'
              }`} />
              <span className="text-sm text-foreground">
                {status?.connected ? '已连接' : '未连接'}
              </span>
              <span className="text-xs text-muted-foreground">
                ({status?.state || 'unknown'})
              </span>
            </div>
            <button
              onClick={fetchStatus}
              disabled={loading}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>

          {/* Server URL */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">MCP Server URL</label>
            <div className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground font-mono">
              {status?.serverUrl || '-'}
            </div>
          </div>

          {/* Tool List */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">
              可用工具 ({status?.toolCount ?? 0})
            </label>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-background">
              {status?.tools && status.tools.length > 0 ? (
                <div className="divide-y divide-border">
                  {status.tools.map((tool) => (
                    <div key={tool.name} className="px-3 py-2">
                      <div className="text-sm font-mono text-foreground">{tool.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{tool.description}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                  {loading ? '加载中...' : '暂无可用工具'}
                </div>
              )}
            </div>
          </div>

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}

          <div className="flex justify-end pt-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
