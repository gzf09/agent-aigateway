import { create } from 'zustand';
import type { DebugLogEntry } from '@aigateway/shared';

export interface DebugRequestGroup {
  requestId: string;
  requestMessage: string;
  timestamp: number;
  logs: DebugLogEntry[];
}

interface DebugState {
  logs: DebugLogEntry[];
  addLog: (log: DebugLogEntry) => void;
  clearLogs: () => void;
  getGroupedLogs: () => DebugRequestGroup[];
}

export const useDebugStore = create<DebugState>((set, get) => ({
  logs: [],

  addLog: (log) =>
    set((s) => ({ logs: [...s.logs, log] })),

  clearLogs: () => set({ logs: [] }),

  getGroupedLogs: () => {
    const { logs } = get();
    const groupMap = new Map<string, DebugRequestGroup>();
    const order: string[] = [];

    for (const log of logs) {
      const rid = log.requestId || 'unknown';
      if (!groupMap.has(rid)) {
        groupMap.set(rid, {
          requestId: rid,
          requestMessage: log.requestMessage || '(未知请求)',
          timestamp: log.timestamp,
          logs: [],
        });
        order.push(rid);
      }
      groupMap.get(rid)!.logs.push(log);
    }

    return order.map((rid) => groupMap.get(rid)!);
  },
}));
