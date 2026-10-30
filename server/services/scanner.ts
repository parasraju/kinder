import { createHash } from "node:crypto";
import { open } from "../crypto";
import { env } from "../env";
import { all, get, nowIso, run } from "../db";
import {
  CODE_SEARCH_QUERIES,
  GitHubError,
  getFileText,
  getRepo,
  getRepoTree,
  getRawFileContent,
  listUserRepos,
  searchCode,
} from "./github";
import {
  findSecrets,
  isCandidateFile,
  lineNumberAt,
  maskFoundSecret,
  redactSnippet,
} from "./rules";

const MAX_REPOS = 8;
const MAX_FILES_PER_REPO = 60;
const MAX_TOTAL_FILES = 240;
const MAX_FILE_BYTES = 200_000;
const MAX_TOTAL_BYTES = 6 * 1024 * 1024;

/* ── Code search limits ──────────────────────────────────────────────────── */
const SEARCH_MAX_PAGES = 3;
const SEARCH_MAX_FILES = 300;
const SEARCH_DELAY_MS = 1_000;

export const runningScans = new Set<number>();

interface ConnectionRow {
  login: string;
  ciphertext: string;
  iv: string;
  tag: string;
}

export function githubTokenForUser(userId: number): { token: string; login: string } | null {
  const row = get<ConnectionRow>("SELECT * FROM github_connections WHERE user_id = ?", userId);
  if (row) {
    try {
      return {
        token: open({ ciphertext: row.ciphertext, iv: row.iv, tag: row.tag }),
        login: row.login,
      };
    } catch {
      return null;
    }
  }
  if (env.githubToken) {
    return { token: env.githubToken, login: "server-token" };
  }
  return null;
}

function updateScan(
  scanId: number,
  fields: Partial<{
    status: string;
    scope: string;
    repos_scanned: number;
    files_scanned: number;
    finding_count: number;
    error: string | null;
    finished_at: string | null;
  }>,
): void {
  const entries = Object.entries(fields);
  if (entries.length === 0) return;
  const sql = `UPDATE scans SET ${entries.map(([key]) => `${key} = ?`).join(", ")} WHERE id = ?`;
  run(sql, ...entries.map(([, value]) => value), scanId);
}

export interface ScanRunOptions {
  repos?: string[];
}

/**
 * Scan repositories the authenticated user owns. Only credential-shaped
 * strings are extracted; the full secret is never written to the database.
 */
