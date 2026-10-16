import type { Note } from '@/generated/Note';
import type { NoteType } from '@/generated/NoteType';
import type { Sensitivity } from '@/generated/Sensitivity';
import type { TopicStatus } from '@/generated/TopicStatus';

/** What a capture becomes: a task, or one of the note types. */
export type CaptureType = 'task' | NoteType;

/** `t` cycle order on a note, and the Ideas page's section order. */
export const NOTE_TYPES: NoteType[] = ['idea', 'thought', 'source'];

export const NOTE_TYPE_LABEL: Record<NoteType, { one: string; many: string }> = {
  idea: { one: 'Idea', many: 'Ideas' },
  thought: { one: 'Thought', many: 'Thoughts' },
  source: { one: 'Source', many: 'Sources' },
};

export const CAPTURE_TYPE_LABEL: Record<CaptureType, string> = {
  task: 'Task',
  idea: 'Idea',
  thought: 'Thought',
  source: 'Source',
};

export const NOTE_PLACEHOLDER: Record<NoteType, string> = {
  idea: 'What’s the idea?',
  thought: 'What are you thinking?',
  source: 'Paste a quote or describe the source…',
};

export const SENSITIVITY_OPTIONS: { value: Sensitivity; label: string }[] = [
  { value: 'personal', label: 'Personal' },
  { value: 'internal', label: 'Internal' },
  { value: 'confidential', label: 'Confidential (no AI, not in full exports)' },
];

export const TOPIC_STATUS_OPTIONS: { value: TopicStatus; label: string }[] = [
  { value: 'exploring', label: 'Exploring' },
  { value: 'pursuing', label: 'Pursuing' },
  { value: 'parked', label: 'Parked' },
  { value: 'dropped', label: 'Dropped' },
];

/** The next entry of a cycle, wrapping at the end. */
export function cycleNext<T>(order: readonly T[], current: T): T {
  const idx = order.indexOf(current);
  const next = order[(idx + 1) % order.length];
  return next === undefined ? current : next;
}

/** Notes bucketed by type for the Ideas page sections, keeping the incoming order. */
export function splitNotes(notes: Note[]): Record<NoteType, Note[]> {
  const buckets: Record<NoteType, Note[]> = { idea: [], thought: [], source: [] };
  for (const note of notes) buckets[note.noteType].push(note);
  return buckets;
}
