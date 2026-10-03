import { useState } from 'react';
import { CaptureCard } from '@/components/CaptureCard';
import { EgressCard } from '@/components/EgressCard';
import { toggleHintStyle } from '@/lib/hintStyle';
import { ShortcutHelp } from '@/lib/shortcuts/ShortcutHelp';
import { useShortcut } from '@/lib/shortcuts/useShortcut';

/**
 * The Home page: the capture hotkeys (copy, manual, idea) and the "what left this Mac" log,
 * kept out of the inbox so the inbox is only the work. It replaces `TaskList`, so it binds its own `c` / `v`.
 */
export function HomePage() {
  const [helpOpen, setHelpOpen] = useState(false);

  useShortcut('app.hintDialect', { callback: toggleHintStyle });
  useShortcut('app.help', { callback: () => setHelpOpen((open) => !open) });

  return (
    <>
      <CaptureCard />
      <EgressCard />
      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );
}