export async function runGithubScan(
  userId: number,
  scanId: number,
  options: ScanRunOptions = {},
): Promise<void> {
  runningScans.add(scanId);
  let filesScanned = 0;
  let reposScanned = 0;
  let findingCount = 0;
  let bytesRead = 0;

  try {
    const connection = githubTokenForUser(userId);
    if (!connection) {
      throw new Error("Connect a GitHub account before scanning repositories.");
    }
    const { token } = connection;

    updateScan(scanId, { status: "running", scope: "Preparing repository list" });

    const requested = (options.repos ?? []).map((r) => r.trim()).filter(Boolean).slice(0, MAX_REPOS);
    const repos: { fullName: string; defaultBranch: string }[] = [];
    if (requested.length > 0) {
      for (const fullName of requested) {
        const repo = await getRepo(token, fullName);
        if (repo) repos.push({ fullName, defaultBranch: repo.defaultBranch });
      }
      if (repos.length === 0) {
        throw new Error("None of the selected repositories could be read with this token.");
      }
    } else {
      const listed = await listUserRepos(token, MAX_REPOS);
      if (listed.length === 0) {
        throw new Error("No repositories were found for this GitHub account.");
      }
      for (const repo of listed) {
        repos.push({ fullName: repo.fullName, defaultBranch: repo.defaultBranch });
      }
    }

    updateScan(scanId, {
      scope: `GitHub · ${repos.map((r) => r.fullName).join(", ")}`.slice(0, 300),
    });

    outer: for (const repo of repos) {
      let tree;
      try {
        tree = await getRepoTree(token, repo.fullName, repo.defaultBranch);
      } catch (error) {
        if (error instanceof GitHubError && (error.status === 404 || error.rateLimited)) {
          if (error.rateLimited) break outer;
          reposScanned += 1;
          continue;
        }
        throw error;
      }
      const candidates = tree.entries
        .filter((entry) => entry.size > 0 && entry.size <= MAX_FILE_BYTES)
        .filter((entry) => isCandidateFile(entry.path))
        .sort((a, b) => {
          const aEnv = a.path.toLowerCase().includes(".env") ? 0 : 1;
          const bEnv = b.path.toLowerCase().includes(".env") ? 0 : 1;
          if (aEnv !== bEnv) return aEnv - bEnv;
          return b.size - a.size;
        })
        .slice(0, MAX_FILES_PER_REPO);

      for (const entry of candidates) {
        if (filesScanned >= MAX_TOTAL_FILES || bytesRead >= MAX_TOTAL_BYTES) break outer;
        let content: string | null = null;
        try {
          content = await getFileText(token, repo.fullName, entry.path, repo.defaultBranch, MAX_FILE_BYTES);
        } catch (error) {
          if (error instanceof GitHubError && (error.status === 404 || error.rateLimited)) {
            if (error.rateLimited) break outer;
            continue;
          }
          continue;
        }
        if (!content) continue;
        bytesRead += Buffer.byteLength(content);
        filesScanned += 1;

        const matches = findSecrets(content, entry.path);
        for (const match of matches) {
          const masked = maskFoundSecret(match.value);
          const snippet = redactSnippet(content, match.index, match.value.length);
          const line = lineNumberAt(content, match.index);
          const firstSeen = nowIso();
          run(
            `INSERT INTO findings
              (user_id, scan_id, provider_slug, provider_name, severity, masked_value, value_hash, repo, file_path, line, snippet, rule_id, status, first_seen_at, last_seen_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
             ON CONFLICT(user_id, value_hash, repo, file_path) DO UPDATE SET
               last_seen_at = excluded.last_seen_at,
               scan_id = excluded.scan_id,
               line = excluded.line,
               snippet = excluded.snippet`,
            userId,
            scanId,
            match.rule.providerSlug,
            match.rule.providerName,
            match.rule.severity,
            masked,
            // Hash only; the raw value never leaves this function.
            hashValue(match.value),
            repo.fullName,
            entry.path,
            line,
            snippet,
            match.rule.id,
            firstSeen,
            firstSeen,
          );
          findingCount += 1;
        }

        if (filesScanned % 5 === 0) {
          updateScan(scanId, {
            files_scanned: filesScanned,
            repos_scanned: reposScanned,
            finding_count: findingCount,
          });
        }
      }
      reposScanned += 1;
      updateScan(scanId, {
        files_scanned: filesScanned,
        repos_scanned: reposScanned,
        finding_count: findingCount,
      });
    }

    const finalStatus = get<{ status: string }>("SELECT status FROM scans WHERE id = ?", scanId)?.status;
    updateScan(scanId, {
      status: finalStatus === "cancelled" ? "cancelled" : "complete",
      files_scanned: filesScanned,
      repos_scanned: reposScanned,
      finding_count: findingCount,
      finished_at: nowIso(),
    });
  } catch (error) {
    const message =
      error instanceof GitHubError
        ? error.message
        : error instanceof Error
          ? error.message
          : "The scan stopped unexpectedly.";
    updateScan(scanId, {
      status: "failed",
      files_scanned: filesScanned,
      repos_scanned: reposScanned,
      finding_count: findingCount,
      error: message,
      finished_at: nowIso(),
    });
  } finally {
    runningScans.delete(scanId);
  }
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/*──────────────────────────────────────────────────────────────────────────────
 * Public Code Search scan — find leaked keys across all of GitHub
 *────────────────────────────────────────────────────────────────────────────*/

export interface CodeSearchScanOptions {
  /** Subset of CODE_SEARCH_QUERIES indices to run, or empty/undefined for all. */
  queryIndices?: number[];
  /** Max search result pages per query (default 3). */
  maxPages?: number;
  /** Delay between search API calls in ms (default 4000). */
  delayMs?: number;
}

/**
 * Scan public GitHub repositories for exposed API keys using the
 * GitHub Code Search API (the same approach as LeakedAPIs).
 *
 * The full secret value is never persisted; only a SHA-256 hash and a
 * masked preview are written.
 */
export async function runCodeSearchScan(
  userId: number,
  scanId: number,
  options: CodeSearchScanOptions = {},
): Promise<void> {
  runningScans.add(scanId);
  let filesScanned = 0;
  let reposScanned = 0;
  let findingCount = 0;
  const seenFiles = new Set<string>(); // "owner/repo:path" dedup
  const seenRepos = new Set<string>();
  const maxPages = options.maxPages ?? SEARCH_MAX_PAGES;
  const delayMs = options.delayMs ?? SEARCH_DELAY_MS;

  try {
    const connection = githubTokenForUser(userId);
    if (!connection) {
      throw new Error("Connect a GitHub account before running a code search scan.");
    }
    const { token } = connection;

    const queries =
      options.queryIndices && options.queryIndices.length > 0
        ? options.queryIndices.map((i) => CODE_SEARCH_QUERIES[i]).filter(Boolean)
        : CODE_SEARCH_QUERIES;

    updateScan(scanId, {
      status: "running",
      scope: `GitHub public code search (${queries.length} queries)`,
    });

    queryLoop: for (const query of queries) {
      // Stop if scan was cancelled
      const scanRow = get<{ status: string }>("SELECT status FROM scans WHERE id = ?", scanId);
      if (scanRow?.status === "cancelled") break;

      for (let page = 1; page <= maxPages; page++) {
        if (filesScanned >= SEARCH_MAX_FILES) break queryLoop;

        const result = await searchCode(token, query, page, 30);
        if (!result || result.items.length === 0) break;

        for (const item of result.items) {
          if (filesScanned >= SEARCH_MAX_FILES) break queryLoop;

          const fileKey = `${item.repo}:${item.path}`;
          if (seenFiles.has(fileKey)) continue;
          seenFiles.add(fileKey);

          // Track unique repos
          if (!seenRepos.has(item.repo)) {
            seenRepos.add(item.repo);
            reposScanned = seenRepos.size;
          }

          // Fetch raw content (free, does not cost API rate)
          const ref = item.sha || item.defaultBranch;
          let content = await getRawFileContent(item.repo, ref, item.path, MAX_FILE_BYTES);
          if (!content) {
            try {
              content = await getFileText(token, item.repo, item.path, item.defaultBranch, MAX_FILE_BYTES);
            } catch {
              content = null;
            }
          }
          if (!content) continue;

          filesScanned += 1;

          const matches = findSecrets(content, item.path);
          for (const match of matches) {
            const masked = maskFoundSecret(match.value);
            const snippet = redactSnippet(content, match.index, match.value.length);
            const line = lineNumberAt(content, match.index);
            const firstSeen = nowIso();
            run(
              `INSERT INTO findings
                (user_id, scan_id, provider_slug, provider_name, severity, masked_value, value_hash, repo, file_path, line, snippet, rule_id, status, first_seen_at, last_seen_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
               ON CONFLICT(user_id, value_hash, repo, file_path) DO UPDATE SET
                 last_seen_at = excluded.last_seen_at,
                 scan_id = excluded.scan_id,
                 line = excluded.line,
                 snippet = excluded.snippet`,
              userId,
              scanId,
              match.rule.providerSlug,
              match.rule.providerName,
              match.rule.severity,
              masked,
              hashValue(match.value),
              item.repo,
              item.path,
              line,
              snippet,
              match.rule.id,
              firstSeen,
              firstSeen,
            );
            findingCount += 1;
          }

          updateScan(scanId, {
            files_scanned: filesScanned,
            repos_scanned: reposScanned,
            finding_count: findingCount,
          });
        }

        // Respect rate limits
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    const finalStatus = get<{ status: string }>("SELECT status FROM scans WHERE id = ?", scanId)?.status;
    updateScan(scanId, {
      status: finalStatus === "cancelled" ? "cancelled" : "complete",
      files_scanned: filesScanned,
      repos_scanned: reposScanned,
      finding_count: findingCount,
      finished_at: nowIso(),
    });
  } catch (error) {
    const message =
      error instanceof GitHubError
        ? error.message
        : error instanceof Error
          ? error.message
          : "The code search scan stopped unexpectedly.";
    updateScan(scanId, {
      status: "failed",
      files_scanned: filesScanned,
      repos_scanned: reposScanned,
      finding_count: findingCount,
      error: message,
      finished_at: nowIso(),
    });
  } finally {
    runningScans.delete(scanId);
  }
}

export function scanBelongsToUser(scanId: number, userId: number): boolean {
  return Boolean(
    get<{ id: number }>("SELECT id FROM scans WHERE id = ? AND user_id = ?", scanId, userId),
  );
}

export function listRecentScans(userId: number, limit = 5) {
  return all(
    "SELECT * FROM scans WHERE user_id = ? ORDER BY started_at DESC LIMIT ?",
    userId,
    limit,
  );
}
