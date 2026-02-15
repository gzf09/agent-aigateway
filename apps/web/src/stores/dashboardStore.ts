import { create } from 'zustand';
import type { ChangeLogEntry, AIProvider, AIRoute } from '@aigateway/shared';

interface DashboardState {
  timeline: ChangeLogEntry[];
  activeTab: 'overview' | 'debug';
  providers: AIProvider[];
  routes: AIRoute[];

  setTimeline: (t: ChangeLogEntry[]) => void;
  setActiveTab: (tab: DashboardState['activeTab']) => void;
  setProviders: (p: AIProvider[]) => void;
  setRoutes: (r: AIRoute[]) => void;
  fetchGatewayData: () => Promise<void>;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  timeline: [],
  activeTab: 'overview',
  providers: [],
  routes: [],

  setTimeline: (timeline) => set({ timeline }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setProviders: (providers) => set({ providers }),
  setRoutes: (routes) => set({ routes }),

  fetchGatewayData: async () => {
    try {
      const [provResp, routeResp] = await Promise.all([
        fetch('/api/dashboard/providers'),
        fetch('/api/dashboard/routes'),
      ]);
      if (provResp.ok) {
        const provData = await provResp.json();
        const list = provData?.data || [];
        set({ providers: Array.isArray(list) ? list : [] });
      }
      if (routeResp.ok) {
        const routeData = await routeResp.json();
        const list = routeData?.data || [];
        set({ routes: Array.isArray(list) ? list : [] });
      }
    } catch { /* ignore */ }
  },
}));
