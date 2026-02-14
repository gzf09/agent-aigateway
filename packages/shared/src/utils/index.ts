export function maskApiKey(key: string): string {
  if (!key || key.length <= 8) return '••••••••';
  return key.slice(0, 3) + '•••' + key.slice(-3);
}

export function maskForLog(_key: string): string {
  return '[REDACTED]';
}

export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
