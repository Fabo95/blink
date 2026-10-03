/** Browser mock: tasks, task groups, copy capture, and the task AI actions. */

import type { CaptureDraft } from '@/generated/CaptureDraft';
import type { CaptureSource } from '@/generated/CaptureSource';
import type { NewTask } from '@/generated/NewTask';
import type { NewTaskGroup } from '@/generated/NewTaskGroup';
import type { Task } from '@/generated/Task';
import type { TaskEffort } from '@/generated/TaskEffort';
import type { TaskGroup } from '@/generated/TaskGroup';
import type { MockHandlers } from './types';

// Seed the browser mock (no Tauri host) with a spread of tasks so the inbox,
// last-24h Completed card, and day-grouped Archive are all visible in `pnpm desktop`.
function seedMockTaskGroups(): TaskGroup[] {
  const now = new Date().toISOString();
  const group = (name: string): TaskGroup => ({
    id: crypto.randomUUID(),
    name,
    context: null,
    createdAt: now,
    updatedAt: now,
  });
  return [group('Work'), group('Sport')];
}

const mockTaskGroups: TaskGroup[] = seedMockTaskGroups();
let mockActiveTaskGroup: string | null = null;

function seedMockStore(): Task[] {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
  const source = (appName: string, windowTitle: string): CaptureSource => ({
    appId: appName.toLowerCase(),
    appName,
    windowTitle,
    capturedAt: hoursAgo(200),
  });
  const done = (
    text: string,
    completedHoursAgo: number,
    src: CaptureSource,
    link: string | null = null,
    rawText: string = text,
  ): Task => ({
    id: crypto.randomUUID(),
    text,
    rawText,
    status: 'done',
    effort: 'standard',
    improved: false,
    link,
    taskGroupId: null,
    source: src,
    createdAt: hoursAgo(completedHoursAgo + 4),
    updatedAt: hoursAgo(completedHoursAgo),
    completedAt: hoursAgo(completedHoursAgo),
    originNoteId: null,
  });
  const active = (
    text: string,
    src: CaptureSource,
    link: string | null = null,
    taskGroupId: string | null = null,
    rawText: string = text,
    effort: TaskEffort = 'standard',
  ): Task => ({
    id: crypto.randomUUID(),
    text,
    rawText,
    status: 'inbox',
    effort,
    improved: false,
    link,
    taskGroupId,
    source: src,
    createdAt: hoursAgo(2),
    updatedAt: hoursAgo(2),
    completedAt: null,
    originNoteId: null,
  });

  const slack = source('Slack', '#engineering');
  const chrome = source('Chrome', 'Linear — BLK-142');
  const notion = source('Notion', 'Roadmap Q3');
  const mail = source('Mail', 'Re: contract review');
  const work = mockTaskGroups[0]?.id ?? null;
  const sport = mockTaskGroups[1]?.id ?? null;

  return [
    // Inbox (active)
    active(
      'Draft the sync-server auth middleware',
      chrome,
      'https://linear.app/blink/issue/BLK-142',
      work,
      'need auth middleware on the sync server — verify the bearer token from the ' +
        'set-auth-token header, reject unauthenticated requests, and set app.current_user_id ' +
        'so RLS scopes the query. blocked on BLK-142',
    ),
    active('Reply to the security questionnaire', mail),
    active('Book the Tuesday climbing slot', notion, null, sport, undefined, 'quick'),
    active('Approve the Figma invite', slack, null, work, undefined, 'quick'),
    active('Confirm the offsite date with Lena', mail, null, work, undefined, 'quick'),
    // Completed in the last 24h → Completed card
    done('Ship the archive view', 3, chrome),
    done('Review DLP ruleset PR', 10, slack, 'https://github.com/blink/desktop/pull/88'),
    // Older → Archive, grouped by day (>8 so pagination shows)
    done('Fix aurora animation jank', 30, notion),
    done('Wire up manual-capture window', 34, slack),
    done('Add completed_at migration', 52, chrome),
    done('Redesign the task-row actions', 58, slack),
    done('Rename copy-capture everywhere', 76, notion),
    done('Extract the useListCursor hook', 80, chrome),
    done('Add optional link to tasks', 100, mail, 'https://linear.app/blink/issue/BLK-88'),
    done('Set up SQLCipher keychain key', 122, slack),
    done('Expand the DLP ruleset', 146, notion),
    done('Wire the global-shortcut plugin', 170, chrome),
    done('Sketch the dark-violet theme', 200, notion),
    done('Draft the zero-knowledge sync spec', 210, mail),
    done('Bootstrap the Tauri v2 shell', 220, chrome, 'https://tauri.app'),
  ];
}

const mockStore: Task[] = seedMockStore();

/** Also used by the ideas mock: promoting a note saves a task like a capture does. */
export function saveMockTask(input: NewTask): Task {
  const now = new Date().toISOString();
  const task: Task = {
    id: crypto.randomUUID(),
    text: input.text,
    rawText: input.rawText.trim() ? input.rawText : input.text,
    status: 'inbox',
    effort: 'standard',
    improved: input.improved,
    link: input.link,
    taskGroupId: input.taskGroupId,
    source: input.source,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    originNoteId: input.originNoteId ?? null,
  };
  mockStore.unshift(task);
  return task;
}

