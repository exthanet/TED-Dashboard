// A small platform mark for tables and card heads: simple shapes in each platform's colour
// (lucide has no brand icons). Unknown platforms show nothing.
const KEY: Record<string, string> = { youtube: "youtube", facebook: "facebook", instagram: "instagram", tiktok: "tiktok", x: "x", twitter: "x", line: "line" };

export function PlatformMark({ platform, size = 16 }: { platform: string; size?: number }) {
  const k = KEY[platform.trim().toLowerCase()];
  if (!k) return null;
  const common = { width: size, height: size, viewBox: "0 0 24 24", className: "platform-mark", "aria-hidden": true } as const;
  switch (k) {
    case "youtube":
      return (
        <svg {...common}>
          <rect x="1" y="4.5" width="22" height="15" rx="4.5" fill="#ff0000" />
          <path d="M10 8.6v6.8l5.8-3.4z" fill="#fff" />
        </svg>
      );
    case "facebook":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="11" fill="#1877f2" />
          <path d="M13.2 19v-5.8h2l.3-2.4h-2.3V9.4c0-.7.2-1.2 1.2-1.2h1.2V6.1a16 16 0 0 0-1.8-.1c-1.8 0-3 1.1-3 3.1v1.7h-2v2.4h2V19z" fill="#fff" />
        </svg>
      );
    case "instagram":
      return (
        <svg {...common}>
          <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="none" stroke="#d62976" strokeWidth="2.2" />
          <circle cx="12" cy="12" r="4.3" fill="none" stroke="#d62976" strokeWidth="2.2" />
          <circle cx="17.3" cy="6.7" r="1.3" fill="#d62976" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...common}>
          <rect x="1" y="1" width="22" height="22" rx="6" fill="#111" />
          <path d="M13.4 5.5h2.2c.2 1.6 1.2 2.7 2.9 2.9v2.2a5.6 5.6 0 0 1-2.9-.9v4.6a4.2 4.2 0 1 1-4.2-4.2h.4v2.3a1.9 1.9 0 1 0 1.6 1.9z" fill="#fff" />
        </svg>
      );
    case "x":
      return (
        <svg {...common}>
          <rect x="1" y="1" width="22" height="22" rx="6" fill="#111" />
          <path d="M6.5 6h3.2l2.6 3.6L15.4 6h1.8l-4 4.6L17.6 18h-3.2l-2.8-3.9L8.2 18H6.4l4.3-4.9z" fill="#fff" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="1" y="1" width="22" height="22" rx="6" fill="#06c755" />
          <path d="M12 5.5c-4.1 0-7.4 2.6-7.4 5.9 0 2.9 2.6 5.4 6.2 5.8.3.1.2.5.1 1.2l-.1.6c0 .3.2.4.5.3 1.6-.8 5.6-3.3 7.2-5.6.6-.8.9-1.6.9-2.3 0-3.3-3.3-5.9-7.4-5.9z" fill="#fff" />
        </svg>
      );
  }
}
