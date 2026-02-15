import { useState, useRef, type KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { Send, Undo2, Search, Plus, GitBranch, Shield, ExternalLink } from 'lucide-react';
import { useChatStore } from '../stores/chatStore.js';

export function ChatInput() {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendMessage, sendRollback, isProcessing, agentHealthy, healthData } = useChatStore();

  const canSend = agentHealthy && !isProcessing;
  const higressConsoleUrl = healthData?.higressConsoleUrl || '';

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || !canSend) return;
    sendMessage(trimmed);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }
  };

  const quickHints = [
    { icon: Search, text: '查看网关状态' },
    { icon: Plus, text: '添加提供商' },
    { icon: GitBranch, text: '创建 AI 路由' },
    { icon: Shield, text: '配置限流' },
  ];

  return (
    <div className="border-t border-border bg-card/50 px-4 py-3">
      <div className="mx-auto max-w-3xl">
        {/* Input row */}
        <div className="flex items-end gap-2">
          <div className="relative flex-1 rounded-xl border border-border bg-input transition-colors focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/30">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              placeholder={canSend ? '输入你的指令，例如：帮我配置 OpenAI 的接入...' : isProcessing ? '处理中...' : '正在连接 Agent...'}
              disabled={!canSend}
              rows={1}
              className="w-full resize-none bg-transparent px-4 py-3 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-40"
              style={{ minHeight: 44, maxHeight: 120 }}
            />
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleSubmit}
              disabled={!input.trim() || !canSend}
              className="absolute bottom-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Send className="h-3.5 w-3.5" />
            </motion.button>
          </div>
        </div>

        {/* Quick hints + actions row */}
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {quickHints.map((hint) => (
            <button
              key={hint.text}
              onClick={() => canSend && sendMessage(hint.text)}
              disabled={!canSend}
              className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground transition-all hover:border-primary/30 hover:text-primary hover:bg-primary/5 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <hint.icon className="h-3 w-3" />
              {hint.text}
            </button>
          ))}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Rollback button */}
          <button
            onClick={() => sendRollback()}
            disabled={!canSend}
            className="flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground transition-all hover:border-warning/30 hover:text-warning hover:bg-warning/5 disabled:opacity-30 disabled:cursor-not-allowed"
            title="回滚上一步操作"
          >
            <Undo2 className="h-3 w-3" />
            回滚
          </button>

          {/* Higress console link */}
          {higressConsoleUrl && (
            <a
              href={higressConsoleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground transition-all hover:border-primary/30 hover:text-primary hover:bg-primary/5"
              title="打开 Higress 控制面板"
            >
              <ExternalLink className="h-3 w-3" />
              控制面板
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
