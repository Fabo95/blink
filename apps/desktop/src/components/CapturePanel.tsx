import {
  Check,
  ChevronDown,
  FolderOpen,
  Link2,
  Lock,
  ShieldCheck,
  Tag,
  WandSparkles,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NoteTypeIcon } from '@/components/ideas/NoteTypeIcon';
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
import type { NoteType } from '@/generated/NoteType';
import type { TaskGroup } from '@/generated/TaskGroup';
import type { Topic } from '@/generated/Topic';
import { useAiStatus } from '@/hooks/useAiStatus';
import { api, isTauri } from '@/lib/api';
import { normalizeLink } from '@/lib/link';
import {
  CAPTURE_TYPE_LABEL,
  type CaptureType,
  NOTE_PLACEHOLDER,
  NOTE_TYPE_LABEL,
  NOTE_TYPES,
} from '@/lib/notes';
import { Hints } from '@/lib/shortcuts/Hints';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { errorMessage } from '@/lib/utils';

/** The initial content a capture method drops into the panel when it opens. */
export interface CaptureContent {
  text: string;
  source: CaptureSource;
  redactionCount: number;
  /** Pre-filled link (e.g. the source page URL for a browser copy-capture). */
  link?: string;
  /** Frozen raw text (copy capture); absent = freeze at the first improve. */
  rawText?: string;
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
  /** What a fresh capture becomes; `⌘T` cycles from here. Defaults to a task. */
  defaultType?: CaptureType;
}

/**
 * The floating capture panel, reused by every capture method. Each method supplies a
 * [`CaptureKind`] describing how it loads content and dismisses; the panel owns the
 * common shell — the AI "improve" action, save, and the Esc / ⌘↵ keys.
 */
