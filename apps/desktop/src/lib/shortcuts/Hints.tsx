import { HintRow } from '@/components/HintRow';
import { useHints } from './useHints';

/** The chips for what works right now, `ORDER`-sorted. Pass a `group` to render one
 *  statusline row (the inbox footer splits `global` / `context`); omit it to show every
 *  enabled chip (the capture panel and login screen render a single ungrouped row). */
export function Hints({ group, className }: { group?: 'global' | 'context'; className?: string }) {
  return <HintRow className={className} hints={useHints(group)} />;
}
