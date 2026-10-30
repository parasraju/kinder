import { Router } from "express";
import { PROVIDERS } from "@shared/catalog";
import type { ActivityItem, OverviewResponse, OverviewStats, Provider } from "@shared/types";
import { attachUser, requireUser } from "../auth";
import { all, get } from "../db";
import { mapScan, type RequestRow, type ScanRow } from "../mappers";

const router = Router();

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

router.get("/", attachUser, (req, res) => {
  const user = requireUser(req);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const openFindings =
    get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM findings WHERE user_id = ? AND status IN ('open','acknowledged')",
      user.id,
    )?.count ?? 0;
  const criticalFindings =
    get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM findings WHERE user_id = ? AND severity = 'critical' AND status IN ('open','acknowledged')",
      user.id,
    )?.count ?? 0;
  const resolvedThisMonth =
    get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM findings WHERE user_id = ? AND status = 'resolved' AND last_seen_at >= ?",
      user.id,
      monthStart.toISOString(),
    )?.count ?? 0;
  const scansRun =
    get<{ count: number }>("SELECT COUNT(*) AS count FROM scans WHERE user_id = ?", user.id)?.count ?? 0;
  const savedApis =
    get<{ count: number }>("SELECT COUNT(*) AS count FROM saved_apis WHERE user_id = ?", user.id)?.count ?? 0;
  const credentials =
    get<{ count: number }>("SELECT COUNT(*) AS count FROM credentials WHERE user_id = ?", user.id)?.count ?? 0;

  const weekRequests = all<{ status: number | null; ok: number; duration_ms: number | null }>(
    "SELECT status, ok, duration_ms FROM requests WHERE user_id = ? AND created_at >= ?",
    user.id,
    weekAgo,
  );
  const withStatus = weekRequests.filter((row) => row.status !== null);
  const successRate =
    withStatus.length === 0
      ? null
      : Math.round((withStatus.filter((row) => row.ok === 1).length / withStatus.length) * 100);
  const recentDurations = all<{ duration_ms: number | null }>(
    "SELECT duration_ms FROM requests WHERE user_id = ? AND duration_ms IS NOT NULL ORDER BY created_at DESC LIMIT 50",
    user.id,
  )
    .map((row) => row.duration_ms)
    .filter((value): value is number => value !== null);

  const stats: OverviewStats = {
    openFindings,
    criticalFindings,
    resolvedThisMonth,
    scansRun,
    savedApis,
    credentials,
    requestsThisWeek: weekRequests.length,
    successRate,
    medianLatencyMs: median(recentDurations),
  };

  const exposure = all<{ provider_slug: string; provider_name: string; count: number }>(
    `SELECT provider_slug, provider_name, COUNT(*) AS count FROM findings
     WHERE user_id = ? AND status IN ('open','acknowledged')
     GROUP BY provider_slug, provider_name ORDER BY count DESC LIMIT 6`,
    user.id,
  ).map((row) => ({
    providerSlug: row.provider_slug,
    providerName: row.provider_name,
    count: row.count,
  }));

  const recentScans = all<ScanRow>(
    "SELECT * FROM scans WHERE user_id = ? ORDER BY started_at DESC LIMIT 4",
    user.id,
  ).map(mapScan);

  const findingRows = all<{
    id: number;
    provider_name: string;
    severity: string;
    repo: string;
    file_path: string;
    masked_value: string;
    last_seen_at: string;
  }>(
    "SELECT id, provider_name, severity, repo, file_path, masked_value, last_seen_at FROM findings WHERE user_id = ? ORDER BY last_seen_at DESC LIMIT 5",
    user.id,
  );
  const requestRows = all<RequestRow>(
    "SELECT * FROM requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 5",
    user.id,
  );
  const scanRows = all<ScanRow>(
    "SELECT * FROM scans WHERE user_id = ? ORDER BY started_at DESC LIMIT 3",
    user.id,
  );
  const savedRows = all<{ id: number; name: string; created_at: string }>(
    "SELECT id, name, created_at FROM saved_apis WHERE user_id = ? ORDER BY created_at DESC LIMIT 3",
    user.id,
  );
  const credentialRows = all<{ id: number; label: string; provider_slug: string; created_at: string }>(
    "SELECT id, label, provider_slug, created_at FROM credentials WHERE user_id = ? ORDER BY created_at DESC LIMIT 3",
    user.id,
  );

  const activity: ActivityItem[] = [];
  for (const row of findingRows) {
    activity.push({
      id: `finding-${row.id}`,
      kind: "finding",
      title: `${row.provider_name} key found in ${row.repo}`,
      detail: `${row.file_path} · ${row.masked_value}`,
      at: row.last_seen_at,
      tone: row.severity === "critical" ? "critical" : row.severity === "high" ? "warning" : "neutral",
    });
  }
  for (const row of requestRows) {
    activity.push({
      id: `request-${row.id}`,
      kind: "request",
      title: `${row.method} ${row.api_name}`,
      detail:
        row.status === null
          ? (row.error ?? "No response")
          : `${row.status} · ${row.duration_ms ?? 0} ms`,
      at: row.created_at,
      tone: row.ok === 1 ? "positive" : "warning",
    });
  }
  for (const row of scanRows) {
    activity.push({
      id: `scan-${row.id}`,
      kind: "scan",
      title: `Scan ${row.status}`,
      detail: `${row.scope} · ${row.finding_count} findings`,
      at: row.started_at,
      tone: row.status === "failed" ? "critical" : row.status === "complete" ? "positive" : "neutral",
    });
  }
  for (const row of savedRows) {
    activity.push({
      id: `saved-${row.id}`,
      kind: "saved-api",
      title: `Saved ${row.name}`,
      detail: "Added to your workspace",
      at: row.created_at,
      tone: "neutral",
    });
  }
  for (const row of credentialRows) {
    activity.push({
      id: `credential-${row.id}`,
      kind: "credential",
      title: `Credential added: ${row.label}`,
      detail: `${row.provider_slug} · encrypted at rest`,
      at: row.created_at,
      tone: "neutral",
    });
  }
  activity.sort((a, b) => (a.at < b.at ? 1 : -1));

  const savedSlugs = new Set(
    all<{ slug: string | null }>("SELECT slug FROM saved_apis WHERE user_id = ?", user.id)
      .map((row) => row.slug)
      .filter((slug): slug is string => Boolean(slug)),
  );
  let suggestions: Provider[] = PROVIDERS.filter(
    (provider) => provider.popular && !savedSlugs.has(provider.slug),
  ).slice(0, 3);
  if (suggestions.length === 0) {
    suggestions = PROVIDERS.filter((provider) => provider.popular).slice(0, 3);
  }

  const payload: OverviewResponse = {
    stats,
    activity: activity.slice(0, 8),
    exposureByProvider: exposure,
    recentScans,
    suggestions,
  };
  res.json(payload);
});

export default router;
