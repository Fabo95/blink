import { brand } from '@blink/core/theme';
import { isTauri } from '../lib/api.js';

export function Header() {
  return (
    <header className="flex items-center justify-between border-b border-blink-border px-6 py-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden>
          {brand.glyph}
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-blink-soft">{brand.name}</h1>
          <p className="text-xs text-blink-muted">{brand.tagline}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-blink-muted">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            isTauri ? 'bg-blink-success' : 'bg-blink-danger'
          }`}
          aria-hidden
        />
        {isTauri ? 'Local core connected' : 'Browser mock (no Rust core)'}
      </div>
    </header>
  );
}
