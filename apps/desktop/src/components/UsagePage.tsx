import { BarChart3 } from 'lucide-react';
import { useState } from 'react';
import { Pill } from '@/components/ui/pill';
import { EmptyState, ErrorLine, FIELD_LABEL, Section } from '@/components/ui/section';
import type { UsageGroup } from '@/generated/UsageGroup';
import type { UsageRange } from '@/generated/UsageRange';
import type { UsageSession } from '@/generated/UsageSession';
import type { UsageTotals } from '@/generated/UsageTotals';
import { useUsage } from '@/hooks/useUsage';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { timeAgo } from '@/lib/timeAgo';

const RANGES: { id: UsageRange; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: '7 days' },
  { id: 'month', label: '30 days' },
  { id: 'all', label: 'All' },
];

const usd = (value: number) =>
  value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 0 : 2,
  });

/** 1.2k / 3.4M / 1.1B — token counts span nine orders of magnitude. */
const compact = (value: number) =>
  value.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 });

const percent = (value: number) => `${Math.round(value * 100)}%`;

/**
 * The Usage page: what Claude Code used on this Mac, read from its own transcripts — an
 * estimated cost at API list prices, tokens, cache hit rate, and where it went (per day,
 * model, repo + branch, and the most expensive sessions). `←→`/`hl` switch the range; the
 * app-wide `g` re-reads the transcripts. Read-only, so there's no row cursor.
 */
export function UsagePage({ helpOpen }: { helpOpen: boolean }) {
  const [range, setRange] = useState<UsageRange>('today');
  const { report, loading, error } = useUsage(range);
  const enabled = !helpOpen;

  const cycle = (delta: number) => {
    const index = RANGES.findIndex((r) => r.id === range);
    const next = RANGES[(index + delta + RANGES.length) % RANGES.length];
    if (next) setRange(next.id);
  };
  useShortcut('usage.rangePrev', { enabled, callback: () => cycle(-1) });
  useShortcut('usage.rangeNext', { enabled, callback: () => cycle(1) });

  const totals = report?.totals;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {RANGES.map((r) => (
          <Pill
            key={r.id}
            label={r.label}
            selected={r.id === range}
            onSelect={() => setRange(r.id)}
          />
        ))}
      </div>

      <Section title="Claude Code usage" busy={loading}>
        {!totals || totals.replies === 0 ? (
          <EmptyState icon={BarChart3}>
            {loading ? 'Reading Claude Code transcripts…' : 'No Claude Code usage in this range.'}
          </EmptyState>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Est. cost" value={usd(totals.costUsd)} note="at API list prices" />
              <Stat
                label="Tokens"
                value={compact(allTokens(totals))}
                note={`${compact(totals.outputTokens)} output`}
              />
              <Stat
                label="Cache hits"
                value={percent(totals.cacheHitRate)}
                note={`${compact(totals.cacheReadTokens)} read`}
              />
              <Stat
                label="Sessions"
                value={String(report.sessions)}
                note={`${totals.replies.toLocaleString('en-US')} replies`}
              />
            </div>
            <TokenLine totals={totals} />
            {report.unpricedModels.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                No price known for {report.unpricedModels.join(', ')}; left out of the cost.
              </p>
            )}
          </div>
        )}
        {error && (
          <div className="mt-2">
            <ErrorLine>{error}</ErrorLine>
          </div>
        )}
      </Section>

      {report && report.totals.replies > 0 && (
        <>
          {report.byDay.length > 1 && (
            <Section title="By day" count={report.byDay.length}>
              <Breakdown groups={report.byDay} label={(g) => dayLabel(g.label)} />
            </Section>
          )}
          <Section title="By model" count={report.byModel.length}>
            <Breakdown groups={report.byModel} label={(g) => g.label} />
          </Section>
          <Section title="By repo and branch" count={report.byRepo.length}>
            <Breakdown
              groups={report.byRepo}
              label={(g) => (g.detail ? `${g.label} · ${g.detail}` : g.label)}
            />
          </Section>
          <Section title="Top sessions" count={report.topSessions.length}>
            <ul className="space-y-2">
              {report.topSessions.map((session) => (
                <SessionRow key={session.sessionId} session={session} />
              ))}
            </ul>
          </Section>
          {report.firstSeen && (
            <p className="px-1 text-[11px] text-muted-foreground">
              Read from Claude Code’s transcripts on this Mac, back to{' '}
              {new Date(report.firstSeen).toLocaleDateString()}. On a subscription the cost is what
              this would cost on the API, not what you pay.
            </p>
          )}
        </>
      )}
    </div>
  );
}

const allTokens = (t: UsageTotals) =>
  t.inputTokens + t.outputTokens + t.cacheWriteTokens + t.cacheReadTokens;

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 px-3.5 py-3">
      <p className={FIELD_LABEL}>{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}

/** Where the tokens went, in one quiet line under the tiles. */
function TokenLine({ totals }: { totals: UsageTotals }) {
  const parts = [
    `${compact(totals.inputTokens)} input`,
    `${compact(totals.cacheWriteTokens)} cache write`,
    `${compact(totals.cacheReadTokens)} cache read`,
    `${compact(totals.outputTokens)} output (${compact(totals.thinkingTokens)} thinking)`,
  ];
  if (totals.webSearches + totals.webFetches > 0) {
    parts.push(`${totals.webSearches} web searches · ${totals.webFetches} fetches`);
  }
  return <p className="text-[11px] tabular-nums text-muted-foreground">{parts.join(' · ')}</p>;
}

/** One row per group: name, a bar sized by cost against the largest, the cost and tokens. */
function Breakdown({
  groups,
  label,
}: {
  groups: UsageGroup[];
  label: (group: UsageGroup) => string;
}) {
  const max = Math.max(...groups.map((g) => g.totals.costUsd), 0);
  return (
    <ul className="space-y-2.5">
      {groups.map((group) => {
        const name = label(group);
        const share = max > 0 ? group.totals.costUsd / max : 0;
        return (
          <li
            key={`${group.label}·${group.detail ?? ''}`}
            title={`${name}: ${usd(group.totals.costUsd)} · ${compact(allTokens(group.totals))} tokens · ${percent(group.totals.cacheHitRate)} cache hits`}
          >
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="min-w-0 truncate">{name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                <span className="font-medium text-foreground">{usd(group.totals.costUsd)}</span>
                {' · '}
                {compact(allTokens(group.totals))} tokens
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-border/30">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(share * 100, share > 0 ? 1 : 0)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function SessionRow({ session }: { session: UsageSession }) {
  return (
    <li className="rounded-xl border border-border/60 bg-card/40 px-3.5 py-3">
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 line-clamp-2 text-sm font-medium leading-snug">
          {session.title}
        </p>
        <span className="shrink-0 text-sm font-medium tabular-nums">
          {usd(session.totals.costUsd)}
        </span>
      </div>
      <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
        {session.branch ? `${session.repo} · ${session.branch}` : session.repo} ·{' '}
        {compact(allTokens(session.totals))} tokens · {timeAgo(session.lastActive)}
      </p>
    </li>
  );
}

/** `2026-10-15` → Today / Yesterday / Mon, Oct 13. */
function dayLabel(day: string): string {
  const date = new Date(`${day}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - date.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
