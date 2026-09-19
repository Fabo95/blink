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

const SYSTEM_PROMPT = `You turn a rough, usually dictated note into one task for a personal inbox.

Return the task text as a short imperative line: no preamble, no "task:" prefix, no trailing period.
Strip the spoken instructions about *filing* the task — "add this to my work group", "this is a quick
one", "put it in errands" — those belong in the other fields, not in the text. Keep every concrete
detail that was actually said (names, amounts, dates). Invent nothing.

effort: "quick" for under ~5 minutes, "deep" for focused work over an hour, otherwise "standard".
Use null if the note gives you nothing to judge by.

group: exactly one name from the list you are given, or null. Only pick one if the note actually
indicates it. Never invent a name that isn't in the list.

link: a URL if the note contains one, otherwise null.

If you cannot work something out, return null for it rather than guessing.`;

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
    const parsed = await this.parse(userId, input.text, groups);

    // Whatever the model couldn't work out stays empty rather than being guessed at.
    const text = parsed?.text.trim() || input.text;
    const effort: TaskEffort = parsed?.effort ?? 'standard';
    const link = parsed?.link ?? null;
    const taskGroupId = matchGroup(parsed?.group ?? null, groups)?.id ?? null;

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
  private async parse(
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
