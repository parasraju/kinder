import { Router } from "express";
import { z } from "zod";
import { attachUser, requireUser } from "../auth";
import { all, get, nowIso, run } from "../db";
import { badRequest, notFound, pagination, validate } from "../http";
import { mapFinding, mapScan, type FindingRow, type ScanRow } from "../mappers";
import { createDemoScan } from "../services/demo";
import { createGithubIssue, GitHubError } from "../services/github";
import { githubTokenForUser, runCodeSearchScan, runGithubScan, runningScans } from "../services/scanner";

const router = Router();

const createSchema = z.object({
  source: z.enum(["demo", "github", "search"]),
  repos: z.array(z.string().trim().min(3).max(140)).max(8).optional(),
});

router.get("/", attachUser, (req, res) => {
  const user = requireUser(req);
  const { limit, offset } = pagination(req);
  const total = get<{ count: number }>("SELECT COUNT(*) AS count FROM scans WHERE user_id = ?", user.id);
  const rows = all<ScanRow>(
    "SELECT * FROM scans WHERE user_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?",
    user.id,
    limit,
    offset,
  );
  res.json({ items: rows.map(mapScan), total: total?.count ?? 0, limit, offset });
});

router.post("/", attachUser, (req, res) => {
  const user = requireUser(req);
  const input = validate(createSchema, req.body);

  if (input.source === "demo") {
    const scan = createDemoScan(user.id);
    res.status(201).json({ scan: mapScan(scan) });
    return;
  }

  const active = get<{ id: number }>(
    "SELECT id FROM scans WHERE user_id = ? AND status IN ('queued','running') LIMIT 1",
    user.id,
  );
  if (active) throw badRequest("A scan is already running. Wait for it to finish.");
  if (!githubTokenForUser(user.id)) {
    throw badRequest("Connect a GitHub token in Settings before running a scan.");
  }

  if (input.source === "search") {
    const scope = "GitHub public code search";
    const result = run(
      `INSERT INTO scans (user_id, source, status, scope, repos_scanned, files_scanned, finding_count, error, started_at, finished_at)
       VALUES (?, 'search', 'queued', ?, 0, 0, 0, NULL, ?, NULL)`,
      user.id,
      scope,
      nowIso(),
    );
    const scanId = Number(result.lastInsertRowid);
    runningScans.add(scanId);
    setImmediate(() => {
      void runCodeSearchScan(user.id, scanId);
    });
    const row = get<ScanRow>("SELECT * FROM scans WHERE id = ?", scanId)!;
    res.status(202).json({ scan: mapScan(row) });
    return;
  }

  const scope = input.repos?.length
    ? `GitHub · ${input.repos.join(", ")}`
    : "GitHub · your most recently updated repositories";
  const result = run(
    `INSERT INTO scans (user_id, source, status, scope, repos_scanned, files_scanned, finding_count, error, started_at, finished_at)
     VALUES (?, 'github', 'queued', ?, 0, 0, 0, NULL, ?, NULL)`,
    user.id,
    scope.slice(0, 300),
    nowIso(),
  );
  const scanId = Number(result.lastInsertRowid);
  runningScans.add(scanId);
  setImmediate(() => {
    void runGithubScan(user.id, scanId, { repos: input.repos });
  });
  const row = get<ScanRow>("SELECT * FROM scans WHERE id = ?", scanId)!;
  res.status(202).json({ scan: mapScan(row) });
});

router.get("/:id", attachUser, (req, res) => {
  const user = requireUser(req);
  const row = get<ScanRow>(
    "SELECT * FROM scans WHERE id = ? AND user_id = ?",
    Number(req.params.id),
    user.id,
  );
  if (!row) throw notFound("Scan not found.");
  res.json({ scan: mapScan(row) });
});

router.post("/:id/cancel", attachUser, (req, res) => {
  const user = requireUser(req);
  const id = Number(req.params.id);
  const row = get<ScanRow>("SELECT * FROM scans WHERE id = ? AND user_id = ?", id, user.id);
  if (!row) throw notFound("Scan not found.");
  if (!["queued", "running"].includes(row.status)) {
    throw badRequest("That scan has already finished.");
  }
  run(
    "UPDATE scans SET status = 'cancelled', finished_at = ?, error = ? WHERE id = ?",
    nowIso(),
    "Cancelled by you.",
    id,
  );
  res.json({ ok: true });
});

