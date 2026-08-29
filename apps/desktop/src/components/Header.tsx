import { brand } from '@blink/core/theme';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SyncIndicator } from '@/components/SyncIndicator';
import type { AuthUser } from '@/generated/AuthUser';
import { isTauri } from '@/lib/api';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { cn } from '@/lib/utils';

interface HeaderProps {
  account: AuthUser;
  onSignOut: () => void;
}

export function Header({ account, onSignOut }: HeaderProps) {
  useShortcut('app.signOut', { callback: onSignOut });

  return (
    <header
      data-tauri-drag-region
      className="flex select-none items-center justify-between border-b border-border/50 px-6 pb-4 pt-11 [&>*]:pointer-events-none"
    >
      <h1 className="bg-gradient-to-br from-blink-soft to-blink-bright bg-clip-text text-base font-semibold tracking-tight text-transparent">
        {brand.name}
      </h1>
      <div className="flex items-center gap-3">
        <SyncIndicator />

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
        <DropdownMenu>
          <DropdownMenuTrigger className="pointer-events-auto text-xs text-muted-foreground outline-none hover:text-foreground">
            {account.name ?? account.email}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="max-w-56 truncate font-normal text-muted-foreground">
              {account.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onSignOut}>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
