import { randomUUID } from 'node:crypto';
import {
  type CaptureInput,
  type NoteBody,
  type NoteType,
  type TaskBody,
  type TaskEffort,
  zTaskEffort,
} from '@blink/contract/wire';
import { z } from 'zod';
import { type OpenAiClient, opaqueUserId } from '@/clients/openaiClient.js';
import type { RecordsModelService } from '@/services/model/recordsModelService.js';
import { logger } from '@/setup/logger.js';
import {
  type CaptureKind,
  firstRevisit,
  literalLink,
  matchByName,
  mentionedTopic,
  spokenCommand,
  type TopicRef,
} from '@/utils/functions/captureRules.js';

interface CaptureServiceDeps {
  recordsModelService: RecordsModelService;
  openAiClient: OpenAiClient;
}

/** Identifies rows this server wrote — both as the HLC tiebreaker and as the capture
 * source shown in the inbox. Every device has its own node id; so does the server. */
const SERVER_NODE_ID = 'server-capture';
const CAPTURE_APP_ID = 'app.blink.remote';

/** Matches the desktop's `ai_service.rs`, so a capture parsed here reads like one
 * cleaned up with ⌘I in the app. */
const MODEL = 'gpt-4o-mini';
/** The reply is five short fields; anything beyond this is the model going off-script,
 * and capping it bounds the per-capture cost. */
const MAX_COMPLETION_TOKENS = 300;
/** A note is capped at 10k chars by the contract, but the group and topic lists are
 * unbounded — a user with hundreds of them shouldn't silently inflate every prompt. */
const MAX_NAMES_IN_PROMPT = 100;

const SYSTEM_PROMPT = `You extract fields from a dictated capture. The capture is already known to
be a task or a note (an idea, thought, or source); you are told which.

Extract only what the capture actually says. Never infer a field from the subject matter, and
never guess. An empty field is correct; a plausible-looking guess is not.

text: for a task, a short imperative line; for a note, the idea, thought, or source in the
speaker's words, cleaned up. No preamble. Remove the spoken filing instructions ("add this to my
work group", "for the agentic commerce topic", "a quick one") since those belong in the other
fields. Keep every concrete detail that was actually said (names, amounts, dates). Invent
nothing. This is the one field you may rewrite.

effort (tasks only): only when the capture states how much work it is. "quick", "won't take
long", "two minutes" → "quick". "big job", "deep work" → "deep". "normal" or similar →
"standard". Otherwise null — do NOT judge it from the task itself. For notes, always null.

group (tasks only): only when the capture names one of the groups listed below, or refers to one
unmistakably ("put it in errands"). Topic similarity is NOT enough. Never use a name that isn't
in the list. Otherwise null. For notes, always null.

topic (notes only): only when the capture names one of the topics listed below. Same rules as
group. For tasks, always null.

link: a URL only if one literally appears in the capture. Otherwise null.

When in doubt, return null.`;

/** OpenAI Structured Outputs in `strict` mode: every key required, nothing extra, and
 * "unknown" expressed as an explicit null rather than an absent field. The kind is not
 * asked for: the spoken "Create …" command already decided it. */
const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'effort', 'group', 'topic', 'link'],
  properties: {
    text: { type: 'string' },
    effort: { type: ['string', 'null'], enum: ['quick', 'standard', 'deep', null] },
    group: { type: ['string', 'null'] },
    topic: { type: ['string', 'null'] },
    link: { type: ['string', 'null'] },
  },
};

/** The model's reply, validated rather than trusted — `strict` constrains it, but this
 * is still untrusted JSON crossing into a row we persist. */
const zParsedCapture = z.object({
  text: z.string(),
  effort: zTaskEffort.nullable(),
  group: z.string().nullable(),
  topic: z.string().nullable(),
  link: z.string().nullable(),
});
type ParsedCapture = z.infer<typeof zParsedCapture>;

interface NoteFields {
  noteType: NoteType;
  text: string;
  link: string | null;
  topicId: string | null;
  improved: boolean;
}

