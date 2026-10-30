const GITHUB_API = "https://api.github.com";
const USER_AGENT = "KinderApply/1.0";

export class GitHubError extends Error {
  status: number;
  rateLimited: boolean;

  constructor(message: string, status: number, rateLimited = false) {
    super(message);
    this.status = status;
    this.rateLimited = rateLimited;
  }
}

interface GitHubRequestOptions {
  method?: string;
  accept?: string;
  timeoutMs?: number;
}

async function githubRequest(
  token: string,
  pathName: string,
  options: GitHubRequestOptions = {},
): Promise<Response> {
  const { method = "GET", accept = "application/vnd.github+json", timeoutMs = 15_000 } = options;
  let response: Response;
  try {
    response = await fetch(`${GITHUB_API}${pathName}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: accept,
        "User-Agent": USER_AGENT,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new GitHubError("Could not reach GitHub. Check your connection and retry.", 502);
  }
  if (response.ok) return response;
  if (response.status === 401) {
    throw new GitHubError("GitHub rejected the token. It may be expired or revoked.", 401);
  }
  if (response.status === 403 || response.status === 429) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    const limited = remaining === "0" || response.status === 429;
    throw new GitHubError(
      limited
        ? "GitHub rate limit reached. Wait a few minutes before scanning again."
        : "GitHub refused the request. Check the token's repository permissions.",
      403,
      limited,
    );
  }
  if (response.status === 404) {
    throw new GitHubError("GitHub resource not found. The repository may be empty or private.", 404);
  }
  throw new GitHubError(`GitHub returned ${response.status}.`, response.status);
}

export interface GitHubIdentity {
  login: string;
  name: string | null;
  scopes: string | null;
}

export async function verifyGithubToken(token: string): Promise<GitHubIdentity> {
  const response = await githubRequest(token, "/user");
  const body = (await response.json()) as { login?: string; name?: string | null };
  if (!body.login) throw new GitHubError("GitHub did not return an account for this token.", 502);
  return {
    login: body.login,
    name: body.name ?? null,
    scopes: response.headers.get("x-oauth-scopes"),
  };
}

export interface GitHubRepo {
  fullName: string;
  defaultBranch: string;
  private: boolean;
  updatedAt: string;
  sizeKb: number;
}

export async function listUserRepos(token: string, limit = 20): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = [];
  for (let page = 1; page <= 3 && repos.length < limit; page += 1) {
    const response = await githubRequest(
      token,
      `/user/repos?per_page=50&page=${page}&sort=updated&affiliation=owner,collaborator`,
    );
    const body = (await response.json()) as {
      full_name: string;
      default_branch: string;
      private: boolean;
      updated_at: string;
      size: number;
    }[];
    if (!Array.isArray(body) || body.length === 0) break;
    for (const repo of body) {
      repos.push({
        fullName: repo.full_name,
        defaultBranch: repo.default_branch || "main",
        private: Boolean(repo.private),
        updatedAt: repo.updated_at,
        sizeKb: repo.size ?? 0,
      });
      if (repos.length >= limit) break;
    }
  }
  return repos;
}

export async function getRepo(
  token: string,
  fullName: string,
): Promise<{ defaultBranch: string; private: boolean } | null> {
  try {
    const response = await githubRequest(token, `/repos/${fullName}`);
    const body = (await response.json()) as { default_branch?: string; private?: boolean };
    return {
      defaultBranch: body.default_branch || "main",
      private: Boolean(body.private),
    };
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) return null;
    throw error;
  }
}

export interface TreeEntry {
  path: string;
  size: number;
  type: string;
}

export async function getRepoTree(
  token: string,
  fullName: string,
  branch: string,
): Promise<{ entries: TreeEntry[]; truncated: boolean }> {
  const response = await githubRequest(
    token,
    `/repos/${fullName}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  );
  const body = (await response.json()) as {
    tree?: { path: string; size?: number; type: string }[];
    truncated?: boolean;
  };
  const entries = (body.tree ?? [])
    .filter((entry) => entry.type === "blob")
    .map((entry) => ({ path: entry.path, size: entry.size ?? 0, type: entry.type }));
  return { entries, truncated: Boolean(body.truncated) };
}

export async function getFileText(
  token: string,
  fullName: string,
  filePath: string,
  ref: string,
  maxBytes: number,
): Promise<string | null> {
  const response = await githubRequest(
    token,
    `/repos/${fullName}/contents/${filePath.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`,
    { accept: "application/vnd.github.raw", timeoutMs: 20_000 },
  );
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) return null;
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}

