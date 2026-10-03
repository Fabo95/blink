import { useState } from 'react';
import { CaptureCard } from '@/components/CaptureCard';
import { toggleHintStyle } from '@/lib/hintStyle';
import { ShortcutHelp } from '@/lib/shortcuts/ShortcutHelp';
import { useShortcut } from '@/lib/shortcuts/useShortcut';

/**
 * The Home page: where the capture hotkeys live (copy, manual, idea), kept out of the inbox
 * so the inbox is only the work. It replaces `TaskList`, so it binds its own `c` / `v`.
 */
export function HomePage() {
  const [helpOpen, setHelpOpen] = useState(false);

  useShortcut('app.hintDialect', { callback: toggleHintStyle });
  useShortcut('app.help', { callback: () => setHelpOpen((open) => !open) });

  return (
    <>
      <CaptureCard />
      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );
}
