/** Browser mock: topics, notes, reviews, links, source enrichment, export, and the egress log. */

import type { EgressEvent } from '@/generated/EgressEvent';
import type { Evidence } from '@/generated/Evidence';
import type { NewNote } from '@/generated/NewNote';
import type { NewTopic } from '@/generated/NewTopic';
import type { Note } from '@/generated/Note';
import type { NoteLink } from '@/generated/NoteLink';
import type { NoteRelation } from '@/generated/NoteRelation';
import type { NoteReview } from '@/generated/NoteReview';
import type { NoteRevision } from '@/generated/NoteRevision';
import type { NoteStatus } from '@/generated/NoteStatus';
import type { NoteType } from '@/generated/NoteType';
import type { ReviewNudge } from '@/generated/ReviewNudge';
import type { Sensitivity } from '@/generated/Sensitivity';
import type { Task } from '@/generated/Task';
import type { Topic } from '@/generated/Topic';
import type { TopicStatus } from '@/generated/TopicStatus';
import { saveMockTask } from './tasks';
import type { MockHandlers } from './types';

// Seed topics across all three sensitivities and notes across all types, plus one note
// with a sync conflict and history, so every Ideas state is visible in `pnpm desktop`.
function seedMockTopics(): Topic[] {
  const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
  const topic = (
    name: string,
    question: string | null,
    sensitivity: Sensitivity,
    status: TopicStatus,
    age: number,
  ): Topic => ({
    id: crypto.randomUUID(),
    name,
    question,
    status,
    sensitivity,
    createdAt: daysAgo(age),
    updatedAt: daysAgo(age),
  });
  return [
    topic(
      'Agentic commerce',
      'Is there a business in agents booking local businesses?',
      'personal',
      'exploring',
      30,
    ),
    topic(
      'Review bottleneck',
      'What makes agent-written code safe to merge?',
      'internal',
      'parked',
      20,
    ),
    topic('Board strategy', null, 'confidential', 'pursuing', 10),
  ];
}

const mockTopics: Topic[] = seedMockTopics();
let mockActiveTopic: string | null = null;
const mockNoteRevisions: NoteRevision[] = [];
const mockNoteReviews: NoteReview[] = [];
const DAY_MS = 86_400_000;

// Mirrors the core's review rules (`review_service.rs`): first review after 14 days for
// ideas and thoughts, then sooner the more convinced you are.
function mockFirstRevisit(noteType: NoteType, from: number): string | null {
  return noteType === 'source' ? null : new Date(from + 14 * DAY_MS).toISOString();
}

function mockNextRevisit(conviction: number, from: number): string | null {
  const days = ({ 5: 7, 4: 14, 3: 30, 2: 60 } as Record<number, number>)[conviction];
  return days === undefined ? null : new Date(from + days * DAY_MS).toISOString();
}

function mockNudge(history: number[], status: NoteStatus): ReviewNudge | null {
  const last = history[history.length - 1];
  if (last === undefined) return null;
  const tail = (n: number) => (history.length >= n ? history.slice(-n) : null);
  if (status !== 'promoted' && tail(3)?.every((c) => c >= 4)) return 'promote';
  if (last <= 1 || tail(2)?.every((c) => c <= 2)) return 'drop';
  return null;
}

const mockNoteLinks: NoteLink[] = [];
const mockEgress: EgressEvent[] = [];

function mockEvidence(noteId: string): Evidence {
  const evidence: Evidence = { supports: 0, contradicts: 0, related: 0 };
  for (const link of mockNoteLinks) {
    if (link.toNoteId === noteId && link.relation === 'supports') evidence.supports += 1;
    if (link.toNoteId === noteId && link.relation === 'contradicts') evidence.contradicts += 1;
    if (link.relation === 'related' && (link.toNoteId === noteId || link.fromNoteId === noteId)) {
      evidence.related += 1;
    }
  }
  return evidence;
}

function mockEgressEvent(kind: EgressEvent['kind'], destination: string, bytes: number) {
  mockEgress.unshift({
    id: crypto.randomUUID(),
    kind,
    destination,
    noteId: null,
    bytes,
    createdAt: new Date().toISOString(),
  });
}

