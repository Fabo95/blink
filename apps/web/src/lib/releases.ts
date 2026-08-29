// Shape of `latest.json`, published to R2 by the release workflow. The download
// page fetches it at runtime so a new release needs no rebuild of this site.

export type PlatformKey =
  | 'darwin-aarch64'
  | 'darwin-x86_64'
  | 'windows-x86_64'
  | 'linux-x86_64';

export interface ReleaseAsset {
  url: string;
  filename: string;
  size: number;
}

export interface ReleaseManifest {
  version: string;
  pubDate: string;
  notes?: string;
  platforms: Partial<Record<PlatformKey, ReleaseAsset>>;
}

const BASE_URL = import.meta.env.VITE_DOWNLOADS_BASE_URL;

export async function fetchManifest(): Promise<ReleaseManifest> {
  if (BASE_URL == null || BASE_URL === '') {
    throw new Error('VITE_DOWNLOADS_BASE_URL is not configured');
  }
  const res = await fetch(`${BASE_URL.replace(/\/$/, '')}/latest.json`, {
    cache: 'no-cache',
  });
  if (!res.ok) {
    throw new Error(`Failed to load release manifest (${res.status})`);
  }
  return (await res.json()) as ReleaseManifest;
}
