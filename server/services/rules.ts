import type { Severity } from "@shared/types";
import { PROVIDERS } from "@shared/catalog";

export interface SecretRule {
  id: string;
  providerSlug: string;
  providerName: string;
  severity: Severity;
  pattern: string;
  flags: string;
  description: string;
}

const CATALOG_RULES: SecretRule[] = PROVIDERS.map((provider) => ({
  id: `${provider.slug}-key`,
  providerSlug: provider.slug,
  providerName: provider.name,
  severity: provider.severity,
  pattern: provider.pattern,
  flags: "g",
  description: `${provider.name} API credential`,
}));

const EXTRA_RULES: SecretRule[] = [
  {
    id: "aws-access-key",
    providerSlug: "aws",
    providerName: "Amazon Web Services",
    severity: "critical",
    pattern: "\\b(?:AKIA|ASIA)[0-9A-Z]{16}\\b",
    flags: "g",
    description: "AWS access key ID",
  },
  {
    id: "digitalocean-token",
    providerSlug: "digitalocean",
    providerName: "DigitalOcean",
    severity: "critical",
    pattern: "\\bdop_v1_[a-f0-9]{64}\\b",
    flags: "g",
    description: "DigitalOcean personal access token",
  },
  {
    id: "private-key-block",
    providerSlug: "generic",
    providerName: "Private key",
    severity: "critical",
    pattern: "-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----",
    flags: "g",
    description: "PEM private key",
  },
  {
    id: "generic-env-secret",
    providerSlug: "generic",
    providerName: "Generic secret",
    severity: "medium",
    pattern:
      "(?:api[_-]?key|apikey|secret|token|passwd|password|client[_-]?secret)[\"']?\\s*[:=]\\s*[\"']?([A-Za-z0-9_\\-./+=]{24,})[\"']?",
    flags: "gi",
    description: "Credential-shaped assignment",
  },
];

export const SECRET_RULES: SecretRule[] = [...CATALOG_RULES, ...EXTRA_RULES];

const PLACEHOLDER_MARKERS = [
  "xxxx",
  "your_",
  "your-",
  "example",
  "sample",
  "dummy",
  "placeholder",
  "changeme",
  "change_me",
  "replace",
  "redacted",
  "notreal",
  "fake",
  "todo",
  "insert_",
  "0000000000",
];

export function isPlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  if (PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker))) return true;
  if (/^[A-Za-z0-9_-]*(\*{3,}|\.{3,}|x{6,})[A-Za-z0-9_-]*$/i.test(value)) return true;
  if (new Set(value).size < 6) return true;
  return false;
}

export function shannonEntropy(value: string): number {
  if (!value) return 0;
  const counts = new Map<string, number>();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

export const SECRET_FILE_EXTENSIONS = new Set([
  ".env",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".rb",
  ".go",
  ".php",
  ".java",
  ".kt",
  ".swift",
  ".cs",
  ".yml",
  ".yaml",
  ".json",
  ".toml",
  ".ini",
  ".conf",
  ".sh",
  ".ps1",
  ".dockerfile",
  ".tf",
  ".tfvars",
  ".md",
  ".txt",
  ".xml",
  ".properties",
  ".gradle",
]);

const SECRET_FILE_NAMES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  ".env.example",
  "dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "credentials",
  "credentials.json",
  "secrets.json",
  "config.json",
  "settings.py",
  "wrangler.toml",
  "vercel.json",
  "netlify.toml",
  "application.properties",
  "appsettings.json",
]);

const IGNORED_PATH_PARTS = [
  "node_modules/",
  "/vendor/",
  "dist/",
  "build/",
  ".min.js",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "poetry.lock",
  "cargo.lock",
];

export function isCandidateFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  if (IGNORED_PATH_PARTS.some((part) => lower.includes(part))) return false;
  const name = lower.split("/").pop() ?? lower;
  if (SECRET_FILE_NAMES.has(name)) return true;
  if (name.startsWith(".env")) return true;
  const dot = name.lastIndexOf(".");
  const ext = dot === -1 ? "" : name.slice(dot);
  return SECRET_FILE_EXTENSIONS.has(ext);
}

export interface RawMatch {
  rule: SecretRule;
  value: string;
  index: number;
}

/** Run every rule against a file body. Values are deduplicated per file. */
export function findSecrets(content: string, filePath: string): RawMatch[] {
  const matches: RawMatch[] = [];
  const seen = new Set<string>();
  for (const rule of SECRET_RULES) {
    let regex: RegExp;
    try {
      regex = new RegExp(rule.pattern, rule.flags);
    } catch {
      continue;
    }
    for (const match of content.matchAll(regex)) {
      const captured = match[1] ?? match[0];
      if (!captured) continue;
      const value = captured.trim();
      if (value.length < 16) continue;
      if (isPlaceholder(value)) continue;
      if (isPlaceholder(content.slice(Math.max(0, (match.index ?? 0) - 40), match.index))) continue;
      if (seen.has(value)) continue;
      const entropy = shannonEntropy(value);
      if (entropy < 2.5) continue;
      if (rule.providerSlug === "generic" && entropy < 3.2) continue;
      if (rule.id === "generic-env-secret" && !/(env|config|secret|credential|\.ya?ml|\.json|\.tf)$/i.test(filePath)) {
        continue;
      }
      seen.add(value);
      matches.push({ rule, value, index: match.index ?? 0 });
    }
  }
  return matches;
}

/**
 * Masked preview stored in the database. The full secret is never persisted.
 */
export function maskFoundSecret(value: string): string {
  if (value.length <= 10) return "•".repeat(value.length);
  const prefix = value.slice(0, 4);
  const suffix = value.slice(-4);
  return `${prefix}${"•".repeat(10)}${suffix}`;
}

/** Build a one-line snippet around a match with the secret redacted. */
export function redactSnippet(content: string, index: number, length: number): string {
  const lineStart = content.lastIndexOf("\n", index) + 1;
  const rawLineEnd = content.indexOf("\n", index + length);
  const lineEnd = rawLineEnd === -1 ? content.length : rawLineEnd;
  const line = content.slice(lineStart, lineEnd);
  const localIndex = index - lineStart;
  const redacted =
    line.slice(0, localIndex) +
    maskFoundSecret(line.slice(localIndex, localIndex + length)) +
    line.slice(localIndex + length);
  const compact = redacted.replace(/\t/g, "  ").trim();
  return compact.length > 240 ? `${compact.slice(0, 237)}...` : compact;
}

export function lineNumberAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i += 1) {
    if (content.charCodeAt(i) === 10) line += 1;
  }
  return line;
}
