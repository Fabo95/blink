import { Loader2, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

/** The violet bar + uppercase title every section and card header uses. */
export const SECTION_TITLE = 'section-bar text-sm font-semibold uppercase tracking-wide text-primary';

/** The small uppercase label above a field or a group inside a popover / card. */
export const FIELD_LABEL = 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground';

/**
 * A titled list section — the one frame for every list page (Inbox, Completed, Incoming,
 * Worktrees, Ideas): a card with the section title, an optional count, and a spinner while
 * its data is (re)loading. Shortcut hints live in the footer statusline, never here.
 */
export function Section({
  title,
  count,
  busy = false,
  children,
}: {
  title: string;
  count?: number;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <Card className="panel">
      <CardHeader>
        <div className="flex w-full items-center justify-between gap-2">
          <span className={`${SECTION_TITLE} flex items-center gap-2`}>
            {title}
            {busy && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
          </span>
          {count !== undefined && (
            <span className="text-xs text-muted-foreground">{count}</span>
          )}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** What a section shows when it has nothing: an icon and one short line. */
export function EmptyState({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
      <Icon className="size-6" />
      <p className="text-sm">{children}</p>
    </div>
  );
}

/** One error line, the same everywhere: red, small, at most two lines. */
export function ErrorLine({ children }: { children: ReactNode }) {
  return <p className="line-clamp-2 text-[11px] text-destructive">{children}</p>;
}