// Mirrors the core's `decorate`: conviction history, nudge, and evidence are derived.
function mockWithReviews(note: Note): Note {
  const history = mockNoteReviews.filter((r) => r.noteId === note.id).map((r) => r.conviction);
  return {
    ...note,
    convictionHistory: history,
    reviewNudge: mockNudge(history, note.status),
    evidence: mockEvidence(note.id),
  };
}

function seedMockNotes(): Note[] {
  const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
  const [commerce, review, board] = mockTopics.map((t) => t.id);
  const note = (
    noteType: NoteType,
    text: string,
    topicId: string | null,
    age: number,
    link: string | null = null,
    appName = 'Manual',
  ): Note => ({
    id: crypto.randomUUID(),
    noteType,
    text,
    rawText: text,
    link,
    topicId,
    improved: false,
    conflict: false,
    status: 'open',
    revisitAt: mockFirstRevisit(noteType, Date.now() - age * DAY_MS),
    convictionHistory: [],
    reviewNudge: null,
    title: null,
    excerpt: null,
    summary: null,
    enrichment: noteType === 'source' && link ? 'done' : 'none',
    evidence: { supports: 0, contradicts: 0, related: 0 },
    source: { appId: appName.toLowerCase(), appName, windowTitle: '', capturedAt: daysAgo(age) },
    createdAt: daysAgo(age),
    updatedAt: daysAgo(age),
  });
  const conflicted = note(
    'idea',
    'Restaurant MCP server that exposes live availability',
    commerce ?? null,
    12,
  );
  conflicted.conflict = true;
  mockNoteRevisions.push(
    {
      id: crypto.randomUUID(),
      noteId: conflicted.id,
      text: 'Restaurant MCP server, availability + deals',
      reason: 'conflict',
      createdAt: daysAgo(1),
    },
    {
      id: crypto.randomUUID(),
      noteId: conflicted.id,
      text: 'MCP server for restaurants',
      reason: 'edit',
      createdAt: daysAgo(6),
    },
  );
  // Two notes due: one with a mixed history, one rated 4+ three times (promote nudge). One
  // dropped note, which only shows up in search.
  const feed = note(
    'idea',
    'Agent-readable availability feed for restaurants',
    commerce ?? null,
    35,
  );
  const bottleneck = note(
    'thought',
    'Review is the new bottleneck, not writing code',
    review ?? null,
    40,
  );
  const dropped = note('idea', 'A restaurant chatbot for reservations', commerce ?? null, 50);
  dropped.status = 'dropped';
  dropped.revisitAt = null;
  const reviewed = (noteId: string, convictions: number[], firstDaysAgo: number) => {
    for (const [i, conviction] of convictions.entries()) {
      mockNoteReviews.push({
        id: crypto.randomUUID(),
        noteId,
        conviction,
        comment: null,
        reviewedAt: daysAgo(firstDaysAgo - i * 7),
      });
    }
  };
  reviewed(feed.id, [3, 4], 20);
  reviewed(bottleneck.id, [4, 4, 5], 25);
  reviewed(dropped.id, [2, 1], 30);

  // Sources in every enrichment state, and links so the evidence chips show.
  const stripe = note(
    'source',
    'Stripe agentic payments: delegated payment tokens for AI agents',
    commerce ?? null,
    4,
    'https://stripe.com/blog/agentic-commerce',
    'Chrome',
  );
  stripe.title = 'Introducing agentic commerce';
  stripe.excerpt = 'Agents can now pay on behalf of users with scoped, revocable tokens…';
  stripe.summary =
    'Stripe describes delegated payment tokens that let AI agents pay on a user’s behalf. ' +
    'Tokens are scoped to a merchant and amount and can be revoked at any time. ' +
    'The post positions this as the payment layer for agent-led shopping.';
  const failed = note(
    'source',
    'Survey: diners would let an assistant book for them',
    commerce ?? null,
    3,
    'https://example.org/survey-2026',
    'Safari',
  );
  failed.enrichment = 'failed';
  const confidentialSource = note(
    'source',
    'Board deck, Q3 numbers',
    board ?? null,
    1,
    'https://docs.internal/board-q3',
  );
  confidentialSource.enrichment = 'skipped';
  const liability = note(
    'thought',
    'Who is liable when an agent books the wrong table?',
    commerce ?? null,
    7,
  );
  const link = (from: Note, to: Note, relation: NoteRelation) =>
    mockNoteLinks.push({
      id: crypto.randomUUID(),
      fromNoteId: from.id,
      toNoteId: to.id,
      relation,
      createdAt: daysAgo(2),
    });
  link(stripe, feed, 'supports');
  link(failed, feed, 'supports');
  link(liability, feed, 'contradicts');
  mockEgressEvent('pageFetch', 'stripe.com', 0);
  mockEgressEvent('aiSummary', 'api.openai.com', 2140);
  mockEgressEvent('aiImprove', 'api.openai.com', 182);
  return [
    feed,
    conflicted,
    dropped,
    liability,
    stripe,
    failed,
    confidentialSource,
    bottleneck,
    note('idea', 'Spin the vertical into its own company', board ?? null, 9),
    note('thought', 'Keep a pain log for two weeks', null, 2),
  ];
}

