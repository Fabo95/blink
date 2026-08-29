import { brand } from '@blink/core/theme';
import { DownloadPanel } from '@/components/DownloadPanel';

const FEATURES = [
  {
    title: 'It stays on your Mac',
    body: 'Tasks are saved in an encrypted database on your machine. Nothing lands on a server you don’t run.',
  },
  {
    title: 'One hotkey to capture',
    body: 'Copy any messy bit of text, press the shortcut, and Blink cleans it up into a task. That part never leaves your device.',
  },
  {
    title: 'Sync without trusting us',
    body: 'Flip on self-hosted sync and the server only ever holds encrypted data. Your keys stay with you.',
  },
];

export function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center px-6 py-24 text-center">
      <header className="flex flex-col items-center gap-4">
        <span className="rounded-full border border-blink-primary/30 bg-blink-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-widest text-blink-soft">
          macOS
        </span>
        <h1 className="bg-gradient-to-b from-blink-text to-blink-soft bg-clip-text text-6xl font-bold text-transparent">
          {brand.name}
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Catch a task the second it comes up. Copy some text, hit the hotkey, and Blink turns it
          into a clean task saved right on your Mac.
        </p>
      </header>

      <section className="mt-14">
        <DownloadPanel />
      </section>

      <section className="mt-24 grid w-full gap-6 text-left sm:grid-cols-3">
        {FEATURES.map((feature) => (
          <article
            key={feature.title}
            className="rounded-xl border border-border bg-card/60 p-5 backdrop-blur"
          >
            <h2 className="mb-2 text-sm font-semibold text-blink-text">{feature.title}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
          </article>
        ))}
      </section>

      <footer className="mt-24 text-xs text-muted-foreground">
        {brand.name} · Made for macOS 12 and up
      </footer>
    </main>
  );
}
