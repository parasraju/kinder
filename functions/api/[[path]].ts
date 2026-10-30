import { PROVIDERS, CATEGORY_LABELS } from "../../shared/catalog";
import type { Finding, FindingStatus, Provider } from "../../shared/types";

interface Env {
  BACKEND_URL?: string;
  GITHUB_TOKEN?: string;
}

// In-memory findings store for Cloudflare edge deployment
const findingsStore: Finding[] = [
  {
    id: 1,
    scanId: 1,
    providerSlug: "openai",
    providerName: "OpenAI",
    severity: "critical",
    maskedValue: "sk-p••••••••••tcwA",
    repo: "vishubth/AI-Powered-Document-Intelligence-Engine",
    filePath: ".env",
    line: 1,
    snippet: "OPENAI_API_KEY=sk-p••••••••••tcwA",
    status: "open",
    ruleId: "openai-key",
    firstSeenAt: "2026-10-30T06:35:00.000Z",
    lastSeenAt: "2026-10-30T09:00:00.000Z",
    issueUrl: null,
    reportedAt: null,
  },
  {
    id: 2,
    scanId: 1,
    providerSlug: "stripe",
    providerName: "Stripe",
    severity: "critical",
    maskedValue: "sk_l••••••••••••4Xq2",
    repo: "northwind-labs/checkout-api",
    filePath: "src/payments/stripeClient.ts",
    line: 14,
    snippet: 'const stripe = new Stripe(process.env.STRIPE_SECRET ?? "sk_l••••••••••••4Xq2");',
    status: "open",
    ruleId: "stripe-key",
    firstSeenAt: "2026-10-28T12:00:00.000Z",
    lastSeenAt: "2026-10-28T12:00:00.000Z",
    issueUrl: null,
    reportedAt: null,
  },
  {
    id: 3,
    scanId: 2,
    providerSlug: "github",
    providerName: "GitHub",
    severity: "critical",
    maskedValue: "ghp_••••••••••••Q7r8",
    repo: "northwind-labs/infra-scripts",
    filePath: "scripts/release.ps1",
    line: 7,
    snippet: '$env:GITHUB_TOKEN = "ghp_••••••••••••Q7r8"',
    status: "acknowledged",
    ruleId: "github-key",
    firstSeenAt: "2026-10-25T10:00:00.000Z",
    lastSeenAt: "2026-10-25T10:00:00.000Z",
    issueUrl: null,
    reportedAt: null,
  },
  {
    id: 4,
    scanId: 2,
    providerSlug: "cloudflare",
    providerName: "Cloudflare",
    severity: "high",
    maskedValue: "mF8k••••••••••••O8p",
    repo: "northwind-labs/edge-proxy",
    filePath: "wrangler.toml",
    line: 22,
    snippet: 'CLOUDFLARE_API_TOKEN = "mF8k••••••••••••O8p"',
    status: "open",
    ruleId: "cloudflare-key",
    firstSeenAt: "2026-10-25T10:00:00.000Z",
    lastSeenAt: "2026-10-25T10:00:00.000Z",
    issueUrl: null,
    reportedAt: null,
  },
];

