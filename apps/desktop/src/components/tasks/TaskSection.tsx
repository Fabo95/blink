import type { ReactNode } from 'react';
import { CollapsibleSection } from '@/components/tasks/CollapsibleSection';

interface TaskSectionProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  count: number;
  children: ReactNode;
}

/** A collapsible titled section (Inbox, Completed) with a count. Shortcut hints live in
 *  the footer statusline, not on sections. */
export function TaskSection({ title, open, onToggle, count, children }: TaskSectionProps) {
  return (
    <CollapsibleSection title={title} open={open} onToggle={onToggle} meta={`${count} task(s)`}>
      {children}
    </CollapsibleSection>
  );
}
