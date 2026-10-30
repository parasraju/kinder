import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();

function resolveDataDir(): string {
  const raw = process.env.DATA_DIR?.trim() || "data";
  return path.isAbsolute(raw) ? raw : path.join(root, raw);
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT ?? 8787),
  appOrigin: (process.env.APP_ORIGIN ?? "http://localhost:5173").replace(/\/$/, ""),
  dataDir: resolveDataDir(),
  sessionTtlDays: Math.max(1, Number(process.env.SESSION_TTL_DAYS ?? 14)),
  seedDemo: (process.env.SEED_DEMO ?? "true").toLowerCase() !== "false",
  githubToken: process.env.GITHUB_TOKEN?.trim() || null,
};

fs.mkdirSync(env.dataDir, { recursive: true });

/**
 * Resolve the encryption key. Production must supply a 32-byte base64 key.
 * Development falls back to a generated key persisted with owner-only
 * permissions so credentials survive a restart.
 */
function resolveEncryptionKey(): Buffer {
  const configured = process.env.APP_ENCRYPTION_KEY?.trim();
  if (configured) {
    const buf = Buffer.from(configured, "base64");
    if (buf.length !== 32) {
      throw new Error(
        "APP_ENCRYPTION_KEY must be a base64-encoded 32-byte key. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
      );
    }
    return buf;
  }
  if (env.isProduction) {
    throw new Error("APP_ENCRYPTION_KEY is required in production.");
  }
  const keyPath = path.join(env.dataDir, ".dev-encryption-key");
  if (fs.existsSync(keyPath)) {
    const raw = fs.readFileSync(keyPath);
    if (raw.length === 32) return raw;
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, key, { mode: 0o600 });
  console.warn(
    "[kinder] APP_ENCRYPTION_KEY not set; generated a development key at data/.dev-encryption-key",
  );
  return key;
}

export const encryptionKey = resolveEncryptionKey();

if (env.isProduction) {
  const missing: string[] = [];
  if (!process.env.APP_ENCRYPTION_KEY) missing.push("APP_ENCRYPTION_KEY");
  if (missing.length > 0) {
    throw new Error(`Missing required production configuration: ${missing.join(", ")}`);
  }
}
