import { BookOpen, Lightbulb, ListTodo, MessageCircle } from 'lucide-react';
import type { CaptureType } from '@/lib/notes';
import { cn } from '@/lib/utils';

const ICONS = {
  task: ListTodo,
  idea: Lightbulb,
  thought: MessageCircle,
  source: BookOpen,
} satisfies Record<CaptureType, unknown>;

export function NoteTypeIcon({ type, className }: { type: CaptureType; className?: string }) {
  const Icon = ICONS[type];
  return <Icon aria-hidden className={cn('size-3.5 shrink-0', className)} />;
}
