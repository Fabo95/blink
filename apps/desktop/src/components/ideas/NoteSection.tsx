import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

/** A titled notes section (Ideas, Thoughts, Sources, Results) with a count, styled like
 *  the inbox's task sections. */
export function NoteSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <Card className="panel">
      <CardHeader>
        <div className="flex w-full items-center justify-between">
          <span className="section-bar text-sm font-semibold uppercase tracking-wide text-primary">
            {title}
          </span>
          <span className="text-xs text-muted-foreground">{count}</span>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
