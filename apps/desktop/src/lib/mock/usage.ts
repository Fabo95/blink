/** Browser mock: a Claude Code usage report (no transcripts in the browser). */

import type { UsageRange } from '@/generated/UsageRange';
import type { UsageReport } from '@/generated/UsageReport';
import type { UsageTotals } from '@/generated/UsageTotals';
import type { MockHandlers } from './types';

const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

const SCALE: Record<UsageRange, number> = { today: 1, week: 6, month: 22, all: 30 };

const totals = (scale: number, cost: number): UsageTotals => ({
  inputTokens: 1_200 * scale,
  outputTokens: 310_000 * scale,
  thinkingTokens: 42_000 * scale,
  cacheWriteTokens: 2_100_000 * scale,
  cacheReadTokens: 38_000_000 * scale,
  cacheHitRate: 0.947,
  costUsd: cost * scale,
  replies: 420 * scale,
  webSearches: 3 * scale,
  webFetches: 5 * scale,
});

export const usageHandlers: MockHandlers = {
  get_usage_report: async (args) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    const range = (args?.range ?? 'today') as UsageRange;
    const scale = SCALE[range];
    const report: UsageReport = {
      range,
      totals: totals(scale, 41.3),
      sessions: 4 * scale,
      byDay: Array.from({ length: Math.min(scale, 7) }, (_, i) => ({
        label: ago(i).slice(0, 10),
        detail: null,
        totals: totals(1, 41.3 - i * 3),
      })),
      byModel: [
        { label: 'claude-opus-5-5', detail: null, totals: totals(scale * 0.8, 41.3) },
        { label: 'claude-haiku-4-5-20251001', detail: null, totals: totals(scale * 0.01, 41.3) },
      ],
      byRepo: [
        { label: 'blink', detail: 'master', totals: totals(scale * 0.6, 41.3) },
        { label: 'app', detail: 'feat/sync-retry', totals: totals(scale * 0.3, 41.3) },
      ],
      topSessions: [
        {
          sessionId: '00000000-0000-0000-0000-000000000001',
          title: 'Refactor the sync retry so a failed push backs off instead of looping',
          repo: 'blink',
          branch: 'master',
          lastActive: ago(0.1),
          totals: totals(scale * 0.4, 41.3),
        },
      ],
      unpricedModels: [],
      firstSeen: ago(43),
    };
    return report;
  },
};
