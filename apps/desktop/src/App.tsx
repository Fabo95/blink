import { AuthGate } from '@/components/AuthGate';
import { Inbox } from '@/components/Inbox';
import { SessionProvider } from '@/hooks/useSession';

export function App() {
  return (
    <SessionProvider>
      <AuthGate>
        <Inbox />
      </AuthGate>
    </SessionProvider>
  );
}
