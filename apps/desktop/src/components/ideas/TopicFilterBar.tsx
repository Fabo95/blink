import { Lock } from 'lucide-react';
import { useState } from 'react';
import { PickerField } from '@/components/ideas/PickerField';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import type { Sensitivity } from '@/generated/Sensitivity';
import type { Topic } from '@/generated/Topic';
import type { TopicStatus } from '@/generated/TopicStatus';
import type { TopicsView } from '@/hooks/useTopics';
import { SENSITIVITY_OPTIONS, TOPIC_STATUS_OPTIONS } from '@/lib/notes';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { cn } from '@/lib/utils';

const FIELD = { 'data-topic-field': true };

// Native Tab moves between the prompt's fields; intercept only at the ends to wrap.
function wrapTopicFields(e: KeyboardEvent) {
  const fields = Array.from(document.querySelectorAll<HTMLElement>('[data-topic-field]'));
  const first = fields[0];
  const last = fields[fields.length - 1];
  if (fields.length < 2 || first === undefined || last === undefined) return;
  if (!e.shiftKey && e.target === last) {
    e.preventDefault();
    first.focus();
  } else if (e.shiftKey && e.target === first) {
    e.preventDefault();
    last.focus();
  }
}

/**
 * The topic filter above the notes: All plus one pill per topic, a lock on confidential
 * ones. Management is keyboard-only (`n` / `r` / `⌫`, bound in `useTopics` and IdeasPage);
 * the prompt and the delete confirm are popovers anchored to the pill row, like the inbox's
 * group bar.
 */
export function TopicFilterBar({ view }: { view: TopicsView }) {
  return (
    <div className="space-y-1.5">
      <Popover
        open={view.prompt !== null || view.deleting}
        onOpenChange={(open) => {
          if (open) return;
          if (view.prompt !== null) view.closePrompt();
          else view.cancelDelete();
        }}
      >
        <PopoverAnchor asChild>
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill
              label="All"
              selected={view.selectedId === null}
              onSelect={() => view.select(null)}
            />
            {view.topics.map((topic) => (
              <Pill
                key={topic.id}
                label={topic.name}
                locked={topic.sensitivity === 'confidential'}
                selected={view.selectedId === topic.id}
                onSelect={() => view.select(topic.id)}
              />
            ))}
          </div>
        </PopoverAnchor>
        {view.prompt !== null && (
          // Keyed so a fresh prompt starts from the topic it edits (or blank).
          <TopicPrompt
            key={`${view.prompt}-${view.selected?.id ?? 'new'}`}
            view={view}
            topic={view.prompt === 'edit' ? view.selected : null}
          />
        )}
        {view.deleting && view.selected && <DeleteTopicPopover topic={view.selected} />}
      </Popover>
      {view.error && view.prompt === null && (
        <p className="line-clamp-2 text-[11px] text-destructive">{view.error}</p>
      )}
    </div>
  );
}

function TopicPrompt({ view, topic }: { view: TopicsView; topic: Topic | null }) {
  const [name, setName] = useState(topic?.name ?? '');
  const [question, setQuestion] = useState(topic?.question ?? '');
  const [status, setStatus] = useState<TopicStatus>(topic?.status ?? 'exploring');
  const [sensitivity, setSensitivity] = useState<Sensitivity>(topic?.sensitivity ?? 'personal');

  useShortcut('topicPrompt.field', { callback: wrapTopicFields });
  useShortcut('topicPrompt.submit', {
    callback: () => void view.submitPrompt({ name, question, status, sensitivity }),
  });
  useShortcut('topicPrompt.cancel', { callback: view.closePrompt });

  return (
    <PopoverContent align="start" sideOffset={8} className="w-80 p-3">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {topic ? 'Edit topic' : 'New topic'}
      </p>
      <Input
        autoFocus
        data-topic-field
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Topic name"
        className="h-8 text-sm"
      />
      <p className="mb-1.5 mt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Guiding question
      </p>
      <Textarea
        data-topic-field
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="What are you trying to find out?"
        className="min-h-[60px] resize-none text-sm leading-relaxed"
      />
      <div className="mt-3 space-y-2">
        {topic && (
          <PickerField
            label="Status"
            value={status}
            options={TOPIC_STATUS_OPTIONS}
            onChange={(value) => {
              const picked = TOPIC_STATUS_OPTIONS.find((o) => o.value === value);
              if (picked) setStatus(picked.value);
            }}
            fieldMarker={FIELD}
          />
        )}
        <PickerField
          label="Privacy"
          value={sensitivity}
          options={SENSITIVITY_OPTIONS}
          onChange={(value) => {
            const picked = SENSITIVITY_OPTIONS.find((o) => o.value === value);
            if (picked) setSensitivity(picked.value);
          }}
          fieldMarker={FIELD}
        />
      </div>
      {view.error && <p className="mt-2 line-clamp-2 text-[11px] text-destructive">{view.error}</p>}
    </PopoverContent>
  );
}

/** Confirm-before-delete with two outcomes, both keyboard: ⌘↵ keeps the notes (unfiled),
 *  ⌘⌫ deletes them too (bound in `useTopics`). */
function DeleteTopicPopover({ topic }: { topic: Topic }) {
  return (
    <PopoverContent align="start" sideOffset={8} className="w-72 p-3">
      <p className="text-sm font-medium">Delete “{topic.name}”?</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        ⌘↵ deletes the topic and keeps its notes (they move to All). ⌘⌫ deletes the notes too, on
        every device.
      </p>
    </PopoverContent>
  );
}

// Mouse-only click target, like the group pills: out of the Tab order, focus stays on body.
function Pill({
  label,
  selected,
  locked,
  onSelect,
}: {
  label: string;
  selected: boolean;
  locked?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors',
        selected
          ? 'border-primary/40 bg-card/70 text-foreground'
          : 'border-border/60 bg-card/40 text-muted-foreground',
      )}
    >
      {locked && <Lock aria-label="Confidential" className="size-3" />}
      {label}
    </button>
  );
}