export const taskHandlers: MockHandlers = {
  read_copy_capture: async () => {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      text = ''; // no permission / empty clipboard in the browser
    }
    const draft: CaptureDraft = {
      text,
      source: {
        appId: 'clipboard',
        appName: 'Clipboard',
        windowTitle: 'Copied text',
        capturedAt: new Date().toISOString(),
      },
      link: null,
    };
    return draft;
  },
  list_tasks: async () => {
    return [...mockStore];
  },
  save_task: async (args) => saveMockTask(args?.task as NewTask),
  delete_task: async (args) => {
    const idx = mockStore.findIndex((t) => t.id === args?.id);
    if (idx >= 0) mockStore.splice(idx, 1);
    return undefined;
  },
  reorder_task: async (args) => {
    const first = mockStore.find((t) => t.id === args?.first);
    const second = mockStore.find((t) => t.id === args?.second);
    if (first && second) {
      const a = mockStore.indexOf(first);
      const b = mockStore.indexOf(second);
      mockStore[a] = second;
      mockStore[b] = first;
    }
    return undefined;
  },
  update_task: async (args) => {
    const task = mockStore.find((t) => t.id === args?.id);
    if (!task) throw new Error('task not found');
    const nextText = args?.text;
    const nextCompleted = args?.completed;
    const nextLink = args?.link;
    const nextSource = args?.source;
    const nextImproved = args?.improved;
    if (typeof nextText === 'string') {
      task.text = nextText;
    }
    if (typeof nextImproved === 'boolean') {
      task.improved = nextImproved;
    }
    if (typeof nextCompleted === 'boolean') {
      task.status = nextCompleted ? 'done' : 'inbox';
      task.completedAt = nextCompleted ? new Date().toISOString() : null;
    }
    if (typeof nextLink === 'string') {
      task.link = nextLink.trim() ? nextLink.trim() : null;
    }
    if (typeof nextSource === 'string') {
      task.source = { ...task.source, appName: nextSource };
    }
    const nextTaskGroupId = args?.taskGroupId;
    if (typeof nextTaskGroupId === 'string') {
      task.taskGroupId = nextTaskGroupId.trim() ? nextTaskGroupId.trim() : null;
    }
    const nextEffort = args?.effort;
    if (nextEffort === 'quick' || nextEffort === 'standard' || nextEffort === 'deep') {
      task.effort = nextEffort;
    }
    task.updatedAt = new Date().toISOString();
    return task;
  },
  list_task_groups: async () => {
    return [...mockTaskGroups];
  },
  create_task_group: async (args) => {
    const input = args?.group as NewTaskGroup;
    const name = input.name.trim();
    if (!name) throw new Error('group name cannot be empty');
    if (mockTaskGroups.some((g) => g.name === name)) {
      throw new Error('a group with this name already exists');
    }
    const context = input.context?.trim();
    const now = new Date().toISOString();
    const group: TaskGroup = {
      id: crypto.randomUUID(),
      name,
      context: context ? context : null,
      createdAt: now,
      updatedAt: now,
    };
    mockTaskGroups.push(group);
    return group;
  },
  update_task_group: async (args) => {
    const group = mockTaskGroups.find((g) => g.id === args?.id);
    if (!group) throw new Error('task group not found');
    if (typeof args?.name === 'string') {
      const name = args.name.trim();
      if (!name) throw new Error('group name cannot be empty');
      if (mockTaskGroups.some((g) => g.name === name && g.id !== group.id)) {
        throw new Error('a group with this name already exists');
      }
      group.name = name;
    }
    if (typeof args?.context === 'string') {
      const context = args.context.trim();
      group.context = context ? context : null;
    }
    group.updatedAt = new Date().toISOString();
    return group;
  },
  delete_task_group: async (args) => {
    const idx = mockTaskGroups.findIndex((g) => g.id === args?.id);
    if (idx >= 0) mockTaskGroups.splice(idx, 1);
    for (const task of mockStore) {
      if (task.taskGroupId === args?.id) task.taskGroupId = null;
    }
    if (mockActiveTaskGroup === args?.id) mockActiveTaskGroup = null;
    return undefined;
  },
  get_active_task_group: async () => {
    return mockActiveTaskGroup;
  },
  set_active_task_group: async (args) => {
    mockActiveTaskGroup = typeof args?.taskGroupId === 'string' ? args.taskGroupId : null;
    return undefined;
  },
  dismiss_copy_capture: async () => {
    return undefined;
  },
  dismiss_manual_capture: async () => {
    return undefined;
  },
  dismiss_idea_capture: async () => {
    return undefined;
  },
  improve_text: async (args) => {
    // Browser mock can't reach OpenAI — echo the input back.
    return String(args?.text ?? '');
  },
  generate_task_prompt: async (args) => {
    // No OpenAI in the browser — build a deterministic prompt from the task's fields,
    // same honesty level as the improve_text echo above.
    const task = mockStore.find((t) => t.id === args?.id);
    if (!task) throw new Error('task not found');
    const parts = [
      `Help me complete this task: ${task.text}`,
      `\nOriginal captured text:\n${task.rawText}`,
    ];
    const source = task.source.appName || task.source.appId;
    if (source) parts.push(`\nCaptured from: ${source}`);
    if (task.link) parts.push(`Link: ${task.link}`);
    const groupContext = task.taskGroupId
      ? mockTaskGroups.find((g) => g.id === task.taskGroupId)?.context
      : null;
    if (groupContext) parts.push(`\nGroup context:\n${groupContext}`);
    const prompt = parts.join('\n');
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      // No clipboard permission in the browser — the returned prompt still drives the UI.
    }
    return prompt;
  },
  open_link: async (args) => {
    window.open(String(args?.url ?? ''), '_blank', 'noopener');
    return undefined;
  },
};
