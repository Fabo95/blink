import { brand } from '@blink/core/theme';
import { Badge } from '@/components/ui/badge';
import { isTauri } from '@/lib/api';
import { cn } from '@/lib/utils';

export function Header() {
  return (
    <header className="flex items-center justify-between border-b border-border/50 px-6 py-4">
      <h1 className="bg-gradient-to-br from-blink-soft to-blink-bright bg-clip-text text-base font-semibold tracking-tight text-transparent">
        {brand.name}
      </h1>
      <Badge variant={isTauri ? 'secondary' : 'destructive'} className="gap-1.5">
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            isTauri ? 'bg-blink-success' : 'bg-destructive',
          )}
          aria-hidden
        />
        {isTauri ? 'Local core connected' : 'Browser mock'}
      </Badge>
    </header>
  );
}
