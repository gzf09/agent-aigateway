import { useState, useRef, type KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { Send, Undo2 } from 'lucide-react';
import { useChatStore } from '../stores/chatStore.js';

export function ChatInput() {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendMessage, sendRollback, isProcessing, agentHealthy } = useChatStore();

  const canSend = agentHealthy && !isProcessing;

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

  const quickHints = ['查看网关状态', '添加提供商', '创建 AI 路由', '配置限流'];

  return (
    <div className="border-t border-border bg-card/50 p-4">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={canSend ? '输入你的指令，例如：帮我配置 OpenAI 的接入...' : isProcessing ? '处理中...' : '正在连接 Agent...'}
            disabled={!canSend}
            rows={1}
            className="w-full resize-none rounded-xl border border-border bg-input px-4 py-3 pr-24 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-40"
            style={{ minHeight: 48, maxHeight: 120 }}
          />
          <div className="absolute bottom-2 right-2 flex items-center gap-1">
            <button
              onClick={() => sendRollback()}
              disabled={!canSend}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-warning disabled:opacity-30"
              title="回滚上一步操作"
            >
              <Undo2 className="h-4 w-4" />
            </button>
          </div>
        </div>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleSubmit}
          disabled={!input.trim() || !canSend}
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Send className="h-4 w-4" />
        </motion.button>
      </div>
      <div className="mx-auto mt-2 flex max-w-3xl gap-2">
        {quickHints.map((hint) => (
          <button
            key={hint}
            onClick={() => canSend && sendMessage(hint)}
            disabled={!canSend}
            className="rounded-lg border border-border bg-muted/50 px-3 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-30"
          >
            {hint}
          </button>
        ))}
      </div>
    </div>
  );
}
