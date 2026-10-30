import { Router } from "express";
import { z } from "zod";
import { getProvider } from "@shared/catalog";
import { attachUser, requireUser } from "../auth";
import { all, get, nowIso, run } from "../db";
import { fingerprint, maskSecret, seal } from "../crypto";
import { mapCredential, type CredentialRow } from "../mappers";
import { badRequest, notFound, validate } from "../http";

const router = Router();

const createSchema = z.object({
  providerSlug: z.string().trim().min(1),
  label: z.string().trim().min(2, "Give this key a name.").max(80),
  secret: z.string().trim().min(8, "That key looks too short.").max(500),
});

const updateSchema = z.object({
  label: z.string().trim().min(2).max(80).optional(),
  secret: z.string().trim().min(8).max(500).optional(),
});

const MAX_CREDENTIALS = 25;

router.get("/", attachUser, (req, res) => {
  const user = requireUser(req);
  const rows = all<CredentialRow>(
    "SELECT * FROM credentials WHERE user_id = ? ORDER BY updated_at DESC",
    user.id,
  );
  res.json({ items: rows.map(mapCredential) });
});

router.post("/", attachUser, (req, res) => {
  const user = requireUser(req);
  const input = validate(createSchema, req.body);
  const provider = getProvider(input.providerSlug);
  if (!provider) throw notFound("That API is not in the catalog.");
  const count = get<{ count: number }>(
    "SELECT COUNT(*) AS count FROM credentials WHERE user_id = ?",
    user.id,
  );
  if ((count?.count ?? 0) >= MAX_CREDENTIALS) {
    throw badRequest(`You can store up to ${MAX_CREDENTIALS} credentials. Remove one first.`);
  }
  const sealed = seal(input.secret);
  const now = nowIso();
  const result = run(
    `INSERT INTO credentials (user_id, provider_slug, label, ciphertext, iv, tag, hint, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    user.id,
    provider.slug,
    input.label,
    sealed.ciphertext,
    sealed.iv,
    sealed.tag,
    `${maskSecret(input.secret)} · ${fingerprint(input.secret)}`,
    now,
    now,
  );
  const row = get<CredentialRow>(
    "SELECT * FROM credentials WHERE id = ?",
    Number(result.lastInsertRowid),
  );
  res.status(201).json({ item: mapCredential(row!) });
});

router.patch("/:id", attachUser, (req, res) => {
  const user = requireUser(req);
  const id = Number(req.params.id);
  const row = get<CredentialRow>(
    "SELECT * FROM credentials WHERE id = ? AND user_id = ?",
    id,
    user.id,
  );
  if (!row) throw notFound("Credential not found.");
  const input = validate(updateSchema, req.body);
  if (!input.label && !input.secret) throw badRequest("Nothing to update.");
  if (input.label) {
    run("UPDATE credentials SET label = ?, updated_at = ? WHERE id = ?", input.label, nowIso(), id);
  }
  if (input.secret) {
    const sealed = seal(input.secret);
    run(
      `UPDATE credentials SET ciphertext = ?, iv = ?, tag = ?, hint = ?, updated_at = ? WHERE id = ?`,
      sealed.ciphertext,
      sealed.iv,
      sealed.tag,
      `${maskSecret(input.secret)} · ${fingerprint(input.secret)}`,
      nowIso(),
      id,
    );
  }
  const updated = get<CredentialRow>("SELECT * FROM credentials WHERE id = ?", id);
  res.json({ item: mapCredential(updated!) });
});

router.delete("/:id", attachUser, (req, res) => {
  const user = requireUser(req);
  const id = Number(req.params.id);
  const row = get<{ id: number }>(
    "SELECT id FROM credentials WHERE id = ? AND user_id = ?",
    id,
    user.id,
  );
  if (!row) throw notFound("Credential not found.");
  run("DELETE FROM credentials WHERE id = ?", id);
  res.status(204).end();
});

export default router;