router.get("/findings/list", attachUser, (req, res) => {
  const user = requireUser(req);
  const { limit, offset } = pagination(req);
  const q = String(req.query.q ?? "").trim();
  const status = String(req.query.status ?? "all");
  const severity = String(req.query.severity ?? "all");
  const provider = String(req.query.provider ?? "").trim();
  const scanId = Number(req.query.scanId ?? 0);

  const where: string[] = ["user_id = ?"];
  const params: unknown[] = [user.id];
  if (q) {
    where.push("(repo LIKE ? OR file_path LIKE ? OR provider_name LIKE ? OR snippet LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (["open", "acknowledged", "resolved", "dismissed"].includes(status)) {
    where.push("status = ?");
    params.push(status);
  } else if (status === "active") {
    where.push("status IN ('open','acknowledged')");
  }
  if (["low", "medium", "high", "critical"].includes(severity)) {
    where.push("severity = ?");
    params.push(severity);
  }
  if (provider) {
    where.push("provider_slug = ?");
    params.push(provider);
  }
  if (scanId > 0) {
    where.push("scan_id = ?");
    params.push(scanId);
  }
  const whereSql = where.join(" AND ");

  const total = get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM findings WHERE ${whereSql}`,
    ...params,
  );
  const rows = all<FindingRow>(
    `SELECT * FROM findings WHERE ${whereSql}
     ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
              last_seen_at DESC
     LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset,
  );
  const providers = all<{ provider_slug: string; provider_name: string; count: number }>(
    `SELECT provider_slug, provider_name, COUNT(*) AS count FROM findings
     WHERE user_id = ? GROUP BY provider_slug, provider_name ORDER BY count DESC`,
    user.id,
  );
  res.json({
    items: rows.map(mapFinding),
    total: total?.count ?? 0,
    limit,
    offset,
    providers,
  });
});

router.patch("/findings/:id", attachUser, (req, res) => {
  const user = requireUser(req);
  const input = validate(
    z.object({ status: z.enum(["open", "acknowledged", "resolved", "dismissed"]) }),
    req.body,
  );
  const id = Number(req.params.id);
  const row = get<{ id: number }>(
    "SELECT id FROM findings WHERE id = ? AND user_id = ?",
    id,
    user.id,
  );
  if (!row) throw notFound("Finding not found.");
  run("UPDATE findings SET status = ? WHERE id = ?", input.status, id);
  const updated = get<FindingRow>("SELECT * FROM findings WHERE id = ?", id)!;
  res.json({ item: mapFinding(updated) });
});

router.post("/findings/:id/report", attachUser, (req, res) => {
  const user = requireUser(req);
  const id = Number(req.params.id);
  const finding = get<FindingRow>(
    "SELECT * FROM findings WHERE id = ? AND user_id = ?",
    id,
    user.id,
  );
  if (!finding) throw notFound("Finding not found.");

  if (!/^[\w.-]+\/[\w.-]+$/.test(finding.repo)) {
    throw badRequest("This finding does not belong to a valid GitHub repository.");
  }

  const github = githubTokenForUser(user.id);
  if (!github?.token) {
    throw badRequest(
      "No GitHub token connected. Connect your GitHub account in Settings → Integrations to report issues.",
    );
  }

  const title = `Security Alert: Potential ${finding.provider_name} key exposure in \`${finding.file_path}\``;
  const body = [
    `### ⚠️ Potential Secret Exposure Detected`,
    ``,
    `Kinder detected what appears to be an exposed **${finding.provider_name}** credential in this repository:`,
    ``,
    `- **Repository:** \`${finding.repo}\``,
    `- **File:** \`${finding.file_path}\` (line ${finding.line})`,
    `- **Severity:** **${finding.severity.toUpperCase()}**`,
    `- **Rule:** \`${finding.rule_id}\``,
    `- **Masked Value:** \`${finding.masked_value}\``,
    ``,
    `#### 📋 Redacted Context`,
    `\`\`\``,
    finding.snippet,
    `\`\`\``,
    ``,
    `#### 🛡️ Recommended Remediation Steps`,
    `1. **Rotate the credential immediately:** Invalidate the exposed key in your ${finding.provider_name} developer console and issue a new secret.`,
    `2. **Remove the secret from Git history:** Simply editing or deleting the file in subsequent commits still leaves the secret exposed in the commit history. Consider using [git-filter-repo](https://github.com/newren/git-filter-repo) or [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/) to remove it from past commits.`,
    `3. **Store in Environment Variables:** Move sensitive keys to uncommitted environment files (ensure \`.env\` is listed in \`.gitignore\`) or a secret manager.`,
    ``,
    `---`,
    `*Reported via [Kinder](https://github.com/parasraju/kinder) — key hygiene & workspace security.*`,
  ].join("\n");

  void (async () => {
    try {
      const issue = await createGithubIssue(github.token, finding.repo, title, body);
      const now = nowIso();
      run(
        "UPDATE findings SET issue_url = ?, reported_at = ? WHERE id = ?",
        issue.htmlUrl,
        now,
        id,
      );
      const updated = get<FindingRow>("SELECT * FROM findings WHERE id = ?", id)!;
      res.json({
        ok: true,
        issueUrl: issue.htmlUrl,
        issueNumber: issue.number,
        item: mapFinding(updated),
      });
    } catch (error) {
      if (error instanceof GitHubError) {
        res.status(error.status >= 400 && error.status < 500 ? error.status : 502).json({
          error: { code: "github_issue_failed", message: error.message },
        });
        return;
      }
      res.status(500).json({
        error: { code: "internal_error", message: "Failed to report issue on GitHub." },
      });
    }
  })();
});

export default router;