/**
 * Remote capture: an outside agent (an iOS Shortcut, a script) files a task or a note and
 * it reaches the desktop on the next pull. Only possible because the sync store is
 * readable — synthesizing a row, and resolving a spoken group or topic name against the
 * user's actual ones, is exactly what a zero-knowledge server could not do.
 *
 * The capture opens with a spoken command — "Create task …", "Create idea …", "Create
 * thought …", "Create source …" — which decides the kind deterministically. Without one it
 * is filed as a task, so a misheard command never loses a dictation.
 *
 * Confidential topics: a capture that mentions one by name is never sent to the model. It
 * is filed verbatim (a note into that topic), and confidential topics are never offered to
 * the model as filing targets.
 */
export class CaptureService {
  private deps: CaptureServiceDeps;

  constructor(deps: CaptureServiceDeps) {
    this.deps = deps;
  }

  /** Write a task or note straight into the owner's replica. The desktop picks it up on
   * its next pull and merges it like any other record — there is no special client path. */
  async capture(userId: string, input: CaptureInput): Promise<{ id: string }> {
    const [groups, topics] = await Promise.all([this.listGroups(userId), this.listTopics(userId)]);
    const { kind, rest } = spokenCommand(input.text) ?? { kind: 'task', rest: input.text };

    const confidential = mentionedTopic(
      rest,
      topics.filter((t) => t.sensitivity === 'confidential'),
    );
    if (confidential) {
      return kind === 'task'
        ? this.fileTask(userId, input, rest, null, groups)
        : this.fileNote(userId, input, {
            noteType: kind,
            text: rest,
            link: literalLink(rest),
            topicId: confidential.id,
            improved: false,
          });
    }

    const openTopics = topics.filter((t) => t.sensitivity !== 'confidential');
    const parsed = await this.parse(userId, kind, rest, groups, openTopics);
    if (kind === 'task') return this.fileTask(userId, input, rest, parsed, groups);
    return this.fileNote(userId, input, {
      noteType: kind,
      text: parsed?.text.trim() || rest,
      link: parsed ? parsed.link : literalLink(rest),
      topicId: matchByName(parsed?.topic ?? null, openTopics)?.id ?? null,
      improved: parsed !== null,
    });
  }

  /** `content` is the capture without its "Create task" command; `input.text` stays the
   * frozen raw text. */
  private async fileTask(
    userId: string,
    input: CaptureInput,
    content: string,
    parsed: ParsedCapture | null,
    groups: { id: string; name: string }[],
  ): Promise<{ id: string }> {
    // Whatever the model couldn't work out stays empty rather than being guessed at.
    const text = parsed?.text.trim() || content;
    const effort: TaskEffort = parsed?.effort ?? 'standard';
    const link = parsed ? parsed.link : literalLink(content);
    const taskGroupId = matchByName(parsed?.group ?? null, groups)?.id ?? null;

    const now = new Date().toISOString();
    const body: TaskBody = {
      kind: 'task',
      text,
      // The note as spoken, frozen — the desktop treats raw_text as the pre-edit
      // capture, so keep it even when the model rewrote the text.
      raw_text: input.text,
      status: 'inbox',
      effort,
      app_id: CAPTURE_APP_ID,
      app_name: input.via,
      window_title: 'remote capture',
      captured_at: now,
      created_at: now,
      updated_at: now,
      // The model cleaned the phrasing, so don't offer ⌘I on it again.
      improved: parsed !== null,
      link,
      completed_at: null,
      task_group_id: taskGroupId,
      // Local positions are small `MAX(position) + 1` integers and the inbox sorts
      // descending, so a unix-seconds value reliably lands a remote capture on top —
      // and stays monotonic for the local captures that follow it.
      position: Math.floor(Date.now() / 1000),
      deleted: false,
    };
    return this.write(userId, body);
  }

