export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  const future = diff < 0;
  const abs = Math.abs(diff);
  const seconds = Math.round(abs / 1000);
  if (seconds < 45) return future ? "in a moment" : "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return future ? `in ${minutes}m` : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return future ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return future ? `in ${days}d` : `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return future ? `in ${months}mo` : `${months}mo ago`;
  const years = Math.round(months / 12);
  return future ? `in ${years}y` : `${years}y ago`;
}

export function absoluteDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const;

export function severityClasses(severity: string): string {
  switch (severity) {
    case "critical":
      return "bg-rust-soft text-rust border-rust/25";
    case "high":
      return "bg-amber-soft text-amber border-amber/25";
    case "medium":
      return "bg-moss-soft text-moss-ink border-moss/20";
    default:
      return "bg-surface-2 text-muted border-line-strong";
  }
}

export function statusClasses(ok: boolean): string {
  return ok
    ? "bg-positive-soft text-positive border-positive/25"
    : "bg-rust-soft text-rust border-rust/25";
}

export function methodClasses(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "bg-moss-soft text-moss-ink border-moss/20";
    case "POST":
      return "bg-[#e8eef5] text-[#2f5273] border-[#2f5273]/20";
    case "PUT":
    case "PATCH":
      return "bg-amber-soft text-amber border-amber/25";
    case "DELETE":
      return "bg-rust-soft text-rust border-rust/25";
    default:
      return "bg-surface-2 text-muted border-line-strong";
  }
}

const ACCENTS = [
  "#2f5a42",
  "#5b6f3a",
  "#7a5a2e",
  "#3f5b6f",
  "#6b4f6b",
  "#4a5c58",
  "#7b4a3a",
  "#4e5a2f",
];

export function accentFor(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) % 9973;
  return ACCENTS[hash % ACCENTS.length];
}

export function providerMonogram(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9 ]/g, "").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

export function toCurl(input: {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}): string {
  const lines = [`curl -X ${input.method} '${input.url}'`];
  for (const [name, value] of Object.entries(input.headers)) {
    if (!value) continue;
    lines.push(`  -H '${name}: ${value.replace(/'/g, "'\\''")}'`);
  }
  if (input.body) lines.push(`  --data '${input.body.replace(/'/g, "'\\''")}'`);
  return lines.join(" \\\n");
}

export function truncate(value: string, max = 120): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
