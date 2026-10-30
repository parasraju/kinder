import type { NextFunction, Request, Response } from "express";
import type { User, UserPreferences } from "@shared/types";
import { get, nowIso, run } from "./db";
import { randomToken, sha256 } from "./crypto";
import { env } from "./env";
import { cookieOptions, parseCookies, unauthorized } from "./http";

export const SESSION_COOKIE = "ka_session";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
      sessionHash?: string;
    }
  }
}

interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  preferences: string;
  created_at: string;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "light",
  density: "comfortable",
  reduceMotion: false,
  defaultCategory: "all",
};

export function parsePreferences(raw: string | null | undefined): UserPreferences {
  if (!raw) return { ...DEFAULT_PREFERENCES };
  try {
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return { ...DEFAULT_PREFERENCES, ...parsed };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.created_at,
    preferences: parsePreferences(row.preferences),
  };
}

export function attachUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE];
    if (!token) return next();
    const sessionHash = sha256(token);
    const row = get<UserRow & { expires_at: string }>(
      `SELECT u.*, s.expires_at FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`,
      sessionHash,
    );
    if (!row) return next();
    if (new Date(row.expires_at).getTime() < Date.now()) {
      run("DELETE FROM sessions WHERE id = ?", sessionHash);
      return next();
    }
    req.user = toUser(row);
    req.sessionHash = sessionHash;
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireUser(req: Request): User {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function createSession(res: Response, userId: number): void {
  const token = randomToken(32);
  const sessionHash = sha256(token);
  const ttlSeconds = env.sessionTtlDays * 24 * 60 * 60;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  run(
    "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    sessionHash,
    userId,
    nowIso(),
    expiresAt,
  );
  res.cookie(SESSION_COOKIE, token, cookieOptions(ttlSeconds));
}

export function destroySession(req: Request, res: Response): void {
  if (req.sessionHash) {
    run("DELETE FROM sessions WHERE id = ?", req.sessionHash);
  }
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function pruneExpiredSessions(): void {
  run("DELETE FROM sessions WHERE expires_at < ?", nowIso());
}
