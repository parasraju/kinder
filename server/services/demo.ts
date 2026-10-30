import { PROVIDERS, getProvider } from "@shared/catalog";
import type { ApiCategory } from "@shared/types";
import { all, get, nowIso, run } from "../db";
import { hashPassword } from "../crypto";
import type { ScanRow } from "../mappers";

export const DEMO_EMAIL = "demo@kinderapply.dev";
export const DEMO_PASSWORD = "kinderdemo123";

function daysAgo(days: number, hours = 0): string {
  return new Date(Date.now() - days * 86_400_000 - hours * 3_600_000).toISOString();
}

export function ensureDemoUser(): void {
  const existing = get<{ id: number }>("SELECT id FROM users WHERE email = ?", DEMO_EMAIL);
  if (existing) {
    if (all<{ id: number }>("SELECT id FROM scans WHERE user_id = ?", existing.id).length === 0) {
      seedWorkspace(existing.id);
    }
    return;
  }
  const now = nowIso();
  const result = run(
    "INSERT INTO users (email, name, password_hash, preferences, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    DEMO_EMAIL,
    "Demo Engineer",
    hashPassword(DEMO_PASSWORD),
    JSON.stringify({ theme: "light", density: "comfortable", reduceMotion: false, defaultCategory: "all" }),
    now,
    now,
  );
  seedWorkspace(Number(result.lastInsertRowid));
}

/**
 * Seed a realistic workspace so the dashboard is explorable without external
 * credentials. Every demo finding is clearly marked through its scan source.
 */
