export type ApiCategory =
  | "ai"
  | "payments"
  | "communication"
  | "data"
  | "devtools"
  | "auth"
  | "maps"
  | "media"
  | "infrastructure"
  | "productivity"
  | "search";

export type AuthScheme = "bearer" | "header" | "query" | "basic" | "path" | "aws" | "none";

export interface Provider {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: ApiCategory;
  docsUrl: string;
  consoleUrl: string;
  baseUrl: string;
  authScheme: AuthScheme;
  authHeaderName?: string;
  authQueryName?: string;
  /** Prefix applied before the secret, e.g. "Bot " for Discord. */
  authPrefix?: string;
  /** Username for basic auth. Mailgun uses "api". */
  basicUsername?: string;
  /** Some APIs embed the token in the path, e.g. Telegram's /bot<token>. */
  authPathPrefix?: string;
  /** False when the playground cannot authenticate with a single key. */
  playgroundSupported?: boolean;
  playgroundNote?: string;
  keyHint: string;
  /** Regular expression source used by the exposure scanner. */
  pattern: string;
  /**
   * Severity assigned when this provider's key shape is found in a tracked
   * repository. Higher blast radius => higher severity.
   */
  severity: Severity;
  tags: string[];
  samplePath: string;
  sampleMethod: HttpMethod;
  popular?: boolean;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type Severity = "low" | "medium" | "high" | "critical";
export type FindingStatus = "open" | "acknowledged" | "resolved" | "dismissed";
export type ScanStatus = "queued" | "running" | "complete" | "failed" | "cancelled";
export type ScanSource = "demo" | "github" | "search";

export interface User {
  id: number;
  email: string;
  name: string;
  createdAt: string;
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: "light" | "dark" | "system";
  density: "comfortable" | "compact";
  reduceMotion: boolean;
  defaultCategory: ApiCategory | "all";
}

export interface SavedApi {
  id: number;
  slug: string | null;
  name: string;
  baseUrl: string;
  category: ApiCategory | "custom";
  notes: string | null;
  favorite: boolean;
  createdAt: string;
  custom: boolean;
}

export interface CredentialSummary {
  id: number;
  providerSlug: string;
  providerName: string;
  label: string;
  hint: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

export interface RequestRecord {
  id: number;
  method: string;
  url: string;
  host: string;
  path: string;
  apiName: string;
  providerSlug: string | null;
  status: number | null;
  ok: boolean;
  durationMs: number | null;
  requestHeaders: Record<string, string>;
  requestQuery: Record<string, string>;
  requestBody: string | null;
  responseHeaders: Record<string, string>;
  responseBody: string | null;
  responseContentType: string | null;
  responseBytes: number | null;
  error: string | null;
  createdAt: string;
}

export interface RequestSummary {
  id: number;
  method: string;
  url: string;
  apiName: string;
  providerSlug: string | null;
  status: number | null;
  ok: boolean;
  durationMs: number | null;
  createdAt: string;
}

export interface Scan {
  id: number;
  source: ScanSource;
  status: ScanStatus;
  scope: string;
  reposScanned: number;
  filesScanned: number;
  findingCount: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface Finding {
  id: number;
  scanId: number;
  providerSlug: string;
  providerName: string;
  severity: Severity;
  maskedValue: string;
  repo: string;
  filePath: string;
  line: number;
  snippet: string;
  status: FindingStatus;
  ruleId: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface GitHubConnection {
  connected: boolean;
  login: string | null;
  connectedAt: string | null;
  scopes: string | null;
}

export interface OverviewStats {
  openFindings: number;
  criticalFindings: number;
  resolvedThisMonth: number;
  scansRun: number;
  savedApis: number;
  credentials: number;
  requestsThisWeek: number;
  successRate: number | null;
  medianLatencyMs: number | null;
}

export interface ActivityItem {
  id: string;
  kind: "finding" | "request" | "scan" | "credential" | "saved-api";
  title: string;
  detail: string;
  at: string;
  tone: "neutral" | "positive" | "warning" | "critical";
}

export interface OverviewResponse {
  stats: OverviewStats;
  activity: ActivityItem[];
  exposureByProvider: { providerName: string; providerSlug: string; count: number }[];
  recentScans: Scan[];
  suggestions: Provider[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

export interface PlaygroundRequest {
  savedApiId?: number;
  providerSlug?: string;
  method: HttpMethod;
  path: string;
  query: { name: string; value: string }[];
  headers: { name: string; value: string }[];
  body: string | null;
  credentialId: number | null;
  saveHistory: boolean;
}

export interface PlaygroundResponse {
  ok: boolean;
  status: number | null;
  statusText: string | null;
  durationMs: number;
  responseHeaders: Record<string, string>;
  body: string;
  bodyBytes: number;
  contentType: string | null;
  truncated: boolean;
  requestId: number | null;
  error: string | null;
  warnings: string[];
}
