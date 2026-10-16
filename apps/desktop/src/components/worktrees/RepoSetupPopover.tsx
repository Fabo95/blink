import { Input } from '@/components/ui/input';
import { PopoverContent } from '@/components/ui/popover';
import type { ManagedRepo } from '@/generated/ManagedRepo';

/** Edit a managed repo's worktree setup command, as a popover anchored to the repo pills (like
 *  the delete-repo popover). No buttons: ⌘↵ saves (empty clears), Esc cancels. */
export function RepoSetupPopover({
  repo,
  value,
  onChange,
}: {
  repo: ManagedRepo;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <PopoverContent align="start" sideOffset={8} className="w-96 p-3">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Setup for {repo.name}
      </p>
      <Input
        // biome-ignore lint/a11y/noAutofocus: keyboard-first — land in the command field
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="pnpm install && cp {repo}/.env ."
        className="h-8 font-mono text-[13px]"
      />
      <p className="mt-2 text-[11px] text-muted-foreground">
        Runs in each new worktree before Claude starts. {'{repo}'} is the main checkout. Empty
        means no setup.
      </p>
    </PopoverContent>
  );
}
