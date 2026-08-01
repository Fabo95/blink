import { type CaptureKind, CapturePanel } from '@/components/CapturePanel';
import { api } from '@/lib/api';

/**
 * Copy capture: the global hotkey records the frontmost app as the source, copies the
 * selection, and sanitizes it. The panel opens pre-filled with that draft.
 */
const copyKind: CaptureKind = {
  title: 'Copy capture',
  placeholder: 'Captured text…',
  openEvent: 'copy-capture-open',
  showSource: true,
  load: async () => {
    const draft = await api.readCopyCapture();
    return {
      text: draft.text,
      source: draft.source,
      redactionCount: draft.redactionCount,
      link: draft.link ?? undefined,
    };
  },
  dismiss: () => api.dismissCopyCapture(),
};

export function CopyCapture() {
  return <CapturePanel kind={copyKind} />;
}
