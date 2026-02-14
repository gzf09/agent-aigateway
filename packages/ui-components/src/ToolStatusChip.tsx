import React from 'react';

interface ToolStatusChipProps {
  toolName: string;
  status: 'calling' | 'done' | 'error';
}

export function ToolStatusChip({ toolName, status }: ToolStatusChipProps) {
  const icon = status === 'calling' ? '⏳' : status === 'done' ? '✅' : '❌';
  const label = status === 'calling' ? '调用中' : status === 'done' ? '完成' : '失败';
  const bg = status === 'calling' ? '#f3f4f6' : status === 'done' ? '#dcfce7' : '#fee2e2';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 10px',
        borderRadius: '12px',
        fontSize: '12px',
        backgroundColor: bg,
      }}
    >
      {icon} {toolName} {label}
    </span>
  );
}
