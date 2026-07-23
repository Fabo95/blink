import { Archive, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { ShortcutHint } from '@/components/ShortcutHint';
import { CollapsibleSection } from '@/components/tasks/CollapsibleSection';
import { COMPLETED_SHORTCUTS } from '@/components/tasks/hints';
import { Input } from '@/components/ui/input';
import type { Task } from '@/generated/Task';
import type { ArchiveView } from '@/hooks/useArchive';

interface ArchiveSectionProps {
  archive: ArchiveView;
  /** Total archived count (independent of the search filter), for the header. */
  totalCount: number;
  renderRow: (task: Task) => ReactNode;
}

/** Collapsible, searchable, paginated list of older completions, expanded in place. */
export function ArchiveSection({ archive, totalCount, renderRow }: ArchiveSectionProps) {
  const { open, toggle, query, setQuery, searchRef, groups, items, page, pageCount, changePage } =
    archive;

  return (
    <CollapsibleSection
      title="Archive"
      toggleKey="a"
      open={open}
      onToggle={toggle}
      meta={`${totalCount} completed`}
      bodyClassName="space-y-5"
      headerExtra={
        <>
          <div className="flex h-9 items-center gap-2 rounded-md border border-input px-3 shadow-sm transition focus-within:ring-1 focus-within:ring-ring">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Escape') return;
                // Esc clears the query first, then blurs back to the list.
                if (query) setQuery('');
                else searchRef.current?.blur();
              }}
              placeholder="Search completed…"
              className="h-auto flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
            />
          </div>
          <ShortcutHint
            shortcuts={[
              ...COMPLETED_SHORTCUTS,
              ...(pageCount > 1 ? [{ keys: '←→', label: 'page' }] : []),
            ]}
          />
        </>
      }
    >
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
          <Archive className="size-6" />
          <p className="text-sm">
            {query.trim() ? 'No completed tasks match.' : 'Nothing archived yet.'}
          </p>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.key} className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
              {group.label}
            </p>
            <ul className="space-y-2">{group.tasks.map(renderRow)}</ul>
          </div>
        ))
      )}
      {pageCount > 1 && <Pager page={page} pageCount={pageCount} onChange={changePage} />}
    </CollapsibleSection>
  );
}

function Pager({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-4 pt-1 text-xs text-muted-foreground">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page === 0}
        aria-label="Newer completions"
        className="rounded-md p-1 transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="tabular-nums">
        Page {page + 1} of {pageCount}
      </span>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page === pageCount - 1}
        aria-label="Older completions"
        className="rounded-md p-1 transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
