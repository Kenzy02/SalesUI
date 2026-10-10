import { createContext, useContext } from 'react';

/**
 * Demo mode: Customers, the customer overview and My commission show the
 * frontend sample dataset (src/lib/demo.ts) instead of Salesforce figures.
 * Nothing is written to Salesforce. Remembered per browser for convenience.
 */
export interface DemoMode {
  demo: boolean;
  setDemo: (on: boolean) => void;
}

export const DemoContext = createContext<DemoMode>({
  demo: false,
  setDemo: () => undefined,
});

export function useDemoMode(): DemoMode {
  return useContext(DemoContext);
}

const KEY = 'amwaj.salesui.demoMode';

export function readDemoPreference(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('demo');
    if (q === '1' || q === '0') return q === '1';
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function writeDemoPreference(on: boolean) {
  try {
    window.localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // Storage unavailable (private window, blocked): demo mode lasts for this page only.
  }
}
