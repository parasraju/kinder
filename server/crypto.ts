import crypto from "node:crypto";
import { encryptionKey } from "./env";

const SCRYPT_KEYLEN = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, saltB64, hashB64] = stored.split("$");
    if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const derived = crypto.scryptSync(password, salt, expected.length, SCRYPT_PARAMS);
    return crypto.timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

export interface SealedValue {
  ciphertext: string;
  iv: string;
  tag: string;
}

export function seal(plaintext: string): SealedValue {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function open(sealed: SealedValue): string {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey,
    Buffer.from(sealed.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** Constant-time comparison for opaque tokens. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Mask a secret for display. Keeps a short recognizable prefix/suffix and
 * never more than 4 characters from either end.
 */
export function maskSecret(secret: string): string {
  const trimmed = secret.trim();
  if (trimmed.length <= 8) return "•".repeat(trimmed.length);
  const prefixLen = /^(sk-|sk_|pk_|rk_|SG\.|hf_|gsk_|xai-|pplx-|r8_|ghp_|gho_|ghs_|github_pat_|glpat-|ntn_|secret_|lin_api_|pat|figd_|shpat_|pcsk_|phx_|re_|sbp_|AIza|xox|sk\.|key-|SK)/.test(
    trimmed,
  )
    ? Math.min(6, Math.floor(trimmed.length / 4))
    : Math.min(4, Math.floor(trimmed.length / 4));
  const prefix = trimmed.slice(0, Math.max(2, prefixLen));
  const suffix = trimmed.slice(-4);
  return `${prefix}${"•".repeat(8)}${suffix}`;
}

/** Short fingerprint used to recognize a credential without storing it. */
export function fingerprint(secret: string): string {
  return sha256(secret.trim()).slice(0, 12);
}
