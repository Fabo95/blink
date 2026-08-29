import { AuthCard } from '@/components/auth/AuthCard';
import { AuthForm } from '@/components/auth/AuthForm';
import { useSession } from '@/hooks/useSession';
import { Hints } from '@/lib/shortcuts/Hints';
import { useShortcut } from '@/lib/shortcuts/useShortcut';

/** Shown when the vault status check fails (e.g. the sync server is unreachable, or a
 *  stale session token), so a transient error isn't mistaken for "unlock". ⌘↵ retries;
 *  ⌘⇧O signs out (the only escape from behind the vault gate). */
export function VaultError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { signOut } = useSession();
  useShortcut('app.signOut', { callback: () => void signOut() });

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <AuthCard description="Couldn't reach sync">
          <AuthForm busyLabel="" busy={false} onSubmit={onRetry}>
            <p className="text-sm text-muted-foreground">
              We couldn't reach the sync server to check your vault. Check your connection,
              then try again — or sign out if you're on the wrong account.
            </p>
            <p className="break-words rounded-md border border-border/60 bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground">
              {message}
            </p>
          </AuthForm>
        </AuthCard>
      </div>
      <footer className="flex justify-center border-t border-border/50 px-6 py-3">
        <Hints />
      </footer>
    </div>
  );
}
