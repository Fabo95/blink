import { AuthGate } from '@/components/AuthGate';
import { Inbox } from '@/components/Inbox';
import { SessionProvider } from '@/hooks/useSession';
import { WorktreeAttentionProvider } from '@/hooks/useWorktreeAttention';
import { ReloadProvider } from '@/lib/reload';

export function App() {
  return (
    <SessionProvider>
      <AuthGate>
        <WorktreeAttentionProvider>
          <ReloadProvider>
            <Inbox />
          </ReloadProvider>
        </WorktreeAttentionProvider>
      </AuthGate>
    </SessionProvider>
  );
}
