import { CaptureCard } from '@/components/CaptureCard';
import { ConnectionsCard } from '@/components/ConnectionsCard';
import { EgressCard } from '@/components/EgressCard';
import { WorktreeSettingsCard } from '@/components/worktrees/WorktreeSettingsCard';
import type { SourceConnectionsView } from '@/hooks/useSourceConnections';

/**
 * Settings — a nav tab (below the header) that replaces the inbox. One card per concern;
 * each owns its own keyboard actions: capture hotkeys, connections (Incoming sources + the
 * OpenAI key), worktrees, and the "what left this Mac" log. Leaving is a nav tab, not a
 * shortcut. (Managed repos live on the Worktrees page, not here.) Like every page, its list
 * keys stand down while the cheat-sheet (`helpOpen`) is up.
 */
export function SettingsPage({
  sources,
  onSourcesChanged,
  helpOpen,
}: {
  sources: SourceConnectionsView;
  onSourcesChanged: () => void;
  helpOpen: boolean;
}) {
  return (
    <div className="space-y-6">
      <CaptureCard />
      <ConnectionsCard
        sources={sources}
        onSourcesChanged={onSourcesChanged}
        enabled={!helpOpen}
      />
      <WorktreeSettingsCard />
      <EgressCard />
    </div>
  );
}
