import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, AlertTriangle, Trash2 } from 'lucide-react';
import type { ConfirmCard, SummaryCard, DiffCard, NameInputCard } from '@aigateway/shared';
import { useChatStore } from '../stores/chatStore.js';

export function ConfirmCardView({ card }: { card: ConfirmCard }) {
  switch (card.type) {
    case 'summary': return <SummaryCardView card={card} />;
    case 'diff': return <DiffCardView card={card} />;
    case 'name_input': return <NameInputCardView card={card} />;
    default: return null;
  }
}

function SummaryCardView({ card }: { card: SummaryCard }) {
  const { sendConfirm, sendCancel, isProcessing } = useChatStore();

  return (
    <div className="overflow-hidden rounded-xl border border-primary/20 bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-primary/20 bg-primary/5 px-4 py-2.5">
        <Plus className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-primary">{card.title}</span>
        <span className="ml-auto rounded bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success border border-success/20">
          低风险
        </span>
      </div>
      {/* Fields */}
      <div className="space-y-2 p-4">
        {card.fields.map((f, i) => (
          <div key={i} className="flex items-start gap-3 text-sm">
            <span className="w-24 shrink-0 text-muted-foreground">{f.label}</span>
            <span className="font-mono text-xs text-foreground">{f.value}</span>
          </div>
        ))}
      </div>
      {/* Actions */}
      <div className="px-4 py-3 border-t border-border flex gap-2 justify-end">
        <button
          onClick={() => sendCancel()}
          disabled={isProcessing}
          className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
        >
          取消
        </button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => sendConfirm()}
          disabled={isProcessing}
          className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-30"
          style={{ boxShadow: 'var(--glow-primary)' }}
        >
          确认创建
        </motion.button>
      </div>
    </div>
  );
}

function DiffCardView({ card }: { card: DiffCard }) {
  const { sendConfirm, sendCancel, isProcessing } = useChatStore();
  const isHigh = card.riskLevel === 'high';

  return (
    <div className={`overflow-hidden rounded-xl border bg-card ${
      isHigh ? 'border-destructive/30' : 'border-warning/30'
    }`}>
      {/* Header */}
      <div className={`flex items-center gap-2 border-b px-4 py-2.5 ${
        isHigh
          ? 'border-destructive/20 bg-destructive/5'
          : 'border-warning/20 bg-warning/5'
      }`}>
        <AlertTriangle className={`h-4 w-4 ${isHigh ? 'text-destructive' : 'text-warning'}`} />
        <span className={`text-sm font-semibold ${isHigh ? 'text-destructive' : 'text-warning'}`}>
          {card.title}
        </span>
        <span className={`ml-auto rounded px-2 py-0.5 text-[10px] font-medium border ${
          isHigh
            ? 'bg-destructive/10 text-destructive border-destructive/20'
            : 'bg-warning/10 text-warning border-warning/20'
        }`}>
          {isHigh ? '高风险' : '中风险'}
        </span>
      </div>

      {/* Warnings */}
      {card.warnings && card.warnings.length > 0 && (
        <div className={`mx-4 mt-3 p-2.5 rounded-lg border text-xs ${
          isHigh
            ? 'bg-destructive/5 border-destructive/20 text-destructive'
            : 'bg-warning/5 border-warning/20 text-warning'
        }`}>
          {card.warnings.map((w, i) => <p key={i}>&#x26A0; {w}</p>)}
        </div>
      )}

      {/* Changes */}
      <div className="space-y-1.5 p-4">
        {card.changes.map((c, i) => (
          <div key={i} className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 font-mono text-xs">
            <span className="text-muted-foreground min-w-[140px] shrink-0 uppercase tracking-wide text-[11px]">{c.field}</span>
            {(c.changeType === 'removed' || c.changeType === 'modified') && (
              <span className="text-destructive line-through">{c.oldValue}</span>
            )}
            {c.changeType === 'modified' && (
              <span className="text-muted-foreground">&rarr;</span>
            )}
            {(c.changeType === 'added' || c.changeType === 'modified') && (
              <span className="text-success">{c.newValue}</span>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-border flex gap-2 justify-end">
        <button
          onClick={() => sendCancel()}
          disabled={isProcessing}
          className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
        >
          取消
        </button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => sendConfirm()}
          disabled={isProcessing}
          className={`rounded-lg px-4 py-2 text-xs font-medium transition-all disabled:opacity-30 ${
            isHigh
              ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
              : 'bg-warning text-warning-foreground hover:bg-warning/90'
          }`}
          style={{ boxShadow: isHigh ? 'var(--glow-destructive)' : 'var(--glow-warning)' }}
        >
          确认修改
        </motion.button>
      </div>
    </div>
  );
}

function NameInputCardView({ card }: { card: NameInputCard }) {
  const [inputName, setInputName] = useState('');
  const { sendConfirm, sendCancel, isProcessing } = useChatStore();
  const nameMatches = inputName === card.resourceName;

  return (
    <div className="overflow-hidden rounded-xl border border-destructive/30 bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-destructive/20 bg-destructive/5 px-4 py-2.5">
        <Trash2 className="h-4 w-4 text-destructive" />
        <span className="text-sm font-semibold text-destructive">&#x26A0; {card.title}</span>
        <span className="ml-auto rounded bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive border border-destructive/20">
          高风险
        </span>
      </div>

      <div className="p-4 space-y-3">
        <p className="text-sm text-foreground">{card.impactDescription}</p>

        {card.warnings.length > 0 && (
          <div className="p-2.5 bg-destructive/5 border border-destructive/20 rounded-lg text-xs text-destructive">
            {card.warnings.map((w, i) => <p key={i}>&#x26A0; {w}</p>)}
          </div>
        )}

        <div>
          <label className="block text-xs text-muted-foreground mb-1.5 font-medium">
            请输入 <code className="bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-mono">{card.resourceName}</code> 确认删除
          </label>
          <input
            type="text"
            value={inputName}
            onChange={(e) => setInputName(e.target.value)}
            placeholder={card.resourceName}
            className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm font-mono bg-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-destructive/50 focus:border-destructive/50 transition-colors"
          />
          {inputName && !nameMatches && (
            <p className="text-[11px] text-destructive mt-1">名称不匹配</p>
          )}
        </div>
      </div>

      <div className="px-4 py-3 border-t border-border flex gap-2 justify-end">
        <button
          onClick={() => sendCancel()}
          disabled={isProcessing}
          className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
        >
          取消
        </button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => sendConfirm(inputName)}
          disabled={!nameMatches || isProcessing}
          className="rounded-lg bg-destructive px-4 py-2 text-xs font-medium text-destructive-foreground transition-all hover:bg-destructive/90 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ boxShadow: 'var(--glow-destructive)' }}
        >
          确认删除
        </motion.button>
      </div>
    </div>
  );
}
