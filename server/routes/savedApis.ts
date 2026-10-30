import { Router } from "express";
import { z } from "zod";
import { getProvider } from "@shared/catalog";
import { attachUser, requireUser } from "../auth";
import { all, get, nowIso, run } from "../db";
import { mapSavedApi } from "../mappers";
import { badRequest, conflict, notFound, validate } from "../http";

const router = Router();

const saveSchema = z.union([
  z.object({
    slug: z.string().trim().min(1),
    notes: z.string().trim().max(500).optional().nullable(),
  }),
  z.object({
    name: z.string().trim().min(2, "Enter at least 2 characters.").max(80),
    baseUrl: z.string().trim().url("Enter a valid URL.").max(400),
    category: z.string().trim().max(40).optional(),
    notes: z.string().trim().max(500).optional().nullable(),
  }),
]);

const updateSchema = z.object({
  notes: z.string().trim().max(500).optional().nullable(),
  favorite: z.boolean().optional(),
});

router.get("/", attachUser, (req, res) => {
  const user = requireUser(req);
  const rows = all<Parameters<typeof mapSavedApi>[0]>(
    "SELECT * FROM saved_apis WHERE user_id = ? ORDER BY favorite DESC, created_at DESC",
    user.id,
  );
  res.json({ items: rows.map(mapSavedApi) });
});

router.post("/", attachUser, (req, res) => {
  const user = requireUser(req);
  const input = validate(saveSchema, req.body);

  if ("slug" in input) {
    const provider = getProvider(input.slug);
    if (!provider) throw notFound("That API is not in the catalog.");
    const existing = get<{ id: number }>(
      "SELECT id FROM saved_apis WHERE user_id = ? AND slug = ?",
      user.id,
      provider.slug,
    );
    if (existing) throw conflict("This API is already in your workspace.");
    const result = run(
      `INSERT INTO saved_apis (user_id, slug, name, base_url, category, notes, favorite, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      user.id,
      provider.slug,
      provider.name,
      provider.baseUrl,
      provider.category,
      input.notes ?? null,
      nowIso(),
    );
    const row = get<Parameters<typeof mapSavedApi>[0]>(
      "SELECT * FROM saved_apis WHERE id = ?",
      Number(result.lastInsertRowid),
    );
    res.status(201).json({ item: mapSavedApi(row!) });
    return;
  }

  let url: URL;
  try {
    url = new URL(input.baseUrl);
  } catch {
    throw badRequest("Enter a valid URL.", { baseUrl: "Enter a valid URL." });
  }
  if (url.protocol !== "https:") {
    throw badRequest("Only HTTPS endpoints can be saved.", {
      baseUrl: "Use an https:// URL.",
    });
  }
  if (url.username || url.password) {
    throw badRequest("Remove credentials from the URL.", {
      baseUrl: "URLs with embedded credentials are not allowed.",
    });
  }
  const result = run(
    `INSERT INTO saved_apis (user_id, slug, name, base_url, category, notes, favorite, created_at)
     VALUES (?, NULL, ?, ?, 'custom', ?, 0, ?)`,
    user.id,
    input.name,
    url.toString().replace(/\/+$/, ""),
    input.notes ?? null,
    nowIso(),
  );
  const row = get<Parameters<typeof mapSavedApi>[0]>(
    "SELECT * FROM saved_apis WHERE id = ?",
    Number(result.lastInsertRowid),
  );
  res.status(201).json({ item: mapSavedApi(row!) });
});

router.patch("/:id", attachUser, (req, res) => {
  const user = requireUser(req);
  const id = Number(req.params.id);
  const existing = get<{ id: number }>(
    "SELECT id FROM saved_apis WHERE id = ? AND user_id = ?",
    id,
    user.id,
  );
  if (!existing) throw notFound("Saved API not found.");
  const input = validate(updateSchema, req.body);
  if (input.notes !== undefined) {
    run("UPDATE saved_apis SET notes = ? WHERE id = ?", input.notes, id);
  }
  if (input.favorite !== undefined) {
    run("UPDATE saved_apis SET favorite = ? WHERE id = ?", input.favorite ? 1 : 0, id);
  }
  const row = get<Parameters<typeof mapSavedApi>[0]>("SELECT * FROM saved_apis WHERE id = ?", id);
  res.json({ item: mapSavedApi(row!) });
});

router.delete("/:id", attachUser, (req, res) => {
  const user = requireUser(req);
  const id = Number(req.params.id);
  const existing = get<{ id: number }>(
    "SELECT id FROM saved_apis WHERE id = ? AND user_id = ?",
    id,
    user.id,
  );
  if (!existing) throw notFound("Saved API not found.");
  run("DELETE FROM saved_apis WHERE id = ?", id);
  res.status(204).end();
});

export default router;
