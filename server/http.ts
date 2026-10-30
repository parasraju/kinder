import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { env } from "./env";

export class HttpError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function badRequest(message: string, fields?: Record<string, string>): HttpError {
  return new HttpError(400, "bad_request", message, fields);
}

export function unauthorized(message = "Sign in to continue."): HttpError {
  return new HttpError(401, "unauthorized", message);
}

export function notFound(message = "Not found."): HttpError {
  return new HttpError(404, "not_found", message);
}

export function conflict(message: string): HttpError {
  return new HttpError(409, "conflict", message);
}

export function validate<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "form";
    if (!fields[key]) fields[key] = issue.message;
  }
  const first = result.error.issues[0];
  throw new HttpError(422, "validation_failed", first?.message ?? "Check the submitted values.", fields);
}

export function parseIntParam(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function pagination(req: Request) {
  const limit = parseIntParam(req.query.limit, 25, 1, 100);
  const offset = parseIntParam(req.query.offset, 0, 0, 100_000);
  return { limit, offset };
}

/** Simple in-memory sliding window rate limiter keyed by IP + bucket. */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(bucket: string, limit: number, windowMs: number) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const key = `${bucket}:${ip}`;
    const now = Date.now();
    const entry = buckets.get(key);
    if (!entry || entry.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > limit) {
      return next(
        new HttpError(429, "rate_limited", "Too many attempts. Wait a moment and try again."),
      );
    }
    return next();
  };
}

export function requireTrustedOrigin(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  const allowed = new Set([
    env.appOrigin,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
  ]);
  if (allowed.has(origin)) return next();
  return next(new HttpError(403, "origin_rejected", "Request origin is not allowed."));
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) },
    });
    return;
  }
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: { code: "invalid_json", message: "Request body is not valid JSON." } });
    return;
  }
  console.error("[kinder] unhandled error", err);
  res.status(500).json({
    error: { code: "internal_error", message: "Something went wrong on our side." },
  });
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.isProduction,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
