import { brand } from '@blink/core/theme';
import { useHotkeys } from 'react-hotkeys-hook';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { AuthUser } from '@/generated/AuthUser';
import { Kbd } from '@/components/ui/kbd';
import { isTauri } from '@/lib/api';
import { cn } from '@/lib/utils';

interface HeaderProps {
  account: AuthUser;
  onSignOut: () => void;
}

export function Header({ account, onSignOut }: HeaderProps) {
  // ⌘⇧Q signs out (mirrors macOS's own log-out chord); the menu item shows the hint.
  useHotkeys('mod+shift+q', onSignOut, { preventDefault: true });

  return (
    <header
      data-tauri-drag-region
      className="flex select-none items-center justify-between border-b border-border/50 px-6 pb-4 pt-11 [&>*]:pointer-events-none"
    >
      <h1 className="bg-gradient-to-br from-blink-soft to-blink-bright bg-clip-text text-base font-semibold tracking-tight text-transparent">
        {brand.name}
      </h1>
      <div className="flex items-center gap-3">
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
            <DropdownMenuItem onSelect={onSignOut}>
              Sign out
              <Kbd className="ml-auto">⌘⇧q</Kbd>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
