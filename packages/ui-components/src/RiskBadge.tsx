import React from 'react';

type RiskLevel = 'low' | 'medium' | 'high';

const styles: Record<RiskLevel, { bg: string; text: string; label: string }> = {
  low: { bg: '#dcfce7', text: '#166534', label: '低风险' },
  medium: { bg: '#fef3c7', text: '#92400e', label: '中风险' },
  high: { bg: '#fee2e2', text: '#991b1b', label: '高风险' },
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  const s = styles[level] || styles.low;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: 500,
        backgroundColor: s.bg,
        color: s.text,
      }}
    >
      {s.label}
    </span>
  );
}
