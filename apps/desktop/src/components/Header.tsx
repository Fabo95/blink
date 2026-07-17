import { brand } from '@blink/core/theme';
import { GlobeMark } from '@/components/GlobeMark';
import { Badge } from '@/components/ui/badge';
import { isTauri } from '@/lib/api';
import { cn } from '@/lib/utils';

export function Header() {
  return (
    <header className="flex items-center justify-between border-b border-border/50 px-6 py-4">
      <div className="flex items-center gap-3">
        <GlobeMark className="size-8 drop-shadow-[0_0_10px_rgba(139,92,246,0.45)]" />
        <div>
          <h1 className="bg-gradient-to-br from-blink-soft to-blink-bright bg-clip-text text-lg font-semibold tracking-tight text-transparent">
            {brand.name}
          </h1>
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
