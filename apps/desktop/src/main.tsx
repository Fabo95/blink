import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from '@/App';
import { CopyCapture } from '@/components/CopyCapture';
import { isTauri } from '@/lib/api';
import '@/styles.css';

// The same bundle serves both windows; render by window label.
async function main() {
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root element');

  let label = 'main';
  if (isTauri) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    label = getCurrentWindow().label;
  }
  const isCopyCapture = label === 'copy-capture';
  if (isCopyCapture) document.documentElement.classList.add('copy-capture-window');

  ReactDOM.createRoot(root).render(
    <React.StrictMode>{isCopyCapture ? <CopyCapture /> : <App />}</React.StrictMode>,
  );
}

void main();
