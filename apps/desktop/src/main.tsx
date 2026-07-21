import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from '@/App';
import { CopyCapture } from '@/components/CopyCapture';
import { ManualCapture } from '@/components/ManualCapture';
import { isTauri } from '@/lib/api';
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
    label === 'copy-capture' ? <CopyCapture /> : label === 'manual-capture' ? <ManualCapture /> : null;
  if (captureView) document.documentElement.classList.add('capture-window');

  ReactDOM.createRoot(root).render(
    <React.StrictMode>{captureView ?? <App />}</React.StrictMode>,
  );
}

void main();