export function CapturePanel({ kind }: { kind: CaptureKind }) {
  const { enabled: aiEnabled } = useAiStatus();
  const [captureType, setCaptureType] = useState<CaptureType>(kind.defaultType ?? 'task');
  // The note type `⌘T` returns to when switching back from Task, so the choice sticks.
  const [lastNoteType, setLastNoteType] = useState<NoteType>('idea');
  const [text, setText] = useState('');
  // The immutable captured text. `null` = not yet frozen: a manual capture freezes it at
  // the first improve, a copy capture arrives already frozen (the sanitized prefill).
  const [rawText, setRawText] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const [source, setSource] = useState<CaptureSource | null>(null);
  const [redactions, setRedactions] = useState(0);
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [taskGroupId, setTaskGroupId] = useState<string | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicId, setTopicId] = useState<string | null>(null);
  // One picker menu for both: a task files into a group, a note into a topic.
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [improving, setImproving] = useState(false);
  // True once the text is AI-improved and untouched since — carried to the saved task
  // so the inbox doesn't offer to improve it again.
  const [improved, setImproved] = useState(false);
  const [error, setError] = useState('');
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    // Groups + the inbox's active filter load alongside the content; a capture
    // defaults to that filter (guarded against a stale id whose group is gone).
    // Topics likewise default to the Ideas page's active topic.
    const [content, loadedGroups, activeGroup, loadedTopics, activeTopic] = await Promise.all([
      kind.load(),
      api.listTaskGroups(),
      api.getActiveTaskGroup(),
      api.listTopics(),
      api.getActiveTopic(),
    ]);
    setCaptureType(kind.defaultType ?? 'task');
    setText(content.text);
    setRawText(content.rawText ?? null);
    setLink(content.link ?? '');
    setSource(content.source);
    setRedactions(content.redactionCount);
    setGroups(loadedGroups);
    setTaskGroupId(loadedGroups.some((g) => g.id === activeGroup) ? activeGroup : null);
    setTopics(loadedTopics);
    setTopicId(loadedTopics.some((t) => t.id === activeTopic) ? activeTopic : null);
    setImproved(false);
    setError('');
    setTimeout(() => fieldRef.current?.focus(), 0);
  }, [kind]);

  const hide = useCallback(async () => {
    setText('');
    setRawText(null);
    setLink('');
    setRedactions(0);
    setTaskGroupId(null);
    setTopicId(null);
    setGroupMenuOpen(false);
    setImproved(false);
    setError('');
    await kind.dismiss();
  }, [kind]);

  const save = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || !source) return;
    // Accept a bare domain (`github.com`) — default it to https so it opens later.
    // Never improved and never a copy-capture prefill → the raw is the saved text itself.
    try {
      if (captureType === 'task') {
        await api.saveTask({
          text: trimmed,
          rawText: rawText ?? trimmed,
          improved,
          link: normalizeLink(link),
          taskGroupId,
          source,
        });
      } else {
        await api.saveNote({
          noteType: captureType,
          text: trimmed,
          rawText: rawText ?? trimmed,
          improved,
          link: normalizeLink(link),
          topicId,
          source,
        });
      }
    } catch (e) {
      setError(errorMessage(e, 'Could not save'));
      return;
    }
    if (isTauri) {
      // Only the main window cares — target it directly.
      const { emitTo } = await import('@tauri-apps/api/event');
      await emitTo('main', captureType === 'task' ? 'task-saved' : 'note-saved');
    }
    await hide();
  }, [text, rawText, improved, link, captureType, taskGroupId, topicId, source, hide]);

  const improve = useCallback(async () => {
    if (!text.trim()) return;
    setImproving(true);
    setError('');
    try {
      // Freeze the raw at the first improve (manual capture); later improves don't re-freeze,
      // and a copy capture is already frozen from its prefill.
      if (rawText === null) setRawText(text);
      // A note's topic decides whether its text may reach the AI at all (checked in the
      // core); a task has no such label.
      setText(
        captureType === 'task'
          ? await api.improveText(text)
          : await api.improveNoteText(text, topicId),
      );
      setImproved(true);
    } catch (e) {
      setError(errorMessage(e, 'Could not improve text'));
    } finally {
      setImproving(false);
    }
  }, [text, rawText, captureType, topicId]);

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

  const isNote = captureType !== 'task';
  const selectedTopic = topics.find((t) => t.id === topicId) ?? null;
  const confidential = isNote && selectedTopic?.sensitivity === 'confidential';
  // A source is quoted evidence: AI never rewrites it. A confidential topic never reaches
  // the AI at all (the core refuses; this just keeps the key from being offered).
  const canImprove =
    aiEnabled && !improved && !improving && captureType !== 'source' && !confidential;
  const pickerOptions = isNote ? topics : groups;

  useShortcut('capture.save', { callback: () => void save() });
  useShortcut('capture.improve', { enabled: canImprove, callback: () => void improve() });
  // ⌘T is a plain switch between the two things a capture can be; what kind of note it is
  // is a property of the note, picked from its own dropdown (⌘K) next to the topic.
  useShortcut('capture.type', {
    callback: () => {
      setGroupMenuOpen(false);
      setTypeMenuOpen(false);
      if (captureType === 'task') {
        setCaptureType(lastNoteType);
      } else {
        setLastNoteType(captureType);
        setCaptureType('task');
      }
    },
  });
  const pickNoteType = (type: NoteType) => {
    setCaptureType(type);
    setLastNoteType(type);
  };
  useShortcut('capture.noteType', {
    enabled: isNote,
    callback: () => {
      setGroupMenuOpen(false);
      setTypeMenuOpen((open) => !open);
    },
  });
  useShortcut('capture.group', {
    enabled: pickerOptions.length > 0,
    callback: () => {
      setTypeMenuOpen(false);
      setGroupMenuOpen((open) => !open);
    },
  });
  useShortcut('capture.cancel', {
    enabled: !groupMenuOpen && !typeMenuOpen,
    callback: () => void hide(),
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

        {/* Display only: ⌘T is hinted in the statusline, so the chips are hidden from
            assistive tech and the current choice is announced as text. */}
        <div className="flex select-none items-center gap-1">
          <span className="sr-only">Capturing as {CAPTURE_TYPE_LABEL[captureType]}</span>
          <Chip active={!isNote} type="task" label="Task" />
          <Chip active={isNote} type={isNote ? captureType : lastNoteType} label="Note" />
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

        <div className="flex gap-2">
          {/* Note type picker: a field like the topic picker; ⌘K toggles it, arrows+↵ pick. */}
          {isNote && (
            <DropdownMenu open={typeMenuOpen} onOpenChange={setTypeMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  tabIndex={-1}
                  className="flex h-9 w-36 shrink-0 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm transition-colors"
                >
                  <NoteTypeIcon type={captureType} className="text-muted-foreground" />
                  <span className="flex-1 text-left">{NOTE_TYPE_LABEL[captureType].one}</span>
                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-40">
                <DropdownMenuRadioGroup
                  value={captureType}
                  onValueChange={(value) => {
                    // Radix hands back a plain string; narrow against the known types.
                    const picked = NOTE_TYPES.find((type) => type === value);
                    if (picked) pickNoteType(picked);
                  }}
                >
                  {NOTE_TYPES.map((type) => (
                    <DropdownMenuRadioItem key={type} value={type}>
                      <span className="flex items-center gap-2">
                        <NoteTypeIcon type={type} className="text-muted-foreground" />
                        {NOTE_TYPE_LABEL[type].one}
                      </span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Group / topic picker — a field, not a button: ⌘G toggles the menu, arrows+↵
            pick. A task files into a group, a note into a topic; hidden until the user has
            created one. */}
          {pickerOptions.length > 0 && (
            <DropdownMenu open={groupMenuOpen} onOpenChange={setGroupMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  tabIndex={-1}
                  className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm transition-colors"
                >
                  {isNote ? (
                    <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <Tag className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span
                    className={
                      (isNote ? topicId : taskGroupId)
                        ? 'flex-1 text-left'
                        : 'flex-1 text-left text-muted-foreground'
                    }
                  >
                    {isNote
                      ? (selectedTopic?.name ?? 'No topic')
                      : (groups.find((g) => g.id === taskGroupId)?.name ?? 'No group')}
                  </span>
                  {confidential && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Lock className="size-3" />
                      Confidential, AI off
                    </span>
                  )}
                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-[var(--radix-dropdown-menu-trigger-width)]"
              >
                <DropdownMenuRadioGroup
                  value={(isNote ? topicId : taskGroupId) ?? ''}
                  onValueChange={(value) =>
                    isNote ? setTopicId(value || null) : setTaskGroupId(value || null)
                  }
                >
                  <DropdownMenuRadioItem value="">
                    {isNote ? 'No topic' : 'No group'}
                  </DropdownMenuRadioItem>
                  {pickerOptions.map((option) => (
                    <DropdownMenuRadioItem key={option.id} value={option.id}>
                      {option.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <Textarea
          ref={fieldRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setImproved(false);
          }}
          placeholder={isNote ? NOTE_PLACEHOLDER[captureType] : kind.placeholder}
          className="flex-1 resize-none text-sm leading-relaxed"
        />

        {error && <p className="line-clamp-2 text-[11px] text-destructive">{error}</p>}

        <div className="flex items-center justify-between gap-2">
          <Hints />
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

function Chip({ active, type, label }: { active: boolean; type: CaptureType; label: string }) {
  return (
    <span
      aria-hidden
      className={
        active
          ? 'inline-flex items-center gap-1 rounded-full border border-primary/40 bg-card/70 px-2.5 py-0.5 text-[11px] font-medium text-foreground'
          : 'inline-flex items-center gap-1 rounded-full border border-transparent px-2.5 py-0.5 text-[11px] text-muted-foreground'
      }
    >
      <NoteTypeIcon type={type} className="size-3" />
      {label}
    </span>
  );
}
