import { useState } from 'react';
import type { Note } from '@/generated/Note';
import type { ReviewDecision } from '@/generated/ReviewDecision';
import type { ReviewOutcome } from '@/generated/ReviewOutcome';
import { api } from '@/lib/api';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { errorMessage } from '@/lib/utils';

/** A session reviews at most this many notes, so it fits in a few minutes. */
export const SESSION_LIMIT = 10;

export interface ReviewView {
  /** The note under review, or `null` when the popover is closed. */
  current: Note | null;
  /** 1-based position in the session and the session size (1 of 1 for a single review). */
  position: number;
  total: number;
  conviction: number;
  comment: string;
  setComment: (value: string) => void;
  busy: boolean;
  error: string;
  open: (note: Note) => void;
  startSession: (due: Note[]) => void;
  close: () => void;
}

interface Options {
  onReviewed: (outcome: ReviewOutcome) => void | Promise<void>;
}

// Start from the last conviction given, so an unchanged opinion is one keystroke.
const initialConviction = (note: Note | undefined) => note?.convictionHistory.at(-1) ?? 3;

/**
 * The review popover's state: one note, or a session over the due queue (capped at
 * {@link SESSION_LIMIT}). `⌘1`–`⌘5` set the conviction, then `⌘↵` keeps the note, `⌘p`
 * promotes it into an inbox task, `⌘⌫` drops it; a session then moves to the next note.
 * `Esc` closes (and ends a session).
 */
export function useReview({ onReviewed }: Options): ReviewView {
  const [queue, setQueue] = useState<Note[]>([]);
  const [index, setIndex] = useState(0);
  const [conviction, setConviction] = useState(3);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const current = queue[index] ?? null;

  const begin = (notes: Note[]) => {
    setQueue(notes);
    setIndex(0);
    setConviction(initialConviction(notes[0]));
    setComment('');
    setError('');
  };

  const close = () => {
    setQueue([]);
    setIndex(0);
    setComment('');
    setError('');
  };

  const submit = async (decision: ReviewDecision) => {
    if (!current) return;
    setBusy(true);
    setError('');
    try {
      const outcome = await api.reviewNote(
        current.id,
        conviction,
        comment.trim() || null,
        decision,
      );
      await onReviewed(outcome);
      const next = queue[index + 1];
      if (next) {
        setIndex(index + 1);
        setConviction(initialConviction(next));
        setComment('');
      } else {
        close();
      }
    } catch (e) {
      setError(errorMessage(e, 'Could not save the review'));
    } finally {
      setBusy(false);
    }
  };

  const active = current !== null && !busy;
  const rate = (value: number) => ({ enabled: active, callback: () => setConviction(value) });
  useShortcut('review.conviction1', rate(1));
  useShortcut('review.conviction2', rate(2));
  useShortcut('review.conviction3', rate(3));
  useShortcut('review.conviction4', rate(4));
  useShortcut('review.conviction5', rate(5));
  useShortcut('review.keep', { enabled: active, callback: () => void submit('keep') });
  useShortcut('review.promote', { enabled: active, callback: () => void submit('promote') });
  useShortcut('review.drop', { enabled: active, callback: () => void submit('drop') });
  useShortcut('review.close', { enabled: current !== null, callback: close });

  return {
    current,
    position: index + 1,
    total: queue.length,
    conviction,
    comment,
    setComment,
    busy,
    error,
    open: (note) => begin([note]),
    startSession: (due) => begin(due.slice(0, SESSION_LIMIT)),
    close,
  };
}
