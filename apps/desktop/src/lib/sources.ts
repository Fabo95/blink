import {
  BetterStackIcon,
  GithubIcon,
  type IconComponent,
  LinearIcon,
  SlackIcon,
} from '@/components/ui/brand-icons';
import type { IncomingSource } from '@/generated/IncomingSource';

/**
 * One place per Incoming source for how the UI shows it (Incoming rows, Settings →
 * Connections): its icon and name, and — for sources whose key Blink keeps — what the key
 * looks like and where to get it. Adding a source = one entry here.
 */
export const SOURCES: Record<
  IncomingSource,
  { icon: IconComponent; name: string; keyPlaceholder?: string; keyHelp?: string }
> = {
  github: { icon: GithubIcon, name: 'GitHub' },
  slack: {
    icon: SlackIcon,
    name: 'Slack',
    keyPlaceholder: 'xoxp-…',
    keyHelp:
      'Your Blink Slack app → OAuth & Permissions → User OAuth Token (scopes search:read, users:read, im:read, mpim:read, channels:read, groups:read).',
  },
  linear: {
    icon: LinearIcon,
    name: 'Linear',
    keyPlaceholder: 'lin_api_…',
    keyHelp: 'Linear → Settings → Security & access → Personal API keys, read-only.',
  },
  betterStack: {
    icon: BetterStackIcon,
    name: 'Better Stack',
    keyPlaceholder: 'Uptime API token',
    keyHelp: 'Better Stack → Uptime → API tokens (team token). Open incidents become urgent items.',
  },
};
