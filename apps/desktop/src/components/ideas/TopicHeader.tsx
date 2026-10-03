import { Lock, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Note } from '@/generated/Note';
import type { Topic } from '@/generated/Topic';
import {
  NOTE_TYPE_LABEL,
  NOTE_TYPES,
  SENSITIVITY_OPTIONS,
  TOPIC_STATUS_OPTIONS,
} from '@/lib/notes';

/** The active topic at a glance: its guiding question, status, privacy label, and how
 *  much has been collected. Shown only while a topic filter is active. */
export function TopicHeader({ topic, notes }: { topic: Topic; notes: Note[] }) {
  const status = TOPIC_STATUS_OPTIONS.find((o) => o.value === topic.status)?.label;
  const counts = NOTE_TYPES.map((type) => ({
    type,
    count: notes.filter((n) => n.noteType === type).length,
  })).filter((c) => c.count > 0);
  const confidential = topic.sensitivity === 'confidential';
  const privacy = SENSITIVITY_OPTIONS.find((o) => o.value === topic.sensitivity)?.label;

  return (
    <div className="panel rounded-xl border border-border/60 bg-card/40 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-semibold">{topic.name}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="outline" className="text-[10px] shadow-none">
            {confidential ? (
              <Lock className="mr-1 size-3" />
            ) : (
              <ShieldCheck className="mr-1 size-3" />
            )}
            {confidential ? 'Confidential' : privacy}
          </Badge>
          <Badge variant="outline" className="text-[10px] shadow-none">
            {status}
          </Badge>
        </div>
      </div>
      {topic.question && <p className="mt-1.5 text-sm text-muted-foreground">{topic.question}</p>}
      <p className="mt-2 text-[11px] text-muted-foreground">
        {counts.length === 0
          ? 'Nothing collected yet.'
          : counts
              .map(
                ({ type, count }) =>
                  `${count} ${NOTE_TYPE_LABEL[type][count === 1 ? 'one' : 'many'].toLowerCase()}`,
              )
              .join(', ')}
        {confidential && '. AI and full exports skip this topic.'}
      </p>
    </div>
  );
}
