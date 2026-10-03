import { Lightbulb, TriangleAlert } from 'lucide-react';
import { ConvictionDots } from '@/components/ideas/ConvictionDots';
import { Input } from '@/components/ui/input';
import { PopoverContent } from '@/components/ui/popover';
import type { ReviewView } from '@/hooks/useReview';
import { shortAge } from '@/lib/notes';
import { cn } from '@/lib/utils';

const SCALE = [1, 2, 3, 4, 5];

/** The in-row review popover. Keys live in `useReview` and are hinted by the statusline:
 *  `⌘1`–`⌘5` conviction, `⌘↵` keep, `⌘p` promote, `⌘⌫` drop, `Esc` close. */
export function ReviewPopover({ review }: { review: ReviewView }) {
  const note = review.current;
  if (!note) return null;
  return (
    <PopoverContent
      align="start"
      sideOffset={8}
      className="w-[var(--radix-popover-trigger-width)] p-3"
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Review
        </p>
        {review.total > 1 && (
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {review.position} of {review.total}
          </p>
        )}
      </div>
      <p className="mt-2 line-clamp-4 whitespace-pre-wrap break-words text-sm">{note.text}</p>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>captured {shortAge(note.createdAt)} ago</span>
        {note.convictionHistory.length > 0 && (
          <>
            <span aria-hidden className="text-muted-foreground/30">
              ·
            </span>
            <ConvictionDots history={note.convictionHistory} />
          </>
        )}
      </div>

      <div className="mt-3">
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          How convinced are you now?
        </p>
        <div className="flex items-center gap-1.5">
          {SCALE.map((value) => (
            <span
              key={value}
              aria-hidden
              className={cn(
                'flex h-8 flex-1 items-center justify-center rounded-md border text-sm tabular-nums',
                value === review.conviction
                  ? 'border-primary/60 bg-primary/20 font-semibold text-foreground'
                  : 'border-border/60 text-muted-foreground',
              )}
            >
              {value}
            </span>
          ))}
        </div>
        <p className="sr-only">Conviction {review.conviction} of 5</p>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>not convinced</span>
          <span>very convinced</span>
        </div>
      </div>

      <Input
        autoFocus
        aria-label="Comment"
        value={review.comment}
        onChange={(e) => review.setComment(e.target.value)}
        placeholder="What changed? (optional)"
        className="mt-3 h-8 text-sm"
      />

      {note.reviewNudge === 'promote' && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-blink-bright">
          <Lightbulb className="size-3 shrink-0" />
          Rated 4 or higher three times in a row. Time to promote it into a task?
        </p>
      )}
      {note.reviewNudge === 'drop' && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <TriangleAlert className="size-3 shrink-0" />
          Low conviction lately. Dropping it keeps it searchable.
        </p>
      )}
      {review.error && (
        <p className="mt-2 line-clamp-2 text-[11px] text-destructive">{review.error}</p>
      )}
    </PopoverContent>
  );
}
