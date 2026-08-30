import { AuthGate } from '@/components/AuthGate';
import { Inbox } from '@/components/Inbox';
import { VaultGate } from '@/components/VaultGate';
import { SessionProvider } from '@/hooks/useSession';
import { WorktreeAttentionProvider } from '@/hooks/useWorktreeAttention';

export function App() {
  return (
    <SessionProvider>
      <AuthGate>
        <VaultGate>
          <WorktreeAttentionProvider>
            <Inbox />
          </WorktreeAttentionProvider>
        </VaultGate>
      </AuthGate>
    </SessionProvider>
  );
}
