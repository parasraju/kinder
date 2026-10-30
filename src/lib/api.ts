import type {
  ApiCategory,
  CredentialSummary,
  Finding,
  FindingStatus,
  GitHubConnection,
  OverviewResponse,
  Paginated,
  PlaygroundRequest,
  PlaygroundResponse,
  Provider,
  RequestRecord,
  RequestSummary,
  SavedApi,
  Scan,
  User,
  UserPreferences,
} from "@shared/types";

export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`/api${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    if (
      response.status === 401 &&
      path !== "/auth/login" &&
      path !== "/auth/register" &&
      path !== "/auth/me" &&
      typeof window !== "undefined"
    ) {
      window.dispatchEvent(new CustomEvent("ka:unauthorized"));
    }
    const body = payload as { error?: { code?: string; message?: string; fields?: Record<string, string> } } | null;
    throw new ApiError(
      response.status,
      body?.error?.code ?? "request_failed",
      body?.error?.message ?? `Request failed with ${response.status}.`,
      body?.error?.fields,
    );
  }
  return payload as T;
}

const json = (body: unknown) => JSON.stringify(body);

export const authApi = {
  me: () => request<{ user: User | null }>("/auth/me"),
  login: (email: string, password: string) =>
    request<{ user: User }>("/auth/login", { method: "POST", body: json({ email, password }) }),
  register: (name: string, email: string, password: string) =>
    request<{ user: User }>("/auth/register", { method: "POST", body: json({ name, email, password }) }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  updateProfile: (name: string, email: string) =>
    request<{ user: User }>("/auth/profile", { method: "PATCH", body: json({ name, email }) }),
  updatePreferences: (prefs: Partial<UserPreferences>) =>
    request<{ preferences: UserPreferences }>("/auth/preferences", {
      method: "PATCH",
      body: json(prefs),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>("/auth/password", {
      method: "PUT",
      body: json({ currentPassword, newPassword }),
    }),
};

export const overviewApi = {
  get: () => request<OverviewResponse>("/overview"),
};

export const catalogApi = {
  list: () =>
    request<{ providers: Provider[]; categories: { key: ApiCategory; label: string }[] }>("/catalog"),
  detail: (slug: string) =>
    request<{ provider: Provider; saved: SavedApi | null }>(`/catalog/${slug}`),
};

export const savedApi = {
  list: () => request<{ items: SavedApi[] }>("/saved-apis"),
  addCatalog: (slug: string, notes?: string | null) =>
    request<{ item: SavedApi }>("/saved-apis", { method: "POST", body: json({ slug, notes }) }),
  addCustom: (input: { name: string; baseUrl: string; category?: string; notes?: string | null }) =>
    request<{ item: SavedApi }>("/saved-apis", { method: "POST", body: json(input) }),
  update: (id: number, input: { notes?: string | null; favorite?: boolean }) =>
    request<{ item: SavedApi }>(`/saved-apis/${id}`, { method: "PATCH", body: json(input) }),
  remove: (id: number) => request<void>(`/saved-apis/${id}`, { method: "DELETE" }),
};

export const credentialsApi = {
  list: () => request<{ items: CredentialSummary[] }>("/credentials"),
  create: (input: { providerSlug: string; label: string; secret: string }) =>
    request<{ item: CredentialSummary }>("/credentials", { method: "POST", body: json(input) }),
  update: (id: number, input: { label?: string; secret?: string }) =>
    request<{ item: CredentialSummary }>(`/credentials/${id}`, { method: "PATCH", body: json(input) }),
  remove: (id: number) => request<void>(`/credentials/${id}`, { method: "DELETE" }),
};

export const playgroundApi = {
  send: (input: PlaygroundRequest) =>
    request<PlaygroundResponse>("/playground", { method: "POST", body: json(input) }),
};

export interface HistoryFilters {
  q?: string;
  status?: string;
  provider?: string;
  limit?: number;
  offset?: number;
}

export const historyApi = {
  list: (filters: HistoryFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.status && filters.status !== "all") params.set("status", filters.status);
    if (filters.provider) params.set("provider", filters.provider);
    if (filters.limit) params.set("limit", String(filters.limit));
    if (filters.offset) params.set("offset", String(filters.offset));
    const query = params.toString();
    return request<Paginated<RequestSummary>>(`/history${query ? `?${query}` : ""}`);
  },
  detail: (id: number) => request<{ item: RequestRecord }>(`/history/${id}`),
  remove: (id: number) => request<void>(`/history/${id}`, { method: "DELETE" }),
  clear: () => request<{ deleted: number }>("/history", { method: "DELETE" }),
};

export interface FindingFilters {
  q?: string;
  status?: string;
  severity?: string;
  provider?: string;
  scanId?: number;
  limit?: number;
  offset?: number;
}

export interface FindingsResponse extends Paginated<Finding> {
  providers: { provider_slug: string; provider_name: string; count: number }[];
}

export const scansApi = {
  list: (limit = 25) => request<Paginated<Scan>>(`/scans?limit=${limit}`),
  get: (id: number) => request<{ scan: Scan }>(`/scans/${id}`),
  start: (input: { source: "demo" | "github" | "search"; repos?: string[] }) =>
    request<{ scan: Scan }>("/scans", { method: "POST", body: json(input) }),
  cancel: (id: number) => request<{ ok: boolean }>(`/scans/${id}/cancel`, { method: "POST" }),
  findings: (filters: FindingFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.status && filters.status !== "all") params.set("status", filters.status);
    if (filters.severity && filters.severity !== "all") params.set("severity", filters.severity);
    if (filters.provider) params.set("provider", filters.provider);
    if (filters.scanId) params.set("scanId", String(filters.scanId));
    if (filters.limit) params.set("limit", String(filters.limit));
    if (filters.offset) params.set("offset", String(filters.offset));
    const query = params.toString();
    return request<FindingsResponse>(`/scans/findings/list${query ? `?${query}` : ""}`);
  },
  updateFinding: (id: number, status: FindingStatus) =>
    request<{ item: Finding }>(`/scans/findings/${id}`, { method: "PATCH", body: json({ status }) }),
  reportFinding: (id: number) =>
    request<{ ok: boolean; issueUrl: string; issueNumber: number; item: Finding }>(
      `/scans/findings/${id}/report`,
      { method: "POST" },
    ),
};

export const integrationsApi = {
  github: () => request<GitHubConnection>("/integrations/github"),
  verifyGithub: (token: string) =>
    request<{ login: string; name: string | null; scopes: string | null; note: string | null }>(
      "/integrations/github/verify",
      { method: "POST", body: json({ token }) },
    ),
  connectGithub: (token: string) =>
    request<GitHubConnection>("/integrations/github", { method: "PUT", body: json({ token }) }),
  disconnectGithub: () => request<void>("/integrations/github", { method: "DELETE" }),
};

export const settingsApi = {
  summary: () =>
    request<{ scans: number; findings: number; requests: number; credentials: number; savedApis: number }>(
      "/settings/summary",
    ),
  resetWorkspace: () =>
    request<{ ok: boolean }>("/settings/workspace", {
      method: "DELETE",
      body: json({ confirm: "delete" }),
    }),
};
