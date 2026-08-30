import { AiCard } from '@/components/AiCard';
import { WorktreeReposCard } from '@/components/worktrees/WorktreeReposCard';

/**
 * Settings — a nav tab (below the header) that replaces the inbox. One section per
 * concern; each card owns its own keyboard actions. Leaving is a nav tab, not a shortcut.
 */
export function SettingsPage() {
  return (
    <div className="space-y-6">
      <h2 className="section-bar text-sm font-semibold uppercase tracking-wide text-primary">
        Settings
      </h2>
      <AiCard />
      <WorktreeReposCard />
    </div>
  );
}
