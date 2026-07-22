import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A single keyboard key/combo, rendered as a small chip. Used everywhere a shortcut
 *  is shown so key hints look identical across the app. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'rounded border border-border bg-muted/50 px-1 py-px font-mono text-[10px] leading-none text-muted-foreground',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
