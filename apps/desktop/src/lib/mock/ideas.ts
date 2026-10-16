/** Browser mock: topics, notes, history, export, and the egress log. */

import type { EgressEvent } from '@/generated/EgressEvent';
import type { NewNote } from '@/generated/NewNote';
import type { NewTopic } from '@/generated/NewTopic';
import type { Note } from '@/generated/Note';
import type { NoteRevision } from '@/generated/NoteRevision';
import type { NoteType } from '@/generated/NoteType';
import type { Sensitivity } from '@/generated/Sensitivity';
import type { Topic } from '@/generated/Topic';
import type { TopicStatus } from '@/generated/TopicStatus';
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
const mockEgress: EgressEvent[] = [];

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
  mockEgressEvent('aiImprove', 'api.openai.com', 182);
  return [
    note('idea', 'Agent-readable availability feed for restaurants', commerce ?? null, 35),
    conflicted,
    note('thought', 'Who is liable when an agent books the wrong table?', commerce ?? null, 7),
    note(
      'source',
      'Stripe agentic payments: delegated payment tokens for AI agents',
      commerce ?? null,
      4,
      'https://stripe.com/blog/agentic-commerce',
      'Chrome',
    ),
    note(
      'source',
      'Board deck, Q3 numbers',
      board ?? null,
      1,
      'https://docs.internal/board-q3',
    ),
    note('thought', 'Review is the new bottleneck, not writing code', review ?? null, 40),
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
    return mockNotes.map((n) => ({ ...n }));
  },
  list_egress_events: async () => {
    return [...mockEgress];
  },
  search_notes: async (args) => {
    // Mirrors the FTS query: every word must prefix-match a word of the text, raw text,
    // or link.
    const words = String(args?.query ?? '')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
    if (words.length === 0) return [];
    return mockNotes.filter((n) => {
      const haystack = `${n.text} ${n.rawText} ${n.link ?? ''}`
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u);
      return words.every((w) => haystack.some((h) => h.startsWith(w)));
    });
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
    }
    if (typeof args?.link === 'string') note.link = args.link.trim() || null;
    if (typeof args?.topicId === 'string') note.topicId = args.topicId.trim() || null;
    if (typeof args?.improved === 'boolean') note.improved = args.improved;
    if (typeof args?.source === 'string') note.source = { ...note.source, appName: args.source };
    note.updatedAt = new Date().toISOString();
    return { ...note };
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
