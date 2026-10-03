import { Globe, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { EgressEvent } from '@/generated/EgressEvent';
import type { EgressKind } from '@/generated/EgressKind';
import { api } from '@/lib/api';
import { shortAge } from '@/lib/notes';
import { errorMessage } from '@/lib/utils';

/** Rows shown; the core keeps a longer recent window. */
const SHOWN = 8;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const LABEL: Record<EgressKind, string> = {
  aiImprove: 'Improve with AI',
  aiPrompt: 'Prompt for a task',
  aiSummary: 'Summary of a source',
  pageFetch: 'Source page fetched',
};

/**
 * "What left this Mac": the device-local egress log. Every AI call and page fetch, with where
 * it went and how much of your text was sent. Never the content itself. Read-only.
 */
export function EgressCard() {
  const [events, setEvents] = useState<EgressEvent[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .listEgressEvents()
      .then(setEvents)
      .catch((e) => setError(errorMessage(e, 'Could not load the log')));
  }, []);

  const lastWeek = events.filter((e) => Date.now() - Date.parse(e.createdAt) < WEEK_MS).length;

  return (
    <Card className="panel">
      <CardHeader>
        <div className="flex w-full items-center justify-between">
          <CardTitle className="section-bar text-sm font-semibold uppercase tracking-wide text-primary">
            What left this Mac
          </CardTitle>
          <span className="text-xs text-muted-foreground">{lastWeek} in the last 7 days</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[12px] text-muted-foreground">
          Every AI call and source fetch: where it went and how much of your text was sent. Never
          the content itself. Confidential topics never appear here.
        </p>
        {error && <p className="text-[11px] text-destructive">{error}</p>}
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing has left this Mac yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {events.slice(0, SHOWN).map((event) => (
              <li key={event.id} className="flex items-center gap-2.5 text-sm">
                {event.kind === 'pageFetch' ? (
                  <Globe className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <Sparkles className="size-3.5 shrink-0 text-blink-bright" />
                )}
                <span className="min-w-0 flex-1 truncate">
                  {LABEL[event.kind]}
                  <span className="text-muted-foreground"> to {event.destination}</span>
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {event.bytes > 0 ? `${event.bytes} chars` : 'no text'}
                </span>
                <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                  {shortAge(event.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
