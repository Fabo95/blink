import { randomUUID } from 'node:crypto';
import { type CaptureInput, type TaskBody, type TaskEffort, zTaskEffort } from '@blink/contract/wire';
import { z } from 'zod';
import { type OpenAiClient, opaqueUserId } from '@/clients/openaiClient.js';
import type { RecordsModelService } from '@/services/model/recordsModelService.js';
import { logger } from '@/setup/logger.js';

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
/** The reply is four short fields; anything beyond this is the model going off-script,
 * and capping it bounds the per-capture cost. */
const MAX_COMPLETION_TOKENS = 300;
/** A note is capped at 10k chars by the contract, but the group list is unbounded — a
 * user with hundreds of groups shouldn't silently inflate every prompt. */
const MAX_GROUPS_IN_PROMPT = 100;

const SYSTEM_PROMPT = `You extract task fields from a dictated note.

Extract only what the note actually says. Never infer a field from the subject matter, and never
guess. An empty field is correct; a plausible-looking guess is not.

text: the task as a short imperative line — no preamble, no "task:" prefix, no trailing period.
Remove the spoken filing instructions ("add this to my work group", "this is a quick one") since
those belong in the other fields. Keep every concrete detail that was actually said (names,
amounts, dates). Invent nothing. This is the one field you may rewrite.

effort: only when the note states how much work it is. "quick", "won't take long", "two minutes"
→ "quick". "big job", "deep work", "will take all afternoon" → "deep". "normal" or similar →
"standard". If the note says nothing about effort, return null — do NOT judge it from the task
itself. "Buy milk" tells you nothing about effort, so it is null, not "quick".

group: only when the note names one of the groups listed below, or refers to one unmistakably
("put it in errands", "that's for work"). Topic similarity is NOT enough: a note about groceries
does not belong to a group called "Errands" unless the note actually says so. Never use a name
that isn't in the list. If the note doesn't name a group, return null.

link: a URL only if one literally appears in the note. Otherwise null.

When in doubt, return null.`;

/** OpenAI Structured Outputs in `strict` mode: every key required, nothing extra, and
 * "unknown" expressed as an explicit null rather than an absent field. */
const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'effort', 'group', 'link'],
  properties: {
    text: { type: 'string' },
    effort: { type: ['string', 'null'], enum: ['quick', 'standard', 'deep', null] },
    group: { type: ['string', 'null'] },
    link: { type: ['string', 'null'] },
  },
};

/** The model's reply, validated rather than trusted — `strict` constrains it, but this
 * is still untrusted JSON crossing into a row we persist. */
const zParsedTask = z.object({
  text: z.string(),
  effort: zTaskEffort.nullable(),
  group: z.string().nullable(),
  link: z.string().nullable(),
});
type ParsedTask = z.infer<typeof zParsedTask>;

/**
 * Remote capture: an outside agent (an iOS Shortcut, a script) files a task and it
 * reaches the desktop inbox on the next pull. Only possible because the sync store is
 * readable — synthesizing a task row, and resolving a spoken group name against the
 * user's actual groups, is exactly what a zero-knowledge server could not do.
 */
export class CaptureService {
  private deps: CaptureServiceDeps;

  constructor(deps: CaptureServiceDeps) {
    this.deps = deps;
  }

  /** Write a task straight into the owner's replica. The desktop picks it up on its
   * next pull and merges it like any other record — there is no special client path,
   * and no desktop code knows this endpoint exists. */
  async capture(userId: string, input: CaptureInput): Promise<{ id: string }> {
    const groups = await this.listGroups(userId);
    const generatedTask = await this.generateTask(userId, input.text, groups);

    // Whatever the model couldn't work out stays empty rather than being guessed at.
    const text = generatedTask?.text.trim() || input.text;
    const effort: TaskEffort = generatedTask?.effort ?? 'standard';
    const link = generatedTask?.link ?? null;
    const taskGroupId = matchGroup(generatedTask?.group ?? null, groups)?.id ?? null;

    const id = randomUUID();
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
      improved: generatedTask !== null,
      link,
      completed_at: null,
      task_group_id: taskGroupId,
      // Local positions are small `MAX(position) + 1` integers and the inbox sorts
      // descending, so a unix-seconds value reliably lands a remote capture on top —
      // and stays monotonic for the local captures that follow it.
      position: Math.floor(Date.now() / 1000),
      deleted: false,
    };

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

  /** Ask the model for the task shape. Returns null when it can't be had — a bad key,
   * a timeout, a refusal, unparseable content — because a capture must never be lost
   * to the model being unavailable. The caller then files the raw text as-is. */
  private async generateTask(
    userId: string,
    text: string,
    groups: { id: string; name: string }[],
  ): Promise<ParsedTask | null> {
    try {
      const groupList = groups.length
        ? groups
            .slice(0, MAX_GROUPS_IN_PROMPT)
            .map((g) => g.name)
            .join(', ')
        : '(none — always return null for group)';

      const content = await this.deps.openAiClient.chatCompletion({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Available groups: ${groupList}\n\nNote: ${text}` },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'task', strict: true, schema: RESPONSE_SCHEMA },
        },
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        // Parsing, not writing: the same note should always yield the same fields.
        temperature: 0,
        store: false,
        user: opaqueUserId(userId),
      });
      if (!content) return null;

      const parsed = zParsedTask.safeParse(JSON.parse(content));
      if (!parsed.success || !parsed.data.text.trim()) return null;
      return parsed.data;
    } catch (err) {
      // Expected in normal operation (outage, rate limit, breaker open) — the capture
      // still succeeds with the raw note, so this is a warning, not an error.
      logger.warn(
        { err, noteLength: text.length, groupCount: groups.length },
        'capture: could not parse the note, filing it verbatim',
      );
      return null;
    }
  }
}

/** Case-insensitive exact match, so a model that echoes "Work" for a group named
 * "work" still resolves — but a name it made up resolves to nothing. */
function matchGroup(
  name: string | null,
  groups: { id: string; name: string }[],
): { id: string; name: string } | undefined {
  if (!name) return undefined;
  const wanted = name.trim().toLowerCase();
  return groups.find((g) => g.name.toLowerCase() === wanted);
}
