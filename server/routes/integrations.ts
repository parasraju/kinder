import { Router } from "express";
import { z } from "zod";
import type { GitHubConnection } from "@shared/types";
import { attachUser, requireUser } from "../auth";
import { get, nowIso, run } from "../db";
import { seal } from "../crypto";
import { notFound, rateLimit, validate } from "../http";import { verifyGithubToken } from "../services/github";

const router = Router();

interface ConnectionRow {
  login: string;
  scopes: string | null;
  connected_at: string;
}

const tokenSchema = z.object({
  token: z
    .string()
    .trim()
    .min(20, "That token looks too short.")
    .max(300)
    .regex(/^(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})$/, "Paste a GitHub personal access token."),
});

router.get("/github", attachUser, (req, res) => {
  const user = requireUser(req);
  const row = get<ConnectionRow>(
    "SELECT login, scopes, connected_at FROM github_connections WHERE user_id = ?",
    user.id,
  );
  const payload: GitHubConnection = row
    ? { connected: true, login: row.login, connectedAt: row.connected_at, scopes: row.scopes }
    : { connected: false, login: null, connectedAt: null, scopes: null };
  res.json(payload);
});

router.post(
  "/github/verify",
  attachUser,
  rateLimit("github-verify", 10, 60_000),
  (req, res) => {
    requireUser(req);
    const input = validate(tokenSchema, req.body);
    void (async () => {
      const identity = await verifyGithubToken(input.token);
      res.json({
        login: identity.login,
        name: identity.name,
        scopes: identity.scopes,
        note: identity.scopes && !identity.scopes.includes("repo")
          ? "This token has no repo scope, so private repositories will be skipped."
          : null,
      });
    })().catch((error) => {
      if (error instanceof Error) {
        res.status(400).json({ error: { code: "github_verify_failed", message: error.message } });
        return;
      }
      res.status(500).json({ error: { code: "internal_error", message: "Verification failed." } });
    });
  },
);

router.put("/github", attachUser, rateLimit("github-connect", 10, 60_000), (req, res) => {
  const user = requireUser(req);
  const input = validate(tokenSchema, req.body);
  void (async () => {
    const identity = await verifyGithubToken(input.token);
    const sealed = seal(input.token);
    const now = nowIso();
    const existing = get<{ id: number }>(
      "SELECT id FROM github_connections WHERE user_id = ?",
      user.id,
    );
    if (existing) {
      run(
        `UPDATE github_connections SET login = ?, ciphertext = ?, iv = ?, tag = ?, scopes = ?, connected_at = ? WHERE user_id = ?`,
        identity.login,
        sealed.ciphertext,
        sealed.iv,
        sealed.tag,
        identity.scopes,
        now,
        user.id,
      );
    } else {
      run(
        `INSERT INTO github_connections (user_id, login, ciphertext, iv, tag, scopes, connected_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        user.id,
        identity.login,
        sealed.ciphertext,
        sealed.iv,
        sealed.tag,
        identity.scopes,
        now,
      );
    }
    const payload: GitHubConnection = {
      connected: true,
      login: identity.login,
      connectedAt: now,
      scopes: identity.scopes,
    };
    res.json(payload);
  })().catch((error) => {
    if (error instanceof Error) {
      res.status(400).json({ error: { code: "github_connect_failed", message: error.message } });
      return;
    }
    res.status(500).json({ error: { code: "internal_error", message: "Could not save the token." } });
  });
});

router.delete("/github", attachUser, (req, res) => {
  const user = requireUser(req);
  const row = get<{ id: number }>(
    "SELECT id FROM github_connections WHERE user_id = ?",
    user.id,
  );
  if (!row) throw notFound("No GitHub account is connected.");
  run("DELETE FROM github_connections WHERE user_id = ?", user.id);
  res.status(204).end();
});

export default router;