export function seedWorkspace(userId: number): void {
  const scan1 = run(
    `INSERT INTO scans (user_id, source, status, scope, repos_scanned, files_scanned, finding_count, error, started_at, finished_at)
     VALUES (?, 'demo', 'complete', 'Demo workspace · 4 repositories', 4, 62, 5, NULL, ?, ?)`,
    userId,
    daysAgo(2),
    daysAgo(2, -0.12),
  );
  const scan1Id = Number(scan1.lastInsertRowid);

  const scan2 = run(
    `INSERT INTO scans (user_id, source, status, scope, repos_scanned, files_scanned, finding_count, error, started_at, finished_at)
     VALUES (?, 'demo', 'complete', 'Demo workspace · 2 repositories', 2, 28, 3, NULL, ?, ?)`,
    userId,
    daysAgo(9),
    daysAgo(9, -0.08),
  );
  const scan2Id = Number(scan2.lastInsertRowid);

  run(
    `INSERT INTO scans (user_id, source, status, scope, repos_scanned, files_scanned, finding_count, error, started_at, finished_at)
     VALUES (?, 'demo', 'complete', 'Demo workspace · 3 repositories', 3, 44, 0, NULL, ?, ?)`,
    userId,
    daysAgo(16),
    daysAgo(16, -0.1),
  );

  const findings: {
    scanId: number;
    slug: string;
    severity: string;
    masked: string;
    hash: string;
    repo: string;
    file: string;
    line: number;
    snippet: string;
    status: string;
    days: number;
  }[] = [
    {
      scanId: scan1Id,
      slug: "stripe",
      severity: "critical",
      masked: "sk_l••••••••••••4Xq2",
      hash: "demo-hash-stripe-1",
      repo: "northwind-labs/checkout-api",
      file: "src/payments/stripeClient.ts",
      line: 14,
      snippet: "const stripe = new Stripe(process.env.STRIPE_SECRET ?? \"sk_l••••••••••••4Xq2\");",
      status: "open",
      days: 2,
    },
    {
      scanId: scan1Id,
      slug: "openai",
      severity: "critical",
      masked: "sk-p••••••••••••G0sA",
      hash: "demo-hash-openai-1",
      repo: "northwind-labs/support-copilot",
      file: ".env.local",
      line: 3,
      snippet: "OPENAI_API_KEY=sk-p••••••••••••G0sA",
      status: "open",
      days: 2,
    },
    {
      scanId: scan1Id,
      slug: "github",
      severity: "critical",
      masked: "ghp_••••••••••••Q7r8",
      hash: "demo-hash-github-1",
      repo: "northwind-labs/infra-scripts",
      file: "scripts/release.ps1",
      line: 7,
      snippet: "$env:GITHUB_TOKEN = \"ghp_••••••••••••Q7r8\"",
      status: "acknowledged",
      days: 2,
    },
    {
      scanId: scan1Id,
      slug: "cloudflare",
      severity: "high",
      masked: "mF8k••••••••••••O8p",
      hash: "demo-hash-cloudflare-1",
      repo: "northwind-labs/edge-proxy",
      file: "wrangler.toml",
      line: 22,
      snippet: "CLOUDFLARE_API_TOKEN = \"mF8k••••••••••••O8p\"",
      status: "open",
      days: 2,
    },
    {
      scanId: scan2Id,
      slug: "resend",
      severity: "high",
      masked: "re_9••••••••••••Lm4",
      hash: "demo-hash-resend-1",
      repo: "northwind-labs/notify-service",
      file: "src/email.ts",
      line: 9,
      snippet: "const key = \"re_9••••••••••••Lm4\";",
      status: "resolved",
      days: 9,
    },
    {
      scanId: scan2Id,
      slug: "mapbox",
      severity: "medium",
      masked: "sk.ey••••••••••••J3n",
      hash: "demo-hash-mapbox-1",
      repo: "northwind-labs/storefront",
      file: "src/map/config.ts",
      line: 5,
      snippet: "export const MAPBOX_SECRET = \"sk.ey••••••••••••J3n\";",
      status: "open",
      days: 9,
    },
    {
      scanId: scan2Id,
      slug: "openweather",
      severity: "low",
      masked: "8c1f••••••••••••a9d4",
      hash: "demo-hash-weather-1",
      repo: "northwind-labs/storefront",
      file: "src/lib/weather.ts",
      line: 18,
      snippet: "const appid = process.env.WEATHER_KEY ?? \"8c1f••••••••••••a9d4\";",
      status: "dismissed",
      days: 9,
    },
  ];

  for (const f of findings) {
    const provider = getProvider(f.slug);
    const firstSeen = daysAgo(f.days);
    run(
      `INSERT INTO findings
        (user_id, scan_id, provider_slug, provider_name, severity, masked_value, value_hash, repo, file_path, line, snippet, rule_id, status, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      userId,
      f.scanId,
      f.slug,
      provider?.name ?? f.slug,
      f.severity,
      f.masked,
      f.hash,
      f.repo,
      f.file,
      f.line,
      f.snippet,
      `${f.slug}-key`,
      f.status,
      firstSeen,
      firstSeen,
    );
  }

  const saved: { slug: string; notes: string; favorite: number; days: number }[] = [
    { slug: "stripe", notes: "Used by checkout-api. Rotate quarterly.", favorite: 1, days: 21 },
    { slug: "openai", notes: "Support copilot and evals.", favorite: 1, days: 21 },
    { slug: "resend", notes: "Transactional email for notify-service.", favorite: 0, days: 18 },
    { slug: "github", notes: "Fine-grained token for CI release jobs.", favorite: 0, days: 12 },
  ];
  for (const s of saved) {
    const provider = getProvider(s.slug);
    if (!provider) continue;
    run(
      `INSERT INTO saved_apis (user_id, slug, name, base_url, category, notes, favorite, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      userId,
      provider.slug,
      provider.name,
      provider.baseUrl,
      provider.category satisfies ApiCategory,
      s.notes,
      s.favorite,
      daysAgo(s.days),
    );
  }

  const requests: {
    api: string;
    slug: string | null;
    method: string;
    url: string;
    host: string;
    path: string;
    status: number;
    ok: number;
    duration: number;
    body: string;
    contentType: string;
    days: number;
    hours: number;
  }[] = [
    {
      api: "OpenAI",
      slug: "openai",
      method: "GET",
      url: "https://api.openai.com/v1/models",
      host: "api.openai.com",
      path: "/v1/models",
      status: 200,
      ok: 1,
      duration: 284,
      body: '{\n  "object": "list",\n  "data": [\n    { "id": "gpt-4.1-mini", "object": "model", "owned_by": "system" },\n    { "id": "gpt-4.1", "object": "model", "owned_by": "system" }\n  ]\n}',
      contentType: "application/json",
      days: 0,
      hours: 2,
    },
    {
      api: "Stripe",
      slug: "stripe",
      method: "GET",
      url: "https://api.stripe.com/v1/balance",
      host: "api.stripe.com",
      path: "/v1/balance",
      status: 200,
      ok: 1,
      duration: 412,
      body: '{\n  "object": "balance",\n  "available": [{ "amount": 1842500, "currency": "usd" }],\n  "livemode": true\n}',
      contentType: "application/json",
      days: 0,
      hours: 5,
    },
    {
      api: "Resend",
      slug: "resend",
      method: "GET",
      url: "https://api.resend.com/domains",
      host: "api.resend.com",
      path: "/domains",
      status: 403,
      ok: 0,
      duration: 198,
      body: '{\n  "statusCode": 403,\n  "message": "Missing Permission",\n  "name": "restricted_api_key"\n}',
      contentType: "application/json",
      days: 1,
      hours: 1,
    },
    {
      api: "GitHub",
      slug: "github",
      method: "GET",
      url: "https://api.github.com/user",
      host: "api.github.com",
      path: "/user",
      status: 200,
      ok: 1,
      duration: 221,
      body: '{\n  "login": "northwind-bot",\n  "type": "Bot",\n  "public_repos": 14\n}',
      contentType: "application/json",
      days: 3,
      hours: 4,
    },
    {
      api: "Mapbox",
      slug: "mapbox",
      method: "GET",
      url: "https://api.mapbox.com/tokens/v1",
      host: "api.mapbox.com",
      path: "/tokens/v1",
      status: 401,
      ok: 0,
      duration: 174,
      body: '{\n  "message": "Not Authorized - Invalid Token"\n}',
      contentType: "application/json",
      days: 4,
      hours: 2,
    },
  ];

  for (const r of requests) {
    run(
      `INSERT INTO requests
        (user_id, api_name, provider_slug, method, url, host, path, status, ok, duration_ms,
         request_headers, request_query, request_body, response_headers, response_body,
         response_content_type, response_bytes, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      userId,
      r.api,
      r.slug,
      r.method,
      r.url,
      r.host,
      r.path,
      r.status,
      r.ok,
      r.duration,
      JSON.stringify({ Accept: "application/json", Authorization: "[redacted]" }),
      "{}",
      null,
      JSON.stringify({ "content-type": r.contentType }),
      r.body,
      r.contentType,
      Buffer.byteLength(r.body),
      daysAgo(r.days, r.hours),
    );
  }
}

export function catalogSuggestionSlugs(): string[] {
  return PROVIDERS.filter((p) => p.popular).map((p) => p.slug);
}

/**
 * Create a self-contained "demo" scan so the scan flow can be exercised
 * without connecting GitHub. It never contacts an external service.
 */
export function createDemoScan(userId: number) {
  const now = nowIso();
  const result = run(
    `INSERT INTO scans (user_id, source, status, scope, repos_scanned, files_scanned, finding_count, error, started_at, finished_at)
     VALUES (?, 'demo', 'complete', 'Demo workspace · 3 repositories', 3, 41, 2, NULL, ?, ?)`,
    userId,
    now,
    now,
  );
  const scanId = Number(result.lastInsertRowid);
  const stamp = Date.now();
  const fixtures = [
    {
      slug: "stripe",
      masked: "sk_l••••••••••••dQ7m",
      repo: "northwind-labs/checkout-api",
      file: "src/config/stripe.ts",
      line: 6,
      snippet: 'export const stripeKey = "sk_l••••••••••••dQ7m";',
      severity: "critical",
    },
    {
      slug: "notion",
      masked: "ntn_••••••••••••b2Kf",
      repo: "northwind-labs/internal-wiki",
      file: "scripts/publish.mjs",
      line: 11,
      snippet: 'const notion = new Client({ auth: "ntn_••••••••••••b2Kf" });',
      severity: "high",
    },
  ];
  for (const fixture of fixtures) {
    const provider = getProvider(fixture.slug);
    run(
      `INSERT INTO findings
        (user_id, scan_id, provider_slug, provider_name, severity, masked_value, value_hash, repo, file_path, line, snippet, rule_id, status, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
      userId,
      scanId,
      fixture.slug,
      provider?.name ?? fixture.slug,
      fixture.severity,
      fixture.masked,
      `demo-${stamp}-${fixture.slug}`,
      fixture.repo,
      fixture.file,
      fixture.line,
      fixture.snippet,
      `${fixture.slug}-key`,
      now,
      now,
    );
  }
  return get<ScanRow>("SELECT * FROM scans WHERE id = ?", scanId)!;
}
