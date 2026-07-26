import { brand } from '@blink/core/theme';
import type { ReactNode } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface AuthCardProps {
  description: ReactNode;
  children: ReactNode;
  /** Rendered outside the card (e.g. the sign-in ↔ sign-up toggle). */
  footer?: ReactNode;
}

/** The centered, branded auth card shared by every login step. */
export function AuthCard({ description, children, footer }: AuthCardProps) {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="bg-gradient-to-br from-blink-soft to-blink-bright bg-clip-text text-lg font-semibold tracking-tight text-transparent">
            {brand.name}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
      {footer}
    </div>
  );
}
