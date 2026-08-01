import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from '@/App';
import { CopyCapture } from '@/components/CopyCapture';
import { ManualCapture } from '@/components/ManualCapture';
import { isTauri } from '@/lib/api';
import { ShortcutProvider } from '@/lib/shortcuts/ShortcutProvider';
import '@/styles.css';

// The same bundle serves every window; render by window label.
async function main() {
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root element');

  let label = 'main';
  if (isTauri) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    label = getCurrentWindow().label;
  }

  // Every capture panel is a frameless, transparent window — they share the styling
  // that strips the window background and the aurora.
  const captureView =
    label === 'copy-capture' ? (
      <CopyCapture />
    ) : label === 'manual-capture' ? (
      <ManualCapture />
    ) : null;
  if (captureView) document.documentElement.classList.add('capture-window');

  // One provider per window; a shortcut works exactly while a mounted component keeps
  // it enabled, so the windows/screens separate themselves by what they mount.
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ShortcutProvider>{captureView ?? <App />}</ShortcutProvider>
    </React.StrictMode>,
  );
}

void main();
