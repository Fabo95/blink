/** Browser mock: the AI key, the capture hotkeys, and sync. */

import type { CaptureMethod } from '@/lib/api';
import type { MockHandlers } from './types';

const mockShortcuts: Record<CaptureMethod, string> = {
  copy: 'CommandOrControl+Shift+B',
  manual: 'CommandOrControl+Shift+M',
  idea: 'CommandOrControl+Shift+I',
};

// Browser-only AI key — no real provider call; any non-empty key "connects".
let mockAiKey: string | null = null;
function mockCaptureMethod(value: unknown): CaptureMethod {
  return value === 'manual' || value === 'idea' ? value : 'copy';
}

// Mirror the native `mask_key`: first three + last four, else a bare prefix.
function maskKey(key: string): string {
  const k = key.trim();
  return k.length <= 8 ? 'sk-…' : `${k.slice(0, 3)}…${k.slice(-4)}`;
}

export const settingsHandlers: MockHandlers = {
  ai_status: async () => {
    return mockAiKey ? maskKey(mockAiKey) : null;
  },
  set_ai_api_key: async (args) => {
    const key = String(args?.key ?? '').trim();
    if (!key) throw new Error('API key is empty');
    // No real provider in the browser — accept any non-empty key as "connected".
    mockAiKey = key;
    return undefined;
  },
  clear_ai_api_key: async () => {
    mockAiKey = null;
    return undefined;
  },
  get_capture_shortcut: async (args) => {
    return mockShortcuts[mockCaptureMethod(args?.method)];
  },
  set_capture_shortcut: async (args) => {
    const method = mockCaptureMethod(args?.method);
    mockShortcuts[method] = String(args?.shortcut ?? '');
    return undefined;
  },
  sync_now: async () => {
    return undefined;
  },
};