const DEMO_USER = {
  id: 1,
  email: "demo@kinderapply.dev",
  name: "Demo Engineer",
  createdAt: "2026-10-25T00:00:00.000Z",
  preferences: {
    theme: "light",
    density: "comfortable",
    reduceMotion: false,
    defaultCategory: "all",
  },
};

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function hasSession(request: Request): boolean {
  const cookie = request.headers.get("Cookie") || "";
  return cookie.includes("kinder_session=");
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // 1. If an external backend is configured, proxy to it directly
  if (env.BACKEND_URL) {
    const url = new URL(request.url);
    const backendUrl = new URL(env.BACKEND_URL.endsWith("/") ? env.BACKEND_URL : `${env.BACKEND_URL}/`);
    const targetPath = url.pathname.startsWith("/") ? url.pathname.slice(1) : url.pathname;
    const targetUrl = new URL(targetPath + url.search, backendUrl);

    const reqHeaders = new Headers(request.headers);
    reqHeaders.set("X-Forwarded-Host", url.host);
    reqHeaders.set("X-Forwarded-Proto", url.protocol.replace(":", ""));

    return fetch(targetUrl.toString(), {
      method: request.method,
      headers: reqHeaders,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
      redirect: "follow",
    });
  }

  // 2. Otherwise run the built-in Serverless Edge API on Cloudflare Pages
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, "") || "/";

  // Health
  if (path === "/health") {
    return jsonResponse({ ok: true, service: "kinder-edge", time: new Date().toISOString() });
  }

  // Auth: me
  if (path === "/auth/me") {
    if (hasSession(request)) {
      return jsonResponse({ user: DEMO_USER });
    }
    return jsonResponse({ error: { code: "unauthorized", message: "Sign in to continue." } }, 401);
  }

  // Auth: login
  if (path === "/auth/login" && request.method === "POST") {
    let body: { email?: string; password?: string } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      // ignore
    }
    const user = {
      ...DEMO_USER,
      email: body.email?.trim() || DEMO_USER.email,
    };
    return jsonResponse(
      { user },
      200,
      {
        "Set-Cookie": "kinder_session=demo; Path=/; HttpOnly; SameSite=Lax; Max-Age=1209600",
      },
    );
  }

  // Auth: register
  if (path === "/auth/register" && request.method === "POST") {
    let body: { name?: string; email?: string } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      // ignore
    }
    const user = {
      ...DEMO_USER,
      name: body.name?.trim() || DEMO_USER.name,
      email: body.email?.trim() || DEMO_USER.email,
    };
    return jsonResponse(
      { user },
      201,
      {
        "Set-Cookie": "kinder_session=demo; Path=/; HttpOnly; SameSite=Lax; Max-Age=1209600",
      },
    );
  }

  // Auth: logout
  if (path === "/auth/logout" && request.method === "POST") {
    return new Response(null, {
      status: 204,
      headers: {
        "Set-Cookie": "kinder_session=; Path=/; HttpOnly; Max-Age=0",
      },
    });
  }

  // Auth: preferences
  if (path === "/auth/preferences" && request.method === "PATCH") {
    return jsonResponse({ preferences: DEMO_USER.preferences });
  }

  // Auth: profile
  if (path === "/auth/profile" && request.method === "PATCH") {
    return jsonResponse({ user: DEMO_USER });
  }

  // Overview
  if (path === "/overview") {
    const openCount = findingsStore.filter((f) => f.status === "open").length;
    const criticalCount = findingsStore.filter((f) => f.status === "open" && f.severity === "critical").length;
    return jsonResponse({
      stats: {
        openFindings: openCount,
        criticalFindings: criticalCount,
        totalScans: 2,
        savedApis: 4,
        requestsTotal: 12,
        credentialsStored: 3,
      },
      activity: [
        {
          kind: "finding",
          title: "Critical: OpenAI key exposure",
          subtitle: "vishubth/AI-Powered-Document-Intelligence-Engine · .env:1",
          tone: "critical",
          timestamp: "2026-10-30T09:00:00.000Z",
        },
        {
          kind: "finding",
          title: "Critical: Stripe live key exposure",
          subtitle: "northwind-labs/checkout-api · stripeClient.ts:14",
          tone: "critical",
          timestamp: "2026-10-28T12:00:00.000Z",
        },
        {
          kind: "scan",
          title: "Public code search completed",
          subtitle: "Found 1 exposed key",
          tone: "warning",
          timestamp: "2026-10-30T09:00:00.000Z",
        },
      ],
      exposureByProvider: [
        { providerSlug: "openai", providerName: "OpenAI", count: 1 },
        { providerSlug: "stripe", providerName: "Stripe", count: 1 },
        { providerSlug: "cloudflare", providerName: "Cloudflare", count: 1 },
      ],
      recentScans: [
        {
          id: 1,
          source: "search",
          status: "complete",
          scope: "GitHub public code search",
          reposScanned: 1,
          filesScanned: 1,
          findingCount: 1,
          error: null,
          startedAt: "2026-10-30T06:30:00.000Z",
          finishedAt: "2026-10-30T06:30:15.000Z",
        },
        {
          id: 2,
          source: "demo",
          status: "complete",
          scope: "Demo workspace · 3 repositories",
          reposScanned: 3,
          filesScanned: 41,
          findingCount: 2,
          error: null,
          startedAt: "2026-10-28T10:00:00.000Z",
          finishedAt: "2026-10-28T10:00:04.000Z",
        },
      ],
      suggestions: [],
    });
  }

  // Catalog
  if (path === "/catalog") {
    const categories = Object.entries(CATEGORY_LABELS).map(([key, label]) => ({ key, label }));
    return jsonResponse({ providers: PROVIDERS, categories });
  }

  if (path.startsWith("/catalog/")) {
    const slug = path.replace(/^\/catalog\//, "").split("/")[0];
    const provider = PROVIDERS.find((p) => p.slug === slug);
    if (!provider) {
      return jsonResponse({ error: { code: "not_found", message: "Provider not found" } }, 404);
    }
    return jsonResponse({ provider, saved: null });
  }

  // Scans
  if (path === "/scans" && request.method === "GET") {
    return jsonResponse({
      items: [
        {
          id: 1,
          source: "search",
          status: "complete",
          scope: "GitHub public code search",
          reposScanned: 1,
          filesScanned: 1,
          findingCount: 1,
          error: null,
          startedAt: "2026-10-30T06:30:00.000Z",
          finishedAt: "2026-10-30T06:30:15.000Z",
        },
        {
          id: 2,
          source: "demo",
          status: "complete",
          scope: "Demo workspace · 3 repositories",
          reposScanned: 3,
          filesScanned: 41,
          findingCount: 2,
          error: null,
          startedAt: "2026-10-28T10:00:00.000Z",
          finishedAt: "2026-10-28T10:00:04.000Z",
        },
      ],
      total: 2,
      limit: 10,
      offset: 0,
    });
  }

  if (path === "/scans" && request.method === "POST") {
    return jsonResponse({
      scan: {
        id: Date.now(),
        source: "demo",
        status: "complete",
        scope: "Demo scan",
        reposScanned: 1,
        filesScanned: 5,
        findingCount: 1,
        error: null,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      },
    }, 201);
  }

  // Findings list
  if (path.startsWith("/scans/findings/list")) {
    const providers = [
      { provider_slug: "openai", provider_name: "OpenAI", count: 1 },
      { provider_slug: "stripe", provider_name: "Stripe", count: 1 },
      { provider_slug: "github", provider_name: "GitHub", count: 1 },
      { provider_slug: "cloudflare", provider_name: "Cloudflare", count: 1 },
    ];
    return jsonResponse({
      items: findingsStore,
      total: findingsStore.length,
      limit: 20,
      offset: 0,
      providers,
    });
  }

  // Finding report issue (GitHub integration!)
  const reportMatch = path.match(/^\/scans\/findings\/(\d+)\/report$/);
  if (reportMatch && request.method === "POST") {
    const findingId = Number(reportMatch[1]);
    const finding = findingsStore.find((f) => f.id === findingId);
    if (!finding) {
      return jsonResponse({ error: { code: "not_found", message: "Finding not found" } }, 404);
    }

    let body: { token?: string } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      // ignore
    }

    const token = body.token?.trim() || env.GITHUB_TOKEN;
    if (!token) {
      return jsonResponse(
        {
          error: {
            code: "token_required",
            message: "Please enter your GitHub Personal Access Token to create the issue.",
          },
        },
        400,
      );
    }

    const title = `Security Alert: Potential ${finding.providerName} key exposure in \`${finding.filePath}\``;
    const issueBody = [
      `### ⚠️ Potential Secret Exposure Detected`,
      ``,
      `Kinder detected what appears to be an exposed **${finding.providerName}** credential in this repository:`,
      ``,
      `- **Repository:** \`${finding.repo}\``,
      `- **File:** \`${finding.filePath}\` (line ${finding.line})`,
      `- **Severity:** **${finding.severity.toUpperCase()}**`,
      `- **Rule:** \`${finding.ruleId}\``,
      `- **Masked Value:** \`${finding.maskedValue}\``,
      ``,
      `#### 📋 Redacted Context`,
      `\`\`\``,
      finding.snippet,
      `\`\`\``,
      ``,
      `#### 🛡️ Recommended Remediation Steps`,
      `1. **Rotate the credential immediately:** Invalidate the exposed key in your ${finding.providerName} developer console and issue a new secret.`,
      `2. **Remove the secret from Git history:** Simply editing or deleting the file in subsequent commits still leaves the secret exposed in the commit history. Consider using [git-filter-repo](https://github.com/newren/git-filter-repo) or [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/) to remove it from past commits.`,
      `3. **Store in Environment Variables:** Move sensitive keys to uncommitted environment files (ensure \`.env\` is listed in \`.gitignore\`) or a secret manager.`,
      ``,
      `---`,
      `*Reported via [Kinder](https://github.com/parasraju/kinder) — key hygiene & workspace security.*`,
    ].join("\n");

    try {
      const ghRes = await fetch(`https://api.github.com/repos/${finding.repo}/issues`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "KinderApply/1.0",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ title, body: issueBody }),
      });

      const ghData = (await ghRes.json().catch(() => ({}))) as {
        html_url?: string;
        number?: number;
        message?: string;
      };

      if (!ghRes.ok || !ghData.html_url) {
        let msg = ghData.message || `GitHub returned ${ghRes.status}`;
        if (msg.toLowerCase().includes("resource not accessible")) {
          msg = "Resource not accessible with this token. GitHub requires a token with 'public_repo' or 'repo' scope (or fine-grained Issues write access).";
        }
        return jsonResponse(
          { error: { code: "github_error", message: msg } },
          ghRes.status >= 400 && ghRes.status < 500 ? ghRes.status : 502,
        );
      }

      finding.issueUrl = ghData.html_url;
      finding.reportedAt = new Date().toISOString();

      return jsonResponse({
        ok: true,
        issueUrl: ghData.html_url,
        issueNumber: ghData.number,
        item: finding,
      });
    } catch (err) {
      return jsonResponse(
        { error: { code: "network_error", message: err instanceof Error ? err.message : "Could not reach GitHub." } },
        502,
      );
    }
  }

  // Update finding status
  const findingPatchMatch = path.match(/^\/scans\/findings\/(\d+)$/);
  if (findingPatchMatch && request.method === "PATCH") {
    const findingId = Number(findingPatchMatch[1]);
    const finding = findingsStore.find((f) => f.id === findingId);
    if (!finding) {
      return jsonResponse({ error: { code: "not_found", message: "Finding not found" } }, 404);
    }
    let body: { status?: FindingStatus } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      // ignore
    }
    if (body.status) finding.status = body.status;
    return jsonResponse({ item: finding });
  }

  // Integrations: github
  if (path === "/integrations/github") {
    return jsonResponse({
      connected: true,
      login: "parasraju",
      connectedAt: "2026-10-30T00:00:00.000Z",
      scopes: "repo, admin:org, admin:public_key",
    });
  }

  // Saved APIs
  if (path === "/saved-apis") {
    return jsonResponse({ items: [] });
  }

  // Credentials
  if (path === "/credentials") {
    return jsonResponse({ items: [] });
  }

  // History
  if (path.startsWith("/history")) {
    return jsonResponse({ items: [], total: 0, limit: 25, offset: 0 });
  }

  // Settings summary
  if (path === "/settings/summary") {
    return jsonResponse({
      scans: 2,
      findings: findingsStore.length,
      requests: 12,
      credentials: 3,
      savedApis: 4,
    });
  }

  // Fallback 404
  return jsonResponse({ error: { code: "not_found", message: "Route not found." } }, 404);
};
