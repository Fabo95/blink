import type { PlatformKey } from '@/lib/releases';

export type OS = 'mac' | 'windows' | 'linux' | 'unknown';

const PLATFORM_LABELS: Record<PlatformKey, string> = {
  'darwin-aarch64': 'macOS (Apple Silicon)',
  'darwin-x86_64': 'macOS (Intel)',
  'windows-x86_64': 'Windows',
  'linux-x86_64': 'Linux',
};

export function platformLabel(key: PlatformKey): string {
  return PLATFORM_LABELS[key];
}

export function detectOS(): OS {
  if (typeof navigator === 'undefined') {
    return 'unknown';
  }
  // userAgentData.platform is the modern, non-deprecated signal; fall back to UA.
  const ua = navigator.userAgent;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
      ?.platform ?? '';
  const hay = `${platform} ${ua}`.toLowerCase();

  if (hay.includes('mac')) {
    return 'mac';
  }
  if (hay.includes('win')) {
    return 'windows';
  }
  if (hay.includes('linux') || hay.includes('x11')) {
    return 'linux';
  }
  return 'unknown';
}

// The browser can't reliably tell Apple Silicon from Intel, so macOS defaults to
// Apple Silicon (the common case today) with the Intel build offered alongside.
export function preferredPlatform(os: OS): PlatformKey | null {
  switch (os) {
    case 'mac':
      return 'darwin-aarch64';
    case 'windows':
      return 'windows-x86_64';
    case 'linux':
      return 'linux-x86_64';
    default:
      return null;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
