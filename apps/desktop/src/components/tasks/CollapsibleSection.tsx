import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Kbd } from '@/components/ui/kbd';
import { cn } from '@/lib/utils';

interface CollapsibleSectionProps {
  title: string;
  /** The single key that toggles this section, shown as a chip beside the title. */
  toggleKey: string;
  open: boolean;
  onToggle: () => void;
  /** Right-aligned header text (e.g. a count). */
  meta: ReactNode;
  /** Shown under the header button while open — hints, a search field, etc. */
  headerExtra?: ReactNode;
  /** The section body, rendered only while open. */
  children: ReactNode;
  bodyClassName?: string;
}

/** A titled card that collapses to just its header. The toggle key sits next to the
 *  title; the whole header is the click target, and a chevron reflects the state. */
export function CollapsibleSection({
  title,
  toggleKey,
  open,
  onToggle,
  meta,
  headerExtra,
  children,
  bodyClassName,
}: CollapsibleSectionProps) {
  return (
    <Card className="panel">
      <CardHeader className={cn(open && headerExtra ? 'space-y-2.5' : 'space-y-0')}>
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-between"
        >
          <span className="flex items-center gap-2">
            <span className="section-bar text-sm font-semibold uppercase tracking-wide text-primary">
              {title}
            </span>
            <Kbd>{toggleKey}</Kbd>
          </span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            {meta}
            <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
          </span>
        </button>
        {open && headerExtra}
      </CardHeader>
      {open && (
        <CardContent className={cn('duration-200 animate-in fade-in', bodyClassName)}>
          {children}
        </CardContent>
      )}
    </Card>
  );
}
