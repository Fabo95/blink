import type { ReactNode } from 'react';
import { type Shortcut, ShortcutHint } from '@/components/ShortcutHint';
import { CollapsibleSection } from '@/components/tasks/CollapsibleSection';

interface TaskSectionProps {
  title: string;
  toggleKey: string;
  open: boolean;
  onToggle: () => void;
  count: number;
  shortcuts: Shortcut[];
  /** Hide the hint row when there's nothing to act on (e.g. an empty inbox). */
  showShortcuts?: boolean;
  children: ReactNode;
}

/** A collapsible titled section (Inbox, Completed) with a count and the list keymap hint. */
export function TaskSection({
  title,
  toggleKey,
  open,
  onToggle,
  count,
  shortcuts,
  showShortcuts = true,
  children,
}: TaskSectionProps) {
  return (
    <CollapsibleSection
      title={title}
      toggleKey={toggleKey}
      open={open}
      onToggle={onToggle}
      meta={`${count} task(s)`}
      headerExtra={showShortcuts ? <ShortcutHint shortcuts={shortcuts} /> : null}
    >
      {children}
    </CollapsibleSection>
  );
}
