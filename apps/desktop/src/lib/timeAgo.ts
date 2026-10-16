/**
 * The one relative-time format in the app ("just now", "12 min ago", "3 h ago", "5 d ago",
 * "3 w ago", "4 mo ago", "2 y ago") — rows, the connection list, and the egress log all use it.
 */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return '';
  const minutes = Math.round((now - parsed) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days} d ago`;
  if (days < 60) return `${Math.floor(days / 7)} w ago`;
  if (days < 730) return `${Math.floor(days / 30)} mo ago`;
  return `${Math.floor(days / 365)} y ago`;
}
