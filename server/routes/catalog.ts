import { Router } from "express";
import { CATEGORY_LABELS, PROVIDERS, getProvider } from "@shared/catalog";
import type { ApiCategory } from "@shared/types";
import { attachUser, requireUser } from "../auth";
import { all } from "../db";
import { mapSavedApi } from "../mappers";
import { notFound } from "../http";

const router = Router();

router.get("/", (_req, res) => {
  res.json({
    providers: PROVIDERS,
    categories: (Object.keys(CATEGORY_LABELS) as ApiCategory[]).map((key) => ({
      key,
      label: CATEGORY_LABELS[key],
    })),
  });
});

router.get("/:slug", attachUser, (req, res) => {
  const provider = getProvider(String(req.params.slug));
  if (!provider) throw notFound("That API is not in the catalog.");
  let saved = null;
  if (req.user) {
    const row = all<Parameters<typeof mapSavedApi>[0]>(
      "SELECT * FROM saved_apis WHERE user_id = ? AND slug = ?",
      requireUser(req).id,
      provider.slug,
    )[0];
    saved = row ? mapSavedApi(row) : null;
  }
  res.json({ provider, saved });
});

export default router;
