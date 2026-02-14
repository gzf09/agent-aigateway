import { create } from 'zustand';
import type { ChangeLogEntry } from '@aigateway/shared';

interface DashboardState {
  timeline: ChangeLogEntry[];
  activeTab: 'timeline' | 'topology';

  setTimeline: (t: ChangeLogEntry[]) => void;
  setActiveTab: (tab: DashboardState['activeTab']) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  timeline: [],
  activeTab: 'timeline',

  setTimeline: (timeline) => set({ timeline }),
  setActiveTab: (activeTab) => set({ activeTab }),
}));