  private async fileNote(
    userId: string,
    input: CaptureInput,
    fields: NoteFields,
  ): Promise<{ id: string }> {
    const now = new Date();
    const iso = now.toISOString();
    const body: NoteBody = {
      kind: 'note',
      note_type: fields.noteType,
      text: fields.text,
      raw_text: input.text,
      link: fields.link,
      topic_id: fields.topicId,
      improved: fields.improved,
      app_id: CAPTURE_APP_ID,
      app_name: input.via,
      window_title: 'remote capture',
      captured_at: iso,
      created_at: iso,
      updated_at: iso,
      deleted: false,
      status: 'open',
      revisit_at: firstRevisit(fields.noteType, now),
      title: null,
      excerpt: null,
      summary: null,
      // The desktop fetches the page: it queues a pulled source that is still pending.
      enrichment: fields.noteType === 'source' && fields.link ? 'pending' : 'none',
    };
    return this.write(userId, body);
  }

  private async write(userId: string, body: TaskBody | NoteBody): Promise<{ id: string }> {
    const id = randomUUID();
    await this.deps.recordsModelService.upsertMany(userId, [
      {
        id,
        ownerId: userId,
        body,
        hlcPhysical: Date.now(),
        hlcCounter: 0,
        hlcNodeId: SERVER_NODE_ID,
      },
    ]);
    return { id };
  }

  /** The owner's live groups, read off the `kind` generated column. */
  private async listGroups(userId: string): Promise<{ id: string; name: string }[]> {
    const rows = await this.deps.recordsModelService.listByKind(userId, 'group');
    return rows.flatMap((row) => {
      // `body` is loose by design, so these come through as `unknown` — narrow, don't cast.
      const { name, deleted } = row.body;
      if (deleted === true || typeof name !== 'string') return [];
      return [{ id: row.id, name }];
    });
  }

  /** The owner's live topics with their sensitivity. A topic whose sensitivity can't be
   * read counts as confidential: unknown privacy fails closed. */
  private async listTopics(userId: string): Promise<TopicRef[]> {
    const rows = await this.deps.recordsModelService.listByKind(userId, 'topic');
    return rows.flatMap((row) => {
      const { name, deleted, sensitivity } = row.body;
      if (deleted === true || typeof name !== 'string') return [];
      const known = sensitivity === 'personal' || sensitivity === 'internal';
      return [{ id: row.id, name, sensitivity: known ? sensitivity : 'confidential' }];
    });
  }

  /** Ask the model for the fields. Returns null when it can't be had — a bad key, a
   * timeout, a refusal, unparseable content — because a capture must never be lost to the
   * model being unavailable. The caller then files the raw text as-is. */
  private async parse(
    userId: string,
    kind: CaptureKind,
    text: string,
    groups: { name: string }[],
    topics: { name: string }[],
  ): Promise<ParsedCapture | null> {
    try {
      const names = (items: { name: string }[]) =>
        items.length
          ? items
              .slice(0, MAX_NAMES_IN_PROMPT)
              .map((item) => item.name)
              .join(', ')
          : '(none — always return null)';

      const content = await this.deps.openAiClient.chatCompletion({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Kind: ${kind === 'task' ? 'task' : `note (${kind})`}\nAvailable groups: ${names(groups)}\nAvailable topics: ${names(topics)}\n\nCapture: ${text}`,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'capture', strict: true, schema: RESPONSE_SCHEMA },
        },
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        // Parsing, not writing: the same note should always yield the same fields.
        temperature: 0,
        store: false,
        user: opaqueUserId(userId),
      });
      if (!content) return null;

      const parsed = zParsedCapture.safeParse(JSON.parse(content));
      if (!parsed.success || !parsed.data.text.trim()) return null;
      return parsed.data;
    } catch (err) {
      // Expected in normal operation (outage, rate limit, breaker open) — the capture
      // still succeeds with the raw note, so this is a warning, not an error.
      logger.warn(
        {
          err,
          noteLength: text.length,
          groupCount: groups.length,
          topicCount: topics.length,
        },
        'capture: could not parse the note, filing it verbatim',
      );
      return null;
    }
  }
}
