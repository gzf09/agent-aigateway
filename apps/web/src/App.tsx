import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Zap, Terminal, PanelRight, MessageSquarePlus, Settings, Sun, Moon } from 'lucide-react';
import { useChatStore } from './stores/chatStore.js';
import { useThemeStore } from './stores/themeStore.js';
import { ChatPanel } from './components/ChatPanel.js';
import { Dashboard } from './components/Dashboard.js';
import { LLMConfigDialog } from './components/LLMConfigDialog.js';

function App() {
  const { sessionId, setSessionId, agentHealthy, setAgentHealthy, setHealthData, healthData, clearChat } = useChatStore();
  const { theme, toggleTheme } = useThemeStore();
  const [showDashboard, setShowDashboard] = useState(true);
  const [showLLMConfig, setShowLLMConfig] = useState(false);

  // Init session
  useEffect(() => {
    const stored = sessionStorage.getItem('aigateway_sid');
    if (stored) {
      setSessionId(stored);
    } else {
      fetch('/api/session/create', { method: 'POST' })
        .then((r) => r.json())
        .then((d: { sessionId: string }) => {
          sessionStorage.setItem('aigateway_sid', d.sessionId);
          setSessionId(d.sessionId);
        })
        .catch(() => {
          const id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          sessionStorage.setItem('aigateway_sid', id);
          setSessionId(id);
        });
    }
  }, []);

  // Health check with adaptive frequency
  useEffect(() => {
    let iv: ReturnType<typeof setInterval>;
    const check = () =>
      fetch('/api/session/health')
        .then((r) => r.ok ? r.json() : null)
        .then((d) => {
          const healthy = !!d;
          const wasHealthy = useChatStore.getState().agentHealthy;
          setAgentHealthy(healthy);
          if (d) setHealthData(d);
          // Adjust check frequency: 3s when unhealthy, 15s when healthy
          if (healthy !== wasHealthy) {
            clearInterval(iv);
            iv = setInterval(check, healthy ? 15000 : 3000);
          }
        })
        .catch(() => {
          const wasHealthy = useChatStore.getState().agentHealthy;
          setAgentHealthy(false);
          if (wasHealthy) {
            clearInterval(iv);
            iv = setInterval(check, 3000);
          }
        });
    check();
    iv = setInterval(check, 15000);
    return () => clearInterval(iv);
  }, []);

  const isMock = healthData?.mock ?? true;
  const llmModel = healthData?.llm?.model || '';

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border bg-card/50 px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary animate-pulse-glow">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground tracking-wide">AIGateway Agent</h1>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Terminal className="h-3 w-3" />
                AI 驱动的网关管理助手
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`mr-3 flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] ${
              agentHealthy
                ? 'border-success/30 bg-success/5 text-success'
                : 'border-warning/30 bg-warning/5 text-warning'
            }`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                agentHealthy ? 'bg-success status-dot-pulse' : 'bg-warning'
              }`} />
              {agentHealthy ? '已连接' : '连接中...'}
            </div>
            <span className={`text-[11px] px-2 py-0.5 rounded-md font-mono ${
              isMock
                ? 'text-muted-foreground bg-muted'
                : 'text-success bg-success/10'
            }`}>
              {isMock ? 'Mock' : 'LIVE'}
            </span>
            <button
              onClick={toggleTheme}
              className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:text-foreground"
              title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setShowLLMConfig(true)}
              className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              title="LLM 模型配置"
            >
              <Settings className="h-3 w-3" />
              {llmModel && <span className="font-mono max-w-[80px] truncate">{llmModel}</span>}
            </button>
            <button
              onClick={() => clearChat()}
              className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:text-foreground"
              title="新对话"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </button>
            {!showDashboard && (
              <button
                onClick={() => setShowDashboard(true)}
                className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:text-foreground"
              >
                <PanelRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </header>

        {/* Chat content */}
        <ChatPanel />
      </div>

      {/* Companion Dashboard */}
      <AnimatePresence>
        {showDashboard && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden hidden lg:block"
          >
            <Dashboard onClose={() => setShowDashboard(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* LLM Config Dialog */}
      <LLMConfigDialog open={showLLMConfig} onClose={() => setShowLLMConfig(false)} />
    </div>
  );
}

export default App;