/*──────────────────────────────────────────────────────────────────────────────
 * GitHub Code Search — scan public repositories across all of GitHub
 *────────────────────────────────────────────────────────────────────────────*/

/** Curated search queries that reliably surface leaked credentials. */
export const CODE_SEARCH_QUERIES: string[] = [
  // ── env var queries ───────────────────────────────────────────────────
  '"OPENAI_API_KEY" extension:env',
  '"OPENAI_API_KEY" extension:json',
  '"ANTHROPIC_API_KEY" extension:env',
  '"ANTHROPIC_API_KEY" extension:json',
  '"HUGGINGFACE_TOKEN" extension:env',
  '"HF_TOKEN" extension:env',
  '"STRIPE_SECRET_KEY" extension:env',
  '"STRIPE_API_KEY" extension:env',
  '"GITHUB_TOKEN" extension:env',
  '"GITLAB_TOKEN" extension:env',
  '"NOTION_TOKEN" extension:env',
  '"LINEAR_API_KEY" extension:env',
  '"SENDGRID_API_KEY" extension:env',
  '"TELEGRAM_BOT_TOKEN" extension:env',
  '"DISCORD_TOKEN" extension:env',
  '"SLACK_BOT_TOKEN" extension:env',
  '"MAILGUN_API_KEY" extension:env',
  '"AWS_SECRET_ACCESS_KEY" extension:env',
  '"GOOGLE_API_KEY" extension:env',
  '"GEMINI_API_KEY" extension:env',
  '"XAI_API_KEY" extension:env',
  '"DEEPSEEK_API_KEY" extension:env',
  '"GROQ_API_KEY" extension:env',
  '"TOGETHER_API_KEY" extension:env',
  '"REPLICATE_API_TOKEN" extension:env',
  '"PERPLEXITY_API_KEY" extension:env',
  '"OPENROUTER_API_KEY" extension:env',
  // ── prefix queries ────────────────────────────────────────────────────
  'sk- AND "sk-" extension:env',
  'sk- AND "sk-" extension:json',
  'sk- AND "sk-" extension:yaml',
  'sk- AND "sk-" extension:py',
  'sk- AND "sk-" extension:js',
  'hf_ AND "hf_" extension:env',
  'hf_ AND "hf_" extension:json',
  'sk-ant- AND "sk-ant-" extension:env',
  'sk-ant- AND "sk-ant-" extension:json',
  "sk_live_ extension:env",
  "rk_live_ extension:env",
  '"ghp_" AND ghp_ extension:env',
  '"ghp_" AND ghp_ extension:json',
  "AIza extension:env",
  "AIza extension:json",
  '"SG." AND SG. extension:env',
  "glpat- extension:env",
  "secret_ AND notion extension:env",
  "lin_api_ extension:env",
  'xoxb- AND "xoxb-" extension:env',
  '"AKIA" AND secret extension:env',
  // ── filename queries ──────────────────────────────────────────────────
  '"sk-" filename:.env',
  '"sk-" filename:.env.local',
  '"sk-" filename:.env.production',
  '"hf_" filename:.env',
  '"ghp_" filename:.env',
  '"AIza" filename:.env',
  '"api_key" filename:.env',
  '"secret" filename:.env',
  '"token" filename:.env',
];

export interface CodeSearchItem {
  repo: string;
  repoUrl: string;
  owner: string;
  path: string;
  htmlUrl: string;
  defaultBranch: string;
  sha: string;
}

