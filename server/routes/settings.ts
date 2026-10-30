import { Router } from "express";
import { z } from "zod";
import { attachUser, requireUser } from "../auth";
import { get, run } from "../db";
import { validate } from "../http";

const router = Router();

router.get("/summary", attachUser, (req, res) => {
  const user = requireUser(req);
  const count = (table: string) =>
    get<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table} WHERE user_id = ?`, user.id)?.count ?? 0;
  res.json({
    scans: count("scans"),
    findings: count("findings"),
    requests: count("requests"),
    credentials: count("credentials"),
    savedApis: count("saved_apis"),
  });
});

router.delete("/workspace", attachUser, (req, res) => {
  const user = requireUser(req);
  validate(
    z.object({ confirm: z.literal("delete", { message: "Type delete to confirm." }) }),
    req.body,
  );
  run("DELETE FROM findings WHERE user_id = ?", user.id);
  run("DELETE FROM scans WHERE user_id = ?", user.id);
  run("DELETE FROM requests WHERE user_id = ?", user.id);
  run("DELETE FROM credentials WHERE user_id = ?", user.id);
  run("DELETE FROM saved_apis WHERE user_id = ?", user.id);
  res.json({ ok: true });
});

export default router;
