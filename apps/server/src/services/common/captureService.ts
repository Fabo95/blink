import { randomUUID } from 'node:crypto';
import type { CaptureInput, TaskBody } from '@blink/contract/wire';
import type { RecordsModelService } from '@/services/model/recordsModelService.js';

interface CaptureServiceDeps {
  recordsModelService: RecordsModelService;
}

/** Identifies rows this server wrote — both as the HLC tiebreaker and as the capture
 * source shown in the inbox. Every device has its own node id; so does the server. */
const SERVER_NODE_ID = 'server-capture';
const CAPTURE_APP_ID = 'app.blink.remote';

/**
 * Remote capture: an outside agent (an iOS Shortcut, a script) files a task and it
 * reaches the desktop inbox on the next pull. Only possible because the sync store is
 * readable — synthesizing a whole task row is exactly what a zero-knowledge server
 * could not do.
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
    const id = randomUUID();
    const now = new Date().toISOString();
    const body: TaskBody = {
      kind: 'task',
      text: input.text,
      raw_text: input.text,
      status: 'inbox',
      effort: input.effort,
      app_id: CAPTURE_APP_ID,
      app_name: input.via,
      window_title: 'remote capture',
      captured_at: now,
      created_at: now,
      updated_at: now,
      // Not AI-touched, so the inbox still offers ⌘I on it.
      improved: false,
      link: input.link ?? null,
      completed_at: null,
      task_group_id: input.taskGroupId ?? null,
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
}
