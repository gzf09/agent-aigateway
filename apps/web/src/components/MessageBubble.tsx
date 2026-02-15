import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, User, ChevronDown, ChevronRight, Wrench, Check, X, Loader2 } from 'lucide-react';
import type { ChatMessageUI, ToolCallStatus } from '../stores/chatStore.js';
import { MarkdownContent } from './MarkdownContent.js';

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
          className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? 'bg-chat-user text-foreground whitespace-pre-wrap'
              : 'bg-chat-agent border border-chat-agent-border text-foreground'
          }`}
        >
          {isUser ? (
            <>
              {message.content || (message.isStreaming ? <span className="typing-cursor" /> : null)}
              {message.isStreaming && message.content ? <span className="typing-cursor" /> : null}
            </>
          ) : (
            <>
              {/* Tool calls section */}
              {message.toolCalls && message.toolCalls.length > 0 && (
                <ToolCallsSection toolCalls={message.toolCalls} hasContent={!!message.content} />
              )}
              {/* Text content */}
              {message.content ? (
                <MarkdownContent content={message.content} />
              ) : (
                message.isStreaming && !message.toolCalls?.length ? <span className="typing-cursor" /> : null
              )}
              {message.isStreaming && message.content ? <span className="typing-cursor" /> : null}
            </>
          )}
        </div>
        <span className="block text-[10px] text-muted-foreground px-1">
          {new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </motion.div>
  );
}

function ToolCallsSection({ toolCalls, hasContent }: { toolCalls: ToolCallStatus[]; hasContent: boolean }) {
  const allDone = toolCalls.every((t) => t.status !== 'calling');
  const hasError = toolCalls.some((t) => t.status === 'error');
  // Auto-collapse when all done and there's text content below
  const [expanded, setExpanded] = useState(!allDone || !hasContent);

  // If all tools are done and we have content, allow collapse
  const collapsible = allDone && hasContent;

  const callingCount = toolCalls.filter((t) => t.status === 'calling').length;
  const doneCount = toolCalls.filter((t) => t.status === 'done').length;
  const errorCount = toolCalls.filter((t) => t.status === 'error').length;

  return (
    <div className={`${hasContent ? 'mb-2.5 pb-2.5 border-b border-border/50' : ''}`}>
      {/* Header - clickable when collapsible */}
      <button
        onClick={() => collapsible && setExpanded(!expanded)}
        disabled={!collapsible}
        className={`flex items-center gap-1.5 text-[11px] w-full text-left ${
          collapsible ? 'cursor-pointer hover:text-foreground' : 'cursor-default'
        } ${hasError ? 'text-destructive' : 'text-muted-foreground'}`}
      >
        {collapsible && (
          expanded
            ? <ChevronDown className="h-3 w-3 shrink-0" />
            : <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <Wrench className="h-3 w-3 shrink-0" />
        {allDone ? (
          <span>
            已调用 {toolCalls.length} 个工具
            {hasError && <span className="text-destructive ml-1">({errorCount} 失败)</span>}
          </span>
        ) : (
          <span className="flex items-center gap-1">
            正在调用工具
            <span className="text-muted-foreground/60">({doneCount + callingCount}/{toolCalls.length})</span>
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
          </span>
        )}
      </button>

      {/* Expanded tool list */}
      {(expanded || !collapsible) && (
        <div className="mt-1.5 space-y-0.5 pl-1">
          {toolCalls.map((tool, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px]">
              {tool.status === 'calling' && (
                <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
              )}
              {tool.status === 'done' && (
                <Check className="h-3 w-3 text-success shrink-0" />
              )}
              {tool.status === 'error' && (
                <X className="h-3 w-3 text-destructive shrink-0" />
              )}
              <span className={`font-mono ${
                tool.status === 'calling' ? 'text-primary' :
                tool.status === 'error' ? 'text-destructive' :
                'text-muted-foreground'
              }`}>
                {tool.toolName}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SystemMessage({ message }: { message: ChatMessageUI }) {
  // Legacy tool status rendering (kept for backwards compatibility)
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
