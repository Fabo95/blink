import { Archive, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { Task } from '@/generated/Task';
import type { ArchiveView } from '@/hooks/useArchive';

interface ArchivePageProps {
  archive: ArchiveView;
  /** Total archived count (independent of the search filter), for the header. */
  totalCount: number;
  renderRow: (task: Task) => ReactNode;
}

/** The Archive as its own page: reached with `a`, it replaces the inbox with a searchable,
 *  paginated, day-grouped list of older completions. `s` focuses search, `←→` pages, `a`/Esc
 *  return to the inbox (bound in TaskList / useArchive, hinted in the footer statusline). */
export function ArchivePage({ archive, totalCount, renderRow }: ArchivePageProps) {
  const { query, setQuery, searchRef, groups, items, page, pageCount, changePage } = archive;

  return (
    <Card className="panel">
      <CardHeader className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="section-bar text-sm font-semibold uppercase tracking-wide text-primary">
            Archive
          </span>
          <span className="text-xs text-muted-foreground">{totalCount} completed</span>
        </div>
        <div className="flex h-9 items-center gap-2 rounded-md border border-input px-3 shadow-sm transition focus-within:ring-1 focus-within:ring-ring">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return;
              // Esc clears the query first, then blurs back to the list (it never leaves the
              // page from inside the field — the field swallows it before the global shortcut).
              if (query) setQuery('');
              else searchRef.current?.blur();
            }}
            placeholder="Search completed…"
            className="h-auto min-w-0 flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
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
      </CardContent>
    </Card>
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
