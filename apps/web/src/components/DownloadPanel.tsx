import { useEffect, useState } from 'react';
import {
  detectOS,
  formatBytes,
  type OS,
  platformLabel,
  preferredPlatform,
} from '@/lib/platform';
import { fetchManifest, type PlatformKey, type ReleaseManifest } from '@/lib/releases';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; manifest: ReleaseManifest; os: OS };

const PLATFORM_ORDER: PlatformKey[] = [
  'darwin-aarch64',
  'darwin-x86_64',
  'windows-x86_64',
  'linux-x86_64',
];

export function DownloadPanel() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetchManifest()
      .then((manifest) => {
        if (!cancelled) {
          setState({ status: 'ready', manifest, os: detectOS() });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Could not load downloads';
          setState({ status: 'error', message });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return <p className="text-sm text-muted-foreground">Loading the latest release…</p>;
  }

  if (state.status === 'error') {
    return (
      <p className="text-sm text-blink-danger">
        Downloads are temporarily unavailable. {state.message}
      </p>
    );
  }

  const { manifest, os } = state;
  const primaryKey = preferredPlatform(os);
  const primary = primaryKey != null ? manifest.platforms[primaryKey] : undefined;
  const available = PLATFORM_ORDER.filter((key) => manifest.platforms[key] != null);

  return (
    <div className="flex flex-col items-center gap-6">
      {primaryKey != null && primary != null ? (
        <a
          href={primary.url}
          className="group inline-flex flex-col items-center gap-1 rounded-xl border border-blink-primary/40 bg-blink-primary/10 px-8 py-4 shadow-glow transition-colors hover:bg-blink-primary/20"
        >
          <span className="text-lg font-semibold text-blink-text">
            Download for {platformLabel(primaryKey)}
          </span>
          <span className="text-xs text-muted-foreground">
            v{manifest.version} · {formatBytes(primary.size)}
          </span>
        </a>
      ) : (
        <p className="text-sm text-muted-foreground">
          Choose your platform below to download Blink v{manifest.version}.
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        {available
          .filter((key) => key !== primaryKey)
          .map((key) => {
            const asset = manifest.platforms[key];
            if (asset == null) {
              return null;
            }
            return (
              <a
                key={key}
                href={asset.url}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-blink-primary/40 hover:text-blink-text"
              >
                {platformLabel(key)}
                <span className="text-xs opacity-70">{formatBytes(asset.size)}</span>
              </a>
            );
          })}
      </div>
    </div>
  );
}
