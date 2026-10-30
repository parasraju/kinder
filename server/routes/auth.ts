import { Router } from "express";
import { z } from "zod";
import { hashPassword, verifyPassword } from "../crypto";
import {
  attachUser,
  createSession,
  destroySession,
  parsePreferences,
  requireUser,
  toUser,
} from "../auth";
import { get, nowIso, run } from "../db";
import { conflict, HttpError, rateLimit, unauthorized, validate } from "../http";

const router = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter at least 2 characters.").max(80, "Keep it under 80 characters."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(200),
  password: z
    .string()
    .min(10, "Use at least 10 characters.")
    .max(200, "Keep it under 200 characters."),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

router.post("/register", rateLimit("auth", 20, 15 * 60 * 1000), (req, res) => {
  const input = validate(registerSchema, req.body);
  const existing = get<{ id: number }>("SELECT id FROM users WHERE email = ?", input.email);
  if (existing) throw conflict("An account with that email already exists.");
  const now = nowIso();
  const hash = hashPassword(input.password);
  const result = run(
    "INSERT INTO users (email, name, password_hash, preferences, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    input.email,
    input.name,
    hash,
    JSON.stringify({}),
    now,
    now,
  );
  const userId = Number(result.lastInsertRowid);
  createSession(res, userId);
  const row = get<Parameters<typeof toUser>[0]>("SELECT * FROM users WHERE id = ?", userId);
  res.status(201).json({ user: toUser(row!) });
});

router.post("/login", rateLimit("auth", 30, 15 * 60 * 1000), (req, res) => {
  const input = validate(loginSchema, req.body);
  const row = get<{
    id: number;
    email: string;
    name: string;
    password_hash: string;
    preferences: string;
    created_at: string;
  }>("SELECT * FROM users WHERE email = ?", input.email);
  if (!row || !verifyPassword(input.password, row.password_hash)) {
    throw unauthorized("Email or password is incorrect.");
  }
  createSession(res, row.id);
  res.json({ user: toUser(row) });
});

router.post("/logout", (req, res) => {
  destroySession(req, res);
  res.status(204).end();
});

router.get("/me", attachUser, (req, res) => {
  res.json({ user: req.user ?? null });
});

router.patch("/profile", attachUser, (req, res) => {
  const user = requireUser(req);
  const input = validate(
    z.object({
      name: z.string().trim().min(2, "Enter at least 2 characters.").max(80),
      email: z.string().trim().toLowerCase().email("Enter a valid email address."),
    }),
    req.body,
  );
  const clash = get<{ id: number }>(
    "SELECT id FROM users WHERE email = ? AND id <> ?",
    input.email,
    user.id,
  );
  if (clash) throw conflict("That email is already in use.");
  run(
    "UPDATE users SET name = ?, email = ?, updated_at = ? WHERE id = ?",
    input.name,
    input.email,
    nowIso(),
    user.id,
  );
  const row = get<Parameters<typeof toUser>[0]>("SELECT * FROM users WHERE id = ?", user.id);
  res.json({ user: toUser(row!) });
});

router.put("/password", attachUser, rateLimit("auth", 20, 15 * 60 * 1000), (req, res) => {
  const user = requireUser(req);
  const input = validate(
    z.object({
      currentPassword: z.string().min(1, "Enter your current password."),
      newPassword: z.string().min(10, "Use at least 10 characters.").max(200),
    }),
    req.body,
  );
  const row = get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", user.id);
  if (!row || !verifyPassword(input.currentPassword, row.password_hash)) {
    throw new HttpError(401, "invalid_password", "Current password is incorrect.");
  }
  run(
    "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
    hashPassword(input.newPassword),
    nowIso(),
    user.id,
  );
  run("DELETE FROM sessions WHERE user_id = ? AND id <> ?", user.id, req.sessionHash ?? "");
  res.json({ ok: true });
});

router.patch("/preferences", attachUser, (req, res) => {
  const user = requireUser(req);
  const input = validate(
    z.object({
      theme: z.enum(["light", "dark", "system"]).optional(),
      density: z.enum(["comfortable", "compact"]).optional(),
      reduceMotion: z.boolean().optional(),
      defaultCategory: z.string().max(40).optional(),
    }),
    req.body,
  );
  const next = { ...user.preferences, ...input };
  run(
    "UPDATE users SET preferences = ?, updated_at = ? WHERE id = ?",
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  res.json({ preferences: parsePreferences(JSON.stringify(next)) });
});

export default router;
