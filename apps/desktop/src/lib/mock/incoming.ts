/** Browser mock: the Incoming feed (no real sources — a few representative items). */

import type { IncomingFeed } from '@/generated/IncomingFeed';
import type { IncomingItem } from '@/generated/IncomingItem';
import type { SourceConnection } from '@/generated/SourceConnection';
import { taskHandlers } from './tasks';
import type { MockHandlers } from './types';

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

let mockItems: IncomingItem[] = [
  {
    id: 'github:1',
    source: 'github',
    reason: 'review requested',
    title: 'Add lifetime purchase confirm endpoint',
    context: 'acme/app',
    url: 'https://github.com/acme/app/pull/1912',
    updatedAt: ago(20),
    urgent: false,
  },
  {
    id: 'github:2',
    source: 'github',
    reason: 'mentioned',
    title: 'Braze catalog sync fails with 500',
    context: 'acme/app',
    url: 'https://github.com/acme/app/issues/88',
    updatedAt: ago(140),
    urgent: false,
  },
  {
    id: 'betterStack:3',
    source: 'betterStack',
    reason: 'incident',
    title: 'user-api: /v3/users/me returning 500s',
    context: 'Production',
    url: 'https://uptime.betterstack.com',
    updatedAt: ago(5),
    urgent: true,
  },
];

let mockLinearKey: string | null = null;
let mockSlackToken: string | null = null;

const connections = (): SourceConnection[] => [
  {
    source: 'github',
    auth: 'ghCli',
    connected: true,
    account: {
      name: 'Ada Lovelace',
      handle: '@ada',
      organization: 'Acme',
      avatarUrl: null,
    },
    credentialHint: 'gh CLI · github.com',
    problem: null,
  },
  mockLinearKey
    ? {
        source: 'linear',
        auth: 'apiKey',
        connected: true,
        account: {
          name: 'Ada Lovelace',
          handle: 'ada@acme.dev',
          organization: 'Acme',
          avatarUrl: null,
        },
        credentialHint: `${mockLinearKey.slice(0, 8)}…${mockLinearKey.slice(-4)}`,
        problem: null,
      }
    : {
        source: 'linear',
        auth: 'apiKey',
        connected: false,
        account: null,
        credentialHint: null,
        problem: 'No API key yet',
      },
  mockSlackToken
    ? {
        source: 'slack',
        auth: 'apiKey',
        connected: true,
        account: { name: 'Ada Lovelace', handle: '@ada', organization: 'Acme', avatarUrl: null },
        credentialHint: `${mockSlackToken.slice(0, 8)}…${mockSlackToken.slice(-4)}`,
        problem: null,
      }
    : {
        source: 'slack',
        auth: 'apiKey',
        connected: false,
        account: null,
        credentialHint: null,
        problem: 'No user token yet',
      },
  {
    source: 'betterStack',
    auth: 'apiKey',
    connected: false,
    account: null,
    credentialHint: null,
    problem: 'No API token yet',
  },
];

const feed = (): IncomingFeed => ({
  items: [...mockItems].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  errors: [],
});

export const incomingHandlers: MockHandlers = {
  get_incoming: async () => feed(),
  list_source_connections: async () => connections(),
  connect_source: async (args) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    const key = String(args?.key ?? '');
    if (args?.source === 'slack') {
      if (!key.startsWith('xoxp-')) throw new Error("that's not a Slack user token");
      mockSlackToken = key;
    } else {
      if (!key.startsWith('lin_api_')) throw new Error("Linear didn't accept the key");
      mockLinearKey = key;
    }
    return undefined;
  },
  disconnect_source: async (args) => {
    if (args?.source === 'slack') mockSlackToken = null;
    else mockLinearKey = null;
    return undefined;
  },
  refresh_incoming: async () => feed(),
  archive_incoming: async (args) => {
    mockItems = mockItems.filter((item) => item.id !== String(args?.id ?? ''));
    return feed();
  },
  incoming_to_task: async (args) => {
    const item = mockItems.find((i) => i.id === String(args?.id ?? ''));
    if (!item) throw new Error('no incoming item');
    mockItems = mockItems.filter((i) => i.id !== item.id);
    return taskHandlers.save_task?.({
      task: {
        text: item.title,
        rawText: item.title,
        improved: false,
        link: item.url,
        taskGroupId: null,
        source: {
          appId: item.source,
          appName: item.source,
          windowTitle: item.context,
          capturedAt: new Date().toISOString(),
        },
      },
    });
  },
};
