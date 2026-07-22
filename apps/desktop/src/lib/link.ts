/** Normalize a user-entered link: trim, default a bare domain to https, `null` if empty. */
export function normalizeLink(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** A compact label for a link — its hostname, e.g. `https://github.com/x` → `github.com`. */
export function linkLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
