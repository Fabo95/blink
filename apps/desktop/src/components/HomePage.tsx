import { CaptureCard } from '@/components/CaptureCard';
import { EgressCard } from '@/components/EgressCard';

/** The Home page: the capture hotkeys (copy, manual, idea) and the "what left this Mac" log,
 *  kept out of the inbox so the inbox is only the work. */
export function HomePage() {
  return (
    <>
      <CaptureCard />
      <EgressCard />
    </>
  );
}
