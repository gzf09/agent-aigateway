import React from 'react';
import type { ConfirmCard, SummaryCard as SummaryCardType, DiffCard as DiffCardType, NameInputCard as NameInputCardType } from '@aigateway/shared';

interface ConfirmCardViewProps {
  card: ConfirmCard;
  onConfirm: (confirmedName?: string) => void;
  onCancel: () => void;
  disabled?: boolean;
}

export function ConfirmCardView({ card, onConfirm, onCancel, disabled }: ConfirmCardViewProps) {
  switch (card.type) {
    case 'summary':
      return <SummaryCardComponent card={card} onConfirm={() => onConfirm()} onCancel={onCancel} disabled={disabled} />;
    case 'diff':
      return <DiffCardComponent card={card} onConfirm={() => onConfirm()} onCancel={onCancel} disabled={disabled} />;
    case 'name_input':
      return <NameInputCardComponent card={card} onConfirm={onConfirm} onCancel={onCancel} disabled={disabled} />;
    default:
      return null;
  }
}

function SummaryCardComponent({ card, onConfirm, onCancel, disabled }: { card: SummaryCardType; onConfirm: () => void; onCancel: () => void; disabled?: boolean }) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderLeft: '4px solid #22c55e', borderRadius: '8px', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
        <strong>{card.title}</strong>
        <span style={{ color: '#22c55e', fontSize: '12px' }}>低风险</span>
      </div>
      <div style={{ marginBottom: '12px' }}>
        {card.fields.map((f, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', padding: '4px 0' }}>
            <span style={{ color: '#6b7280' }}>{f.label}</span>
            <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{f.value}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button onClick={onCancel} disabled={disabled}>取消</button>
        <button onClick={onConfirm} disabled={disabled}>确认创建</button>
      </div>
    </div>
  );
}

function DiffCardComponent({ card, onConfirm, onCancel, disabled }: { card: DiffCardType; onConfirm: () => void; onCancel: () => void; disabled?: boolean }) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderLeft: `4px solid ${card.riskLevel === 'high' ? '#ef4444' : '#f59e0b'}`, borderRadius: '8px', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
        <strong>{card.title}</strong>
        <span style={{ color: card.riskLevel === 'high' ? '#ef4444' : '#f59e0b', fontSize: '12px' }}>
          {card.riskLevel === 'high' ? '高风险' : '中风险'}
        </span>
      </div>
      {card.warnings && card.warnings.map((w, i) => (
        <div key={i} style={{ backgroundColor: '#fffbeb', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', color: '#b45309', marginBottom: '8px' }}>
          ⚠️ {w}
        </div>
      ))}
      <div style={{ marginBottom: '12px' }}>
        {card.changes.map((c, i) => (
          <div key={i} style={{ fontSize: '13px', padding: '4px 0' }}>
            <span style={{ color: '#6b7280' }}>{c.field}: </span>
            {c.oldValue && <span style={{ color: '#ef4444', textDecoration: 'line-through' }}>{c.oldValue}</span>}
            {c.changeType === 'modified' && ' → '}
            {c.newValue && <span style={{ color: '#22c55e' }}>{c.newValue}</span>}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button onClick={onCancel} disabled={disabled}>取消</button>
        <button onClick={onConfirm} disabled={disabled}>确认修改</button>
      </div>
    </div>
  );
}

function NameInputCardComponent({ card, onConfirm, onCancel, disabled }: { card: NameInputCardType; onConfirm: (name: string) => void; onCancel: () => void; disabled?: boolean }) {
  const [input, setInput] = React.useState('');
  return (
    <div style={{ border: '1px solid #e5e7eb', borderLeft: '4px solid #ef4444', borderRadius: '8px', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
        <strong>{card.title}</strong>
        <span style={{ color: '#ef4444', fontSize: '12px' }}>高风险</span>
      </div>
      <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>{card.impactDescription}</p>
      {card.warnings.map((w, i) => (
        <div key={i} style={{ backgroundColor: '#fef2f2', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', color: '#b91c1c', marginBottom: '8px' }}>
          ⚠️ {w}
        </div>
      ))}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>
          请输入 <code>{card.resourceName}</code> 以确认删除
        </label>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={card.resourceName}
          style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '6px', padding: '8px', fontSize: '14px' }}
        />
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button onClick={onCancel} disabled={disabled}>取消</button>
        <button onClick={() => onConfirm(input)} disabled={input !== card.resourceName || disabled}>确认删除</button>
      </div>
    </div>
  );
}
