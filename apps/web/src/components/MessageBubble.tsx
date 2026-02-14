import { motion } from 'framer-motion';
import { Bot, User } from 'lucide-react';
import type { ChatMessageUI } from '../stores/chatStore.js';

export function MessageBubble({ message }: { message: ChatMessageUI }) {
  if (message.role === 'system') {
    return <SystemMessage message={message} />;
  }

  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      {/* Avatar */}
      <div
        className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          isUser
            ? 'bg-secondary text-secondary-foreground'
            : 'bg-primary/10 text-primary border border-primary/20'
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* Content */}
      <div className={`max-w-[85%] space-y-1 ${isUser ? 'items-end' : ''}`}>
        <div
          className={`rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? 'bg-chat-user text-foreground'
              : 'bg-chat-agent border border-chat-agent-border text-foreground'
          }`}
        >
          {message.content || (message.isStreaming ? <span className="typing-cursor" /> : null)}
          {message.isStreaming && message.content ? <span className="typing-cursor" /> : null}
        </div>
        <span className="block text-[10px] text-muted-foreground px-1">
          {new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </motion.div>
  );
}

function SystemMessage({ message }: { message: ChatMessageUI }) {
  if (message.toolStatus) {
    const { toolName, status } = message.toolStatus;
    const configs = {
      calling: { icon: '⟳', color: 'text-primary', border: 'border-primary/20', bg: 'bg-primary/5', label: '调用中' },
      done: { icon: '✓', color: 'text-success', border: 'border-success/20', bg: 'bg-success/5', label: '完成' },
      error: { icon: '✕', color: 'text-destructive', border: 'border-destructive/20', bg: 'bg-destructive/5', label: '失败' },
    };
    const c = configs[status];
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex justify-center"
      >
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${c.bg} ${c.color} px-3 py-1 rounded-full border ${c.border}`}>
          <span className={status === 'calling' ? 'animate-spin' : ''}>{c.icon}</span>
          <span className="font-mono">{toolName}</span>
          {c.label}
        </span>
      </motion.div>
    );
  }

  if (message.operationResult) {
    const { success, message: msg, rollbackVersionId } = message.operationResult;
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex justify-center"
      >
        <div className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium ${
          success
            ? 'bg-success/10 text-success border border-success/20'
            : 'bg-destructive/10 text-destructive border border-destructive/20'
        }`}>
          {success ? '✓' : '✕'} {msg}
          {rollbackVersionId != null && (
            <span className="text-muted-foreground font-normal">(v{rollbackVersionId})</span>
          )}
        </div>
      </motion.div>
    );
  }

  if (message.content) {
    return (
      <div className="flex justify-center">
        <span className="text-[11px] text-muted-foreground bg-muted px-3 py-1 rounded-full">{message.content}</span>
      </div>
    );
  }

  return null;
}
