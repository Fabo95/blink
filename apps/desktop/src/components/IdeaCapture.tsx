import { type CaptureKind, CapturePanel } from '@/components/CapturePanel';
import { api } from '@/lib/api';

/**
 * Idea capture: a blank panel like manual capture, preset to file an idea (`⌘T` still
 * switches to a thought, source, or task). Stored with a synthetic "manual" source so the
 * `Note` shape stays uniform.
 */
const ideaKind: CaptureKind = {
  title: 'Idea capture',
  placeholder: 'Type a task…',
  openEvent: 'idea-capture-open',
  showSource: false,
  defaultType: 'idea',
  load: async () => ({
    text: '',
    source: {
      appId: 'manual',
      appName: 'Manual',
      windowTitle: '',
      capturedAt: new Date().toISOString(),
    },
  }),
  dismiss: () => api.dismissIdeaCapture(),
};

export function IdeaCapture() {
  return <CapturePanel kind={ideaKind} />;
}
