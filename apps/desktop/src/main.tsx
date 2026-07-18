import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from '@/App';
import { QuickCapture } from '@/components/QuickCapture';
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
  const isCapture = label === 'capture';
  if (isCapture) document.documentElement.classList.add('capture-window');

  ReactDOM.createRoot(root).render(
    <React.StrictMode>{isCapture ? <QuickCapture /> : <App />}</React.StrictMode>,
  );
}

void main();
