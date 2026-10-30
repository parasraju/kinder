import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { env } from "./env";

export const dbPath = path.join(env.dataDir, "kinder.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA busy_timeout = 5000;");

const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        preferences TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);

      CREATE TABLE credentials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider_slug TEXT NOT NULL,
        label TEXT NOT NULL,
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
        tag TEXT NOT NULL,
        hint TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_used_at TEXT
      );
      CREATE INDEX idx_credentials_user ON credentials(user_id);

      CREATE TABLE saved_apis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        slug TEXT,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        category TEXT NOT NULL,
        notes TEXT,
        favorite INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_saved_apis_user ON saved_apis(user_id);
      CREATE UNIQUE INDEX idx_saved_apis_slug ON saved_apis(user_id, slug) WHERE slug IS NOT NULL;

      CREATE TABLE requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        api_name TEXT NOT NULL,
        provider_slug TEXT,
        method TEXT NOT NULL,
        url TEXT NOT NULL,
        host TEXT NOT NULL,
        path TEXT NOT NULL,
        status INTEGER,
        ok INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER,
        request_headers TEXT NOT NULL DEFAULT '{}',
        request_query TEXT NOT NULL DEFAULT '{}',
        request_body TEXT,
        response_headers TEXT NOT NULL DEFAULT '{}',
        response_body TEXT,
        response_content_type TEXT,
        response_bytes INTEGER,
        error TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_requests_user_created ON requests(user_id, created_at DESC);

      CREATE TABLE scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        scope TEXT NOT NULL,
        repos_scanned INTEGER NOT NULL DEFAULT 0,
        files_scanned INTEGER NOT NULL DEFAULT 0,
        finding_count INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT
      );
      CREATE INDEX idx_scans_user ON scans(user_id, started_at DESC);

      CREATE TABLE findings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
        provider_slug TEXT NOT NULL,
        provider_name TEXT NOT NULL,
        severity TEXT NOT NULL,
        masked_value TEXT NOT NULL,
        value_hash TEXT NOT NULL,
        repo TEXT NOT NULL,
        file_path TEXT NOT NULL,
        line INTEGER NOT NULL,
        snippet TEXT NOT NULL,
        rule_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );
      CREATE INDEX idx_findings_user_status ON findings(user_id, status);
      CREATE INDEX idx_findings_scan ON findings(scan_id);
      CREATE UNIQUE INDEX idx_findings_unique ON findings(user_id, value_hash, repo, file_path);

      CREATE TABLE github_connections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        login TEXT NOT NULL,
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
        tag TEXT NOT NULL,
        scopes TEXT,
        connected_at TEXT NOT NULL
      );
    `,
  },
];

function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  const applied = new Set(
    (db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[]).map(
      (r) => r.version,
    ),
  );
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.exec("BEGIN");
    try {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        migration.version,
        new Date().toISOString(),
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

migrate();

export function nowIso(): string {
  return new Date().toISOString();
}

export function get<T>(sql: string, ...params: unknown[]): T | undefined {
  return db.prepare(sql).get(...(params as never[])) as T | undefined;
}

export function all<T>(sql: string, ...params: unknown[]): T[] {
  return db.prepare(sql).all(...(params as never[])) as T[];
}

export function run(sql: string, ...params: unknown[]) {
  return db.prepare(sql).run(...(params as never[]));
}
