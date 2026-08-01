import { type CaptureKind, CapturePanel } from '@/components/CapturePanel';
import { api } from '@/lib/api';

/**
 * Manual capture: no clipboard, no source — the panel opens blank to type a task into.
 * It's stored with a synthetic "manual" source so the `Task` shape stays uniform.
 */
const manualKind: CaptureKind = {
  title: 'Manual capture',
  placeholder: 'Type a task…',
  openEvent: 'manual-capture-open',
  showSource: false,
  load: async () => ({
    text: '',
    source: {
      appId: 'manual',
      appName: 'Manual',
      windowTitle: '',
      capturedAt: new Date().toISOString(),
    },
    redactionCount: 0,
  }),
  dismiss: () => api.dismissManualCapture(),
};

export function ManualCapture() {
  return <CapturePanel kind={manualKind} />;
}
