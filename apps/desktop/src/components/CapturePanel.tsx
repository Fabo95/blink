import { Check, ChevronDown, Link2, ShieldCheck, Tag, WandSparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { ShortcutHint } from '@/components/ShortcutHint';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { CaptureSource } from '@/generated/CaptureSource';
import type { TaskGroup } from '@/generated/TaskGroup';
import { api, isTauri } from '@/lib/api';
import { normalizeLink } from '@/lib/link';

/** The initial content a capture method drops into the panel when it opens. */
export interface CaptureContent {
  text: string;
  source: CaptureSource;
  redactionCount: number;
  /** Pre-filled link (e.g. the source page URL for a browser copy-capture). */
  link?: string;
}

/** Everything that differs between capture methods; the panel owns the rest. */
export interface CaptureKind {
  /** Heading shown at the top of the panel. */
  title: string;
  placeholder: string;
  /** The Tauri event this method's window opener emits on (re)open. */
  openEvent: string;
  /** Produce the initial content each time the panel opens. */
  load: () => Promise<CaptureContent>;
  /** Close the panel and return focus to the previous app. */
  dismiss: () => Promise<void>;
  /** Show the origin line + redaction badge (copy) vs a bare field (manual). */
  showSource?: boolean;
}

/**
 * The floating capture panel, reused by every capture method. Each method supplies a
 * [`CaptureKind`] describing how it loads content and dismisses; the panel owns the
 * common shell — the AI "improve" action, save, and the Esc / ⌘↵ keys.
 */
export function CapturePanel({ kind }: { kind: CaptureKind }) {
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [source, setSource] = useState<CaptureSource | null>(null);
  const [redactions, setRedactions] = useState(0);
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [taskGroupId, setTaskGroupId] = useState<string | null>(null);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [improving, setImproving] = useState(false);
  // True once the text is AI-improved and untouched since — carried to the saved task
  // so the inbox doesn't offer to improve it again.
  const [improved, setImproved] = useState(false);
  const [error, setError] = useState('');
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    // Groups + the inbox's active filter load alongside the content; a capture
    // defaults to that filter (guarded against a stale id whose group is gone).
    const [content, loadedGroups, activeGroup] = await Promise.all([
      kind.load(),
      api.listTaskGroups(),
      api.getActiveTaskGroup(),
    ]);
    setText(content.text);
    setLink(content.link ?? '');
    setSource(content.source);
    setRedactions(content.redactionCount);
    setGroups(loadedGroups);
    setTaskGroupId(loadedGroups.some((g) => g.id === activeGroup) ? activeGroup : null);
    setImproved(false);
    setError('');
    setTimeout(() => fieldRef.current?.focus(), 0);
  }, [kind]);

  const hide = useCallback(async () => {
    setText('');
    setLink('');
    setRedactions(0);
    setTaskGroupId(null);
    setGroupMenuOpen(false);
    setImproved(false);
    setError('');
    await kind.dismiss();
  }, [kind]);

  const save = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || !source) return;
    // Accept a bare domain (`github.com`) — default it to https so it opens later.
    await api.saveTask({ text: trimmed, improved, link: normalizeLink(link), taskGroupId, source });
    if (isTauri) {
      // Only the main (inbox) window cares — target it directly.
      const { emitTo } = await import('@tauri-apps/api/event');
      await emitTo('main', 'task-saved');
    }
    await hide();
  }, [text, improved, link, taskGroupId, source, hide]);

  const improve = useCallback(async () => {
    if (!text.trim()) return;
    setImproving(true);
    setError('');
    try {
      setText(await api.improveText(text));
      setImproved(true);
    } catch (e) {
      // Tauri rejects a command's Err with our AppError object `{ kind, message }`,
      // which isn't an Error instance — pull the message from whatever shape it is.
      const message =
        e instanceof Error
          ? e.message
          : typeof e === 'string'
            ? e
            : e && typeof e === 'object' && 'message' in e
              ? String((e as { message: unknown }).message)
              : 'Could not improve text';
      setError(message);
    } finally {
      setImproving(false);
    }
  }, [text]);

  // (Re)load on mount and whenever the hotkey re-opens the panel.
  useEffect(() => {
    void load();
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen(kind.openEvent, () => {
        void load();
      }).then((fn) => {
        unlisten = fn;
      });
    });
    return () => unlisten?.();
  }, [load, kind.openEvent]);

  // Esc cancels, ⌘↵ saves — enabled inside the fields (the panel is basically a form).
  useHotkeys('escape', () => void hide(), {
    enabled: !groupMenuOpen,
    enableOnFormTags: true,
    preventDefault: true,
  });
  useHotkeys('mod+enter', () => void save(), { enableOnFormTags: true, preventDefault: true });
  useHotkeys('mod+i', () => void improve(), {
    enabled: !improved && !improving,
    enableOnFormTags: true,
    preventDefault: true,
  });
  useHotkeys('mod+g', () => setGroupMenuOpen((open) => !open), {
    enabled: groups.length > 0,
    enableOnFormTags: true,
    preventDefault: true,
  });

  const showSource = kind.showSource && source && (source.appName || source.windowTitle);

  return (
    <div className="flex h-screen w-screen">
      {/* Translucent tint over the native hudWindow vibrancy — the window itself
          supplies the frost, rounding (radius 16) and drop shadow. */}
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 rounded-2xl border border-white/10 bg-[hsl(258_36%_13%/0.5)] p-4">
        {/* Drag handle: the header row moves the frameless window. */}
        <div
          data-tauri-drag-region=""
          className="flex select-none items-center justify-between [&>*]:pointer-events-none"
        >
          <span className="section-bar text-xs font-semibold uppercase tracking-wide text-primary">
            {kind.title}
          </span>
          {kind.showSource && redactions > 0 && (
            <Badge variant="destructive" className="gap-1">
              <ShieldCheck className="size-3" />
              {redactions} redacted
            </Badge>
          )}
        </div>

        {showSource && source && (
          <p className="truncate text-[11px] text-muted-foreground">
            from {source.appName || source.appId}
            {source.windowTitle && ` · ${source.windowTitle}`}
          </p>
        )}

        {/* Optional link — carried onto the task and openable from the inbox. The
            wrapper mirrors the textarea's field styling (border, shadow, focus ring)
            so the two inputs render identically; the inner Input is stripped bare. */}
        <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring">
          <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
          <Input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Add a link (optional)"
            className="h-auto min-w-0 flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>

        {/* Group picker — a field, not a button: ⌘G toggles the menu, arrows+↵ pick.
            Hidden entirely until the user has created a group. */}
        {groups.length > 0 && (
          <DropdownMenu open={groupMenuOpen} onOpenChange={setGroupMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                tabIndex={-1}
                className="flex h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm transition-colors"
              >
                <Tag className="size-3.5 shrink-0 text-muted-foreground" />
                <span
                  className={
                    taskGroupId ? 'flex-1 text-left' : 'flex-1 text-left text-muted-foreground'
                  }
                >
                  {groups.find((g) => g.id === taskGroupId)?.name ?? 'No group'}
                </span>
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-[var(--radix-dropdown-menu-trigger-width)]"
            >
              <DropdownMenuRadioGroup
                value={taskGroupId ?? ''}
                onValueChange={(value) => setTaskGroupId(value || null)}
              >
                <DropdownMenuRadioItem value="">No group</DropdownMenuRadioItem>
                {groups.map((group) => (
                  <DropdownMenuRadioItem key={group.id} value={group.id}>
                    {group.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Textarea
          ref={fieldRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setImproved(false);
          }}
          placeholder={kind.placeholder}
          className="flex-1 resize-none text-sm leading-relaxed"
        />

        {error && <p className="line-clamp-2 text-[11px] text-destructive">{error}</p>}

        <div className="flex items-center justify-between gap-2">
          <ShortcutHint
            shortcuts={[
              ...(improved ? [] : [{ keys: '⌘i', label: 'improve' }]),
              ...(groups.length > 0 ? [{ keys: '⌘g', label: 'group' }] : []),
              { keys: '⌘↵', label: 'save' },
              { keys: 'Esc', label: 'cancel' },
            ]}
          />
          {improving ? (
            <span className="flex items-center gap-1.5 text-[11px] text-blink-bright">
              <WandSparkles className="size-3 animate-pulse" />
              Improving…
            </span>
          ) : improved ? (
            <span className="flex items-center gap-1.5 text-[11px] text-blink-success">
              <Check className="size-3" />
              Improved
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
