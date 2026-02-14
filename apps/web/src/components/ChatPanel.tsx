import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import { useChatStore } from '../stores/chatStore.js';
import { MessageBubble } from './MessageBubble.js';
import { ConfirmCardView } from './ConfirmCards.js';
import { ChatInput } from './ChatInput.js';

export function ChatPanel() {
  const { messages, pendingConfirmCard, isProcessing, agentHealthy } = useChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, pendingConfirmCard]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
          {messages.length === 0 && <EmptyState />}

          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {pendingConfirmCard && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="max-w-xl"
            >
              <ConfirmCardView card={pendingConfirmCard} />
            </motion.div>
          )}

          {isProcessing && messages.length > 0 && !messages[messages.length - 1]?.isStreaming && !pendingConfirmCard && (
            <TypingIndicator />
          )}
        </div>
      </div>

      {/* Input area */}
      <ChatInput />
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
        <Zap className="h-4 w-4" />
      </div>
      <div className="flex items-center gap-1.5 rounded-xl border border-chat-agent-border bg-chat-agent px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block h-1.5 w-1.5 rounded-full bg-primary"
            style={{
              animation: 'typing-dots 1.4s infinite',
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  const { sendMessage, agentHealthy } = useChatStore();

  const suggestions = [
    { icon: <Zap className="h-4 w-4 text-primary" />, text: '帮我添加一个 OpenAI 提供商', desc: '配置 LLM 服务商' },
    { icon: <Zap className="h-4 w-4 text-info" />, text: '查看当前所有 AI 提供商', desc: '列出已配置的提供商' },
    { icon: <Zap className="h-4 w-4 text-success" />, text: '创建一条 AI 路由，70% OpenAI 30% DeepSeek', desc: '配置智能流量分发' },
    { icon: <Zap className="h-4 w-4 text-warning" />, text: '帮我搭建一个 AI 网关', desc: '一键搭建完整网关' },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      {/* Logo */}
      <div className="relative mb-8">
        <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center animate-pulse-glow">
          <Zap className="h-10 w-10 text-primary" />
        </div>
        {agentHealthy && (
          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-success rounded-full flex items-center justify-center ring-4 ring-background">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
          </div>
        )}
      </div>

      <h2 className="text-2xl font-bold text-foreground mb-2">AI 网关管理助手</h2>
      <p className="text-muted-foreground text-sm mb-8 text-center max-w-md">
        通过自然语言对话，轻松管理 Higress AI 网关的提供商、路由和流量策略
      </p>

      {/* Suggestion cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
        {suggestions.map((s, i) => (
          <motion.button
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => agentHealthy && sendMessage(s.text)}
            disabled={!agentHealthy}
            className="group text-left p-4 bg-card border border-border rounded-xl hover:border-primary/30 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <span className="mb-2 block">{s.icon}</span>
            <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors leading-snug">{s.text}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{s.desc}</p>
          </motion.button>
        ))}
      </div>

      {!agentHealthy && (
        <p className="mt-6 text-xs text-warning bg-warning/10 px-4 py-2 rounded-lg border border-warning/20">
          正在连接 Agent 引擎...
        </p>
      )}
    </div>
  );
}