const mockNotes: Note[] = seedMockNotes();

export const ideaHandlers: MockHandlers = {
  list_topics: async () => {
    return [...mockTopics];
  },
  create_topic: async (args) => {
    const input = args?.topic as NewTopic;
    const name = input.name.trim();
    if (!name) throw new Error('topic name cannot be empty');
    if (mockTopics.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      throw new Error('a topic with this name already exists');
    }
    const now = new Date().toISOString();
    const topic: Topic = {
      id: crypto.randomUUID(),
      name,
      question: input.question?.trim() || null,
      status: 'exploring',
      sensitivity: input.sensitivity,
      createdAt: now,
      updatedAt: now,
    };
    mockTopics.push(topic);
    return topic;
  },
  update_topic: async (args) => {
    const topic = mockTopics.find((t) => t.id === args?.id);
    if (!topic) throw new Error('topic not found');
    if (typeof args?.name === 'string') {
      const name = args.name.trim();
      if (!name) throw new Error('topic name cannot be empty');
      if (
        mockTopics.some((t) => t.name.toLowerCase() === name.toLowerCase() && t.id !== topic.id)
      ) {
        throw new Error('a topic with this name already exists');
      }
      topic.name = name;
    }
    if (typeof args?.question === 'string') topic.question = args.question.trim() || null;
    const status = args?.status;
    if (
      status === 'exploring' ||
      status === 'pursuing' ||
      status === 'parked' ||
      status === 'dropped'
    ) {
      topic.status = status;
    }
    const sensitivity = args?.sensitivity;
    if (
      sensitivity === 'personal' ||
      sensitivity === 'internal' ||
      sensitivity === 'confidential'
    ) {
      topic.sensitivity = sensitivity;
    }
    topic.updatedAt = new Date().toISOString();
    return topic;
  },
  delete_topic: async (args) => {
    const idx = mockTopics.findIndex((t) => t.id === args?.id);
    if (idx >= 0) mockTopics.splice(idx, 1);
    for (let i = mockNotes.length - 1; i >= 0; i -= 1) {
      const note = mockNotes[i];
      if (!note || note.topicId !== args?.id) continue;
      if (args?.deleteNotes === true) mockNotes.splice(i, 1);
      else note.topicId = null;
    }
    if (mockActiveTopic === args?.id) mockActiveTopic = null;
    return undefined;
  },
  get_active_topic: async () => {
    return mockActiveTopic;
  },
  set_active_topic: async (args) => {
    mockActiveTopic = typeof args?.topicId === 'string' ? args.topicId : null;
    return undefined;
  },
  list_notes: async () => {
    return mockNotes.map(mockWithReviews);
  },
  list_due_notes: async () => {
    const now = Date.now();
    return mockNotes
      .filter(
        (n) =>
          n.status !== 'dropped' &&
          n.noteType !== 'source' &&
          n.revisitAt !== null &&
          Date.parse(n.revisitAt) <= now,
      )
      .sort((a, b) => Date.parse(a.revisitAt ?? '') - Date.parse(b.revisitAt ?? ''))
      .map(mockWithReviews);
  },
  retry_enrichment: async (args) => {
    const note = mockNotes.find((n) => n.id === args?.id);
    if (!note) throw new Error('note not found');
    if (note.noteType !== 'source' || !note.link) {
      throw new Error('only a source with a link can be fetched');
    }
    // No network in the browser: pretend the fetch worked after a moment.
    note.enrichment = 'pending';
    setTimeout(() => {
      note.enrichment = 'done';
      note.title = note.title ?? 'Fetched page title';
    }, 1500);
    return mockWithReviews(note);
  },
  list_note_links: async (args) => {
    return mockNoteLinks.filter(
      (l) => l.fromNoteId === args?.noteId || l.toNoteId === args?.noteId,
    );
  },
  link_notes: async (args) => {
    const from = String(args?.fromNoteId ?? '');
    const to = String(args?.toNoteId ?? '');
    if (from === to) throw new Error("a note can't be linked to itself");
    const exists = mockNoteLinks.some(
      (l) =>
        (l.fromNoteId === from && l.toNoteId === to) ||
        (l.fromNoteId === to && l.toNoteId === from),
    );
    if (exists) throw new Error('these notes are already linked');
    const relation = args?.relation;
    const created: NoteLink = {
      id: crypto.randomUUID(),
      fromNoteId: from,
      toNoteId: to,
      relation: relation === 'supports' || relation === 'contradicts' ? relation : 'related',
      createdAt: new Date().toISOString(),
    };
    mockNoteLinks.push(created);
    return created;
  },
  unlink_notes: async (args) => {
    const idx = mockNoteLinks.findIndex((l) => l.id === args?.id);
    if (idx >= 0) mockNoteLinks.splice(idx, 1);
    return undefined;
  },
  list_egress_events: async () => {
    return [...mockEgress];
  },
  list_note_reviews: async (args) => {
    return mockNoteReviews.filter((r) => r.noteId === args?.noteId);
  },
  review_note: async (args) => {
    const note = mockNotes.find((n) => n.id === args?.noteId);
    if (!note) throw new Error('note not found');
    const conviction = Number(args?.conviction);
    if (!(conviction >= 1 && conviction <= 5)) {
      throw new Error('conviction must be between 1 and 5');
    }
    const now = Date.now();
    const comment = typeof args?.comment === 'string' ? args.comment.trim() : '';
    mockNoteReviews.push({
      id: crypto.randomUUID(),
      noteId: note.id,
      conviction,
      comment: comment || null,
      reviewedAt: new Date(now).toISOString(),
    });
    const next = mockNextRevisit(conviction, now);
    let task: Task | null = null;
    if (args?.decision === 'drop') {
      note.status = 'dropped';
      note.revisitAt = null;
    } else if (args?.decision === 'promote') {
      note.status = 'promoted';
      note.revisitAt = next;
      task = saveMockTask({
        text: `Validate: ${note.text.split('\n')[0]}`,
        rawText: note.text,
        improved: false,
        link: note.link,
        taskGroupId: null,
        source: {
          appId: 'app.blink.ideas',
          appName: 'Ideas',
          windowTitle: '',
          capturedAt: new Date(now).toISOString(),
        },
        originNoteId: note.id,
      });
    } else {
      if (note.status === 'dropped') note.status = 'open';
      note.revisitAt = next;
    }
    note.updatedAt = new Date(now).toISOString();
    return { note: mockWithReviews(note), task };
  },
  search_notes: async (args) => {
    // Mirrors the FTS query: every word must prefix-match a word of the text, raw text,
    // or link.
    const words = String(args?.query ?? '')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
    if (words.length === 0) return [];
    return mockNotes
      .filter((n) => {
        const haystack = `${n.text} ${n.rawText} ${n.link ?? ''}`
          .toLowerCase()
          .split(/[^\p{L}\p{N}]+/u);
        return words.every((w) => haystack.some((h) => h.startsWith(w)));
      })
      .map(mockWithReviews);
  },
  save_note: async (args) => {
    const input = args?.note as NewNote;
    const now = new Date().toISOString();
    const note: Note = {
      id: crypto.randomUUID(),
      noteType: input.noteType,
      text: input.text,
      rawText: input.rawText.trim() ? input.rawText : input.text,
      link: input.link,
      topicId: input.topicId,
      improved: input.improved,
      conflict: false,
      status: 'open',
      revisitAt: mockFirstRevisit(input.noteType, Date.now()),
      convictionHistory: [],
      reviewNudge: null,
      title: null,
      excerpt: null,
      summary: null,
      enrichment: input.noteType === 'source' && input.link ? 'pending' : 'none',
      evidence: { supports: 0, contradicts: 0, related: 0 },
      source: input.source,
      createdAt: now,
      updatedAt: now,
    };
    mockNotes.unshift(note);
    return note;
  },
  update_note: async (args) => {
    const note = mockNotes.find((n) => n.id === args?.id);
    if (!note) throw new Error('note not found');
    if (typeof args?.text === 'string' && args.text !== note.text) {
      mockNoteRevisions.unshift({
        id: crypto.randomUUID(),
        noteId: note.id,
        text: note.text,
        reason: 'edit',
        createdAt: new Date().toISOString(),
      });
      note.text = args.text;
    }
    const noteType = args?.noteType;
    if (noteType === 'idea' || noteType === 'thought' || noteType === 'source') {
      note.noteType = noteType;
      if (note.revisitAt === null && note.status === 'open') {
        note.revisitAt = mockFirstRevisit(noteType, Date.now());
      }
    }
    if (typeof args?.link === 'string') note.link = args.link.trim() || null;
    if (typeof args?.topicId === 'string') note.topicId = args.topicId.trim() || null;
    if (typeof args?.improved === 'boolean') note.improved = args.improved;
    if (typeof args?.source === 'string') note.source = { ...note.source, appName: args.source };
    note.updatedAt = new Date().toISOString();
    return mockWithReviews(note);
  },
  delete_note: async (args) => {
    const idx = mockNotes.findIndex((n) => n.id === args?.id);
    if (idx >= 0) mockNotes.splice(idx, 1);
    return undefined;
  },
  note_history: async (args) => {
    const note = mockNotes.find((n) => n.id === args?.id);
    if (note) note.conflict = false;
    return mockNoteRevisions.filter((r) => r.noteId === args?.id);
  },
  restore_note_revision: async (args) => {
    const note = mockNotes.find((n) => n.id === args?.noteId);
    const revision = mockNoteRevisions.find((r) => r.id === args?.revisionId);
    if (!note || !revision) throw new Error('revision not found');
    return ideaHandlers.update_note?.({ id: note.id, text: revision.text });
  },
  improve_note_text: async (args) => {
    const topic = mockTopics.find((t) => t.id === args?.topicId);
    if (topic?.sensitivity === 'confidential') {
      throw new Error('AI is disabled for confidential topics');
    }
    mockEgressEvent('aiImprove', 'api.openai.com', String(args?.text ?? '').length);
    return String(args?.text ?? '');
  },
  export_notes: async (args) => {
    // No native save dialog in the browser: download the file instead. Same selection
    // rule as the core: one topic explicitly, or everything minus confidential topics.
    const topicId = typeof args?.topicId === 'string' ? args.topicId : null;
    const topics = topicId
      ? mockTopics.filter((t) => t.id === topicId)
      : mockTopics.filter((t) => t.sensitivity !== 'confidential');
    const json = args?.format === 'json';
    const content = json
      ? JSON.stringify(
          topics.map((topic) => ({
            topic,
            notes: mockNotes.filter((n) => n.topicId === topic.id),
          })),
          null,
          2,
        )
      : topics
          .map(
            (topic) =>
              `## ${topic.name}\n\n${mockNotes
                .filter((n) => n.topicId === topic.id)
                .map((n) => `- ${n.text}`)
                .join('\n')}`,
          )
          .join('\n\n');
    const fileName = `blink-ideas-mock.${json ? 'json' : 'md'}`;
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    return fileName;
  },
  delete_remote_branch: async () => {
    // No real git in the browser — nothing to delete.
    return undefined;
  },
};
