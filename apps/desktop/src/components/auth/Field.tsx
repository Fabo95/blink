import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

/** A labelled form field — the label + input spacing used across the auth forms. */
export function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
