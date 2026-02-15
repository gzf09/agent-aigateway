import { create } from 'zustand';

type Theme = 'dark' | 'light';

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const getInitialTheme = (): Theme => {
  try {
    const stored = localStorage.getItem('aigateway_theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch { /* ignore */ }
  return 'dark';
};

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getInitialTheme(),

  toggleTheme: () =>
    set((s) => {
      const next = s.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('aigateway_theme', next); } catch { /* ignore */ }
      applyTheme(next);
      return { theme: next };
    }),

  setTheme: (t) => {
    try { localStorage.setItem('aigateway_theme', t); } catch { /* ignore */ }
    applyTheme(t);
    set({ theme: t });
  },
}));

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
  }
}

// Apply on load
applyTheme(getInitialTheme());
