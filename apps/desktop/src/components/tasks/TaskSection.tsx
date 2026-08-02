import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

interface TaskSectionProps {
  title: string;
  count: number;
  children: ReactNode;
}

/** A titled task section (Inbox, Completed) with a count. Always open — only the Archive
 *  collapses. Shortcut hints live in the footer statusline, not on sections. */
export function TaskSection({ title, count, children }: TaskSectionProps) {
  return (
    <Card className="panel">
      <CardHeader>
        <div className="flex w-full items-center justify-between">
          <span className="section-bar text-sm font-semibold uppercase tracking-wide text-primary">
            {title}
          </span>
          <span className="text-xs text-muted-foreground">{count} task(s)</span>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
