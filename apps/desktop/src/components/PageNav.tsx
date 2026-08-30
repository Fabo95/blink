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
 */
export function PageNav({ page, onSelect }: { page: Page; onSelect: (page: Page) => void }) {
  return (
    <nav className="flex select-none items-center gap-1 border-b border-border/50 px-6 py-2">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(tab.id)}
          className={cn(
            'rounded-md px-3 py-1 text-xs font-medium transition-colors',
            page === tab.id
              ? 'bg-card/70 text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
