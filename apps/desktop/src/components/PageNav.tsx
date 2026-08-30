import { cn } from '@/lib/utils';

/** The app's top-level pages, switched from the nav below the header. */
export type Page = 'inbox' | 'worktrees' | 'settings';

const TABS: { id: Page; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'worktrees', label: 'Worktrees' },
  { id: 'settings', label: 'Settings' },
];

/**
 * Page navigation below the header. This is the app's one page-switching affordance —
 * clickable only, no keyboard binding (top-level pages are not opened by shortcut). Tabs
 * stay out of the keyboard focus flow (`tabIndex={-1}` + mousedown-preventDefault) so the
 * in-page shortcuts keep firing, matching the app's other mouse affordances.
 *
 * `badges` hangs a small "needs you" count on a tab (the Worktrees attention badge) — so a
 * worktree waiting for input is visible from anywhere, not just the Worktrees page.
 */
export function PageNav({
  page,
  onSelect,
  badges,
}: {
  page: Page;
  onSelect: (page: Page) => void;
  badges?: Partial<Record<Page, number>>;
}) {
  return (
    <nav className="flex select-none items-center gap-1 border-b border-border/50 px-6 py-2">
      {TABS.map((tab) => {
        const count = badges?.[tab.id] ?? 0;
        return (
          <button
            key={tab.id}
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(tab.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors',
              page === tab.id
                ? 'bg-card/70 text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
            {count > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-blink-bright px-1 text-[10px] font-semibold leading-none text-background">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