export interface CodeSearchResult {
  totalCount: number;
  items: CodeSearchItem[];
  incomplete: boolean;
}

/**
 * Search for code across all of GitHub using the Code Search API.
 * Returns structured results with repo/file metadata.
 */
export async function searchCode(
  token: string,
  query: string,
  page = 1,
  perPage = 30,
): Promise<CodeSearchResult | null> {
  // A rate limit is handled by the scanner as a failed scan with a useful
  // message. Do not silently turn API errors into an empty successful scan.
  const response = await githubRequest(
    token,
    `/search/code?q=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}`,
    { timeoutMs: 20_000 },
  );

  const body = (await response.json()) as {
    total_count?: number;
    incomplete_results?: boolean;
    items?: {
      name: string;
      path: string;
      html_url: string;
      sha?: string;
      repository: {
        full_name: string;
        html_url: string;
        owner: { login: string };
        default_branch?: string;
      };
    }[];
  };

  const items: CodeSearchItem[] = (body.items ?? []).map((item) => {
    let sha = "";
    if (item.html_url.includes("/blob/")) {
      sha = item.html_url.split("/blob/")[1]?.split("/")[0] ?? "";
    }
    return {
      repo: item.repository.full_name,
      repoUrl: item.repository.html_url,
      owner: item.repository.owner.login,
      path: item.path,
      htmlUrl: item.html_url,
      defaultBranch: item.repository.default_branch ?? "main",
      sha: item.sha ?? sha,
    };
  });

  return {
    totalCount: body.total_count ?? 0,
    items,
    incomplete: Boolean(body.incomplete_results),
  };
}

/**
 * Fetch raw file content from raw.githubusercontent.com (no API rate cost).
 */
export async function getRawFileContent(
  repo: string,
  ref: string,
  filePath: string,
  maxBytes = 200_000,
): Promise<string | null> {
  const encodedRepo = repo.split("/").map(encodeURIComponent).join("/");
  const encodedRef = encodeURIComponent(ref);
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  const url = `https://raw.githubusercontent.com/${encodedRepo}/${encodedRef}/${encodedPath}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) return null;
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}

/**
 * Create an issue on a GitHub repository using the user's token.
 */
export async function createGithubIssue(
  token: string,
  repo: string,
  title: string,
  body: string,
): Promise<{ id: number; number: number; htmlUrl: string }> {
  let response: Response;
  try {
    response = await fetch(`${GITHUB_API}/repos/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ title, body }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new GitHubError("Could not reach GitHub. Check your network connection and retry.", 502);
  }

  const data = (await response.json().catch(() => ({}))) as {
    message?: string;
    id?: number;
    number?: number;
    html_url?: string;
  };

  if (response.ok && data.html_url && data.number) {
    return {
      id: data.id ?? data.number,
      number: data.number,
      htmlUrl: data.html_url,
    };
  }

  if (response.status === 401) {
    throw new GitHubError("GitHub rejected your token. Check your token in Settings → Integrations.", 401);
  }
  if (response.status === 403 || response.status === 429) {
    const isRateLimited = response.headers.get("x-ratelimit-remaining") === "0" || response.status === 429;
    let message = data.message || "GitHub refused to create an issue.";
    if (message.toLowerCase().includes("resource not accessible")) {
      message =
        "Resource not accessible with this token. GitHub requires a token with 'public_repo' or 'repo' scope (or fine-grained Issues write permission).";
    }
    throw new GitHubError(
      message,
      response.status,
      isRateLimited,
    );
  }
  if (response.status === 404) {
    throw new GitHubError(`Repository "${repo}" not found or your token cannot access it.`, 404);
  }
  if (response.status === 410) {
    throw new GitHubError(`Issues are disabled in repository "${repo}".`, 410);
  }
  if (response.status === 422) {
    throw new GitHubError(data.message || "GitHub rejected the issue contents.", 422);
  }

  throw new GitHubError(
    data.message || `GitHub returned ${response.status} when creating the issue.`,
    response.status,
  );
}
