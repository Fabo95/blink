import { brand } from '@blink/core/theme';
import { Badge } from '@/components/ui/badge';
import { isTauri } from '@/lib/api';
import { cn } from '@/lib/utils';

export function Header() {
  return (
    <header className="flex items-center justify-between border-b px-6 py-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden>
          {brand.glyph}
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-primary">{brand.name}</h1>
          <p className="text-xs text-muted-foreground">{brand.tagline}</p>
        </div>
      </div>
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
