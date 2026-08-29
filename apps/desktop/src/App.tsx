import { AuthGate } from '@/components/AuthGate';
import { Inbox } from '@/components/Inbox';
import { VaultGate } from '@/components/VaultGate';
import { SessionProvider } from '@/hooks/useSession';

export function App() {
  return (
    <SessionProvider>
      <AuthGate>
        <VaultGate>
          <Inbox />
        </VaultGate>
      </AuthGate>
    </SessionProvider>
  );
}
