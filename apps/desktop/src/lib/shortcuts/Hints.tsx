import { HintRow } from '@/components/HintRow';
import { useHints } from './useHints';

/** The statusline: the most specific shortcuts for where you are right now (see
 *  `useHints`). One row, everywhere — the inbox footer, the capture panel, the login
 *  screen. */
export function Hints({ className }: { className?: string }) {
  return <HintRow className={className} hints={useHints()} />;
}
