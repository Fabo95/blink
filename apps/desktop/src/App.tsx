import { AuthGate } from '@/components/AuthGate';
import { Inbox } from '@/components/Inbox';
import { SessionProvider } from '@/hooks/useSession';
import { WorktreeAttentionProvider } from '@/hooks/useWorktreeAttention';

export function App() {
  return (
    <SessionProvider>
      <AuthGate>
        <WorktreeAttentionProvider>
          <Inbox />
        </WorktreeAttentionProvider>
      </AuthGate>
    </SessionProvider>
  );
}
