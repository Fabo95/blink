/** The Blink glass-globe logo — a small SVG echo of the app icon. */
export function GlobeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <defs>
        <radialGradient id="blink-orb" cx="38%" cy="32%" r="80%">
          <stop offset="0%" stopColor="#efe8ff" />
          <stop offset="30%" stopColor="#b39bff" />
          <stop offset="70%" stopColor="#7c56e6" />
          <stop offset="100%" stopColor="#3f2a7a" />
        </radialGradient>
        <radialGradient id="blink-orb-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16.5" r="15.5" fill="url(#blink-orb-glow)" />
      <circle cx="16" cy="15" r="11" fill="url(#blink-orb)" />
      <ellipse cx="12" cy="10.8" rx="2.7" ry="2.1" fill="#ffffff" opacity="0.85" />
    </svg>
  );
}
