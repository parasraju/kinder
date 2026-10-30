import type {
  CredentialSummary,
  Finding,
  RequestRecord,
  RequestSummary,
  SavedApi,
  Scan,
} from "@shared/types";
import { getProvider } from "@shared/catalog";

export interface ScanRow {
  id: number;
  source: string;
  status: string;
  scope: string;
  repos_scanned: number;
  files_scanned: number;
  finding_count: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface FindingRow {
  id: number;
  scan_id: number;
  provider_slug: string;
  provider_name: string;
  severity: string;
  masked_value: string;
  repo: string;
  file_path: string;
  line: number;
  snippet: string;
  status: string;
  rule_id: string;
  first_seen_at: string;
  last_seen_at: string;
  issue_url?: string | null;
  reported_at?: string | null;
}

export interface CredentialRow {
  id: number;
  provider_slug: string;
  label: string;
  hint: string;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}

export interface RequestRow {
  id: number;
  api_name: string;
  provider_slug: string | null;
  method: string;
  url: string;
  host: string;
  path: string;
  status: number | null;
  ok: number;
  duration_ms: number | null;
  request_headers: string;
  request_query: string;
  request_body: string | null;
  response_headers: string;
  response_body: string | null;
  response_content_type: string | null;
  response_bytes: number | null;
  error: string | null;
  created_at: string;
}

export interface SavedApiRow {
  id: number;
  slug: string | null;
  name: string;
  base_url: string;
  category: string;
  notes: string | null;
  favorite: number;
  created_at: string;
}

export function mapScan(row: ScanRow): Scan {
  return {
    id: row.id,
    source: row.source as Scan["source"],
    status: row.status as Scan["status"],
    scope: row.scope,
    reposScanned: row.repos_scanned,
    filesScanned: row.files_scanned,
    findingCount: row.finding_count,
    error: row.error,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export function mapFinding(row: FindingRow): Finding {
  return {
    id: row.id,
    scanId: row.scan_id,
    providerSlug: row.provider_slug,
    providerName: row.provider_name,
    severity: row.severity as Finding["severity"],
    maskedValue: row.masked_value,
    repo: row.repo,
    filePath: row.file_path,
    line: row.line,
    snippet: row.snippet,
    status: row.status as Finding["status"],
    ruleId: row.rule_id,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    issueUrl: row.issue_url ?? null,
    reportedAt: row.reported_at ?? null,
  };
}

export function mapCredential(row: CredentialRow): CredentialSummary {
  return {
    id: row.id,
    providerSlug: row.provider_slug,
    providerName: getProvider(row.provider_slug)?.name ?? row.provider_slug,
    label: row.label,
    hint: row.hint,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at,
  };
}

export function parseJsonObject(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      out[key] = typeof value === "string" ? value : String(value);
    }
    return out;
  } catch {
    return {};
  }
}

export function mapRequest(row: RequestRow): RequestRecord {
  return {
    id: row.id,
    method: row.method,
    url: row.url,
    host: row.host,
    path: row.path,
    apiName: row.api_name,
    providerSlug: row.provider_slug,
    status: row.status,
    ok: row.ok === 1,
    durationMs: row.duration_ms,
    requestHeaders: parseJsonObject(row.request_headers),
    requestQuery: parseJsonObject(row.request_query),
    requestBody: row.request_body,
    responseHeaders: parseJsonObject(row.response_headers),
    responseBody: row.response_body,
    responseContentType: row.response_content_type,
    responseBytes: row.response_bytes,
    error: row.error,
    createdAt: row.created_at,
  };
}

export function mapRequestSummary(row: RequestRow): RequestSummary {
  return {
    id: row.id,
    method: row.method,
    url: row.url,
    apiName: row.api_name,
    providerSlug: row.provider_slug,
    status: row.status,
    ok: row.ok === 1,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  };
}

export function mapSavedApi(row: SavedApiRow): SavedApi {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    baseUrl: row.base_url,
    category: row.category as SavedApi["category"],
    notes: row.notes,
    favorite: row.favorite === 1,
    createdAt: row.created_at,
    custom: row.slug === null,
  };
}
