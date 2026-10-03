import type { NoteType } from '@blink/contract/wire';

export interface TopicRef {
  id: string;
  name: string;
  sensitivity: string;
}

/** Matches the desktop's `review_service.rs`: ideas and thoughts first come back for
 * review after two weeks; sources are judged through the ideas they support. */
const FIRST_REVISIT_DAYS = 14;

export type CaptureKind = 'task' | NoteType;

// The spoken command that must open a capture: "Create task …", "create an idea: …",
// "Create a new source, …". The command decides the kind; the rest is the content.
const COMMAND = /^\s*create\s+(?:(?:a|an)\s+)?(?:new\s+)?(task|idea|thought|source)\b[\s:,.-]*/i;
const LITERAL_LINK = /https?:\/\/\S+/i;

/** The kind named by the opening "Create …" command, and the note without it. `null` when
 * the note doesn't start with a command. */
export function spokenCommand(text: string): { kind: CaptureKind; rest: string } | null {
  const match = COMMAND.exec(text);
  const word = match?.[1]?.toLowerCase();
  if (!match || !isCaptureKind(word)) return null;
  const rest = text.slice(match[0].length).trim();
  return { kind: word, rest: rest || text.trim() };
}

function isCaptureKind(word: string | undefined): word is CaptureKind {
  return word === 'task' || word === 'idea' || word === 'thought' || word === 'source';
}

/** The first topic whose name appears in the note as a whole word or phrase,
 * case-insensitive. Used for the confidential guard, so it errs towards matching. */
export function mentionedTopic(text: string, topics: TopicRef[]): TopicRef | undefined {
  const haystack = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  return topics.find((topic) => {
    const name = topic.name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
    return name.length > 0 && haystack.includes(` ${name} `);
  });
}

/** A URL only if one literally appears in the note. */
export function literalLink(text: string): string | null {
  return LITERAL_LINK.exec(text)?.[0] ?? null;
}

/** When a newly captured note first comes back for review. */
export function firstRevisit(noteType: NoteType, now: Date): string | null {
  if (noteType === 'source') return null;
  return new Date(now.getTime() + FIRST_REVISIT_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** Case-insensitive exact name match against a closed list: a model that echoes "Work" for
 * "work" still resolves, a name it made up resolves to nothing. */
export function matchByName<T extends { name: string }>(
  name: string | null,
  items: T[],
): T | undefined {
  if (!name) return undefined;
  const wanted = name.trim().toLowerCase();
  return items.find((item) => item.name.toLowerCase() === wanted);
}
