import { AiCard } from '@/components/AiCard';
import { WorktreeSettingsCard } from '@/components/worktrees/WorktreeSettingsCard';

/**
 * Settings — a nav tab (below the header) that replaces the inbox. One card per concern;
 * each owns its own keyboard actions. Leaving is a nav tab, not a shortcut. (Managed repos
 * live on the Worktrees page, not here.)
 */
export function SettingsPage() {
  return (
    <div className="space-y-6">
      <h2 className="section-bar text-sm font-semibold uppercase tracking-wide text-primary">
        Settings
      </h2>
      <AiCard />
      <WorktreeSettingsCard />
    </div>
  );
}
