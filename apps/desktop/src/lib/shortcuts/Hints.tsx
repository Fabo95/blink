import { HintRow } from '@/components/HintRow';
import { useHints } from './useHints';

/** The chips for exactly what works right now, ORDER-sorted — the footer statusline and
 *  the in-card rows (capture panel, auth forms) are all this one view. */
export function Hints({ className }: { className?: string }) {
  return <HintRow className={className} hints={useHints()} />;
}
