import { Router } from "express";
import { attachUser, requireUser } from "../auth";
import { all, get, run } from "../db";
import { mapRequest, mapRequestSummary, type RequestRow } from "../mappers";
import { notFound, pagination } from "../http";

const router = Router();

function statusClause(status: string): { sql: string; params: unknown[] } {
  if (status === "success") return { sql: "AND status >= 200 AND status < 300", params: [] };
  if (status === "client_error") return { sql: "AND status >= 400 AND status < 500", params: [] };
  if (status === "server_error") return { sql: "AND status >= 500", params: [] };
  if (status === "failed") return { sql: "AND (status IS NULL OR ok = 0)", params: [] };
  return { sql: "", params: [] };
}

router.get("/", attachUser, (req, res) => {
  const user = requireUser(req);
  const { limit, offset } = pagination(req);
  const q = String(req.query.q ?? "").trim();
  const status = String(req.query.status ?? "all");
  const provider = String(req.query.provider ?? "").trim();

  const where: string[] = ["user_id = ?"];
  const params: unknown[] = [user.id];
  if (q) {
    where.push("(url LIKE ? OR api_name LIKE ? OR host LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (provider) {
    where.push("provider_slug = ?");
    params.push(provider);
  }
  const clause = statusClause(status);
  const whereSql = where.join(" AND ");

  const total = get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM requests WHERE ${whereSql} ${clause.sql}`,
    ...params,
    ...clause.params,
  );
  const rows = all<RequestRow>(
    `SELECT * FROM requests WHERE ${whereSql} ${clause.sql}
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ...params,
    ...clause.params,
    limit,
    offset,
  );
  res.json({
    items: rows.map(mapRequestSummary),
    total: total?.count ?? 0,
    limit,
    offset,
  });
});

router.get("/:id", attachUser, (req, res) => {
  const user = requireUser(req);
  const row = get<RequestRow>(
    "SELECT * FROM requests WHERE id = ? AND user_id = ?",
    Number(req.params.id),
    user.id,
  );
  if (!row) throw notFound("Request not found.");
  res.json({ item: mapRequest(row) });
});

router.delete("/:id", attachUser, (req, res) => {
  const user = requireUser(req);
  const id = Number(req.params.id);
  const row = get<{ id: number }>(
    "SELECT id FROM requests WHERE id = ? AND user_id = ?",
    id,
    user.id,
  );
  if (!row) throw notFound("Request not found.");
  run("DELETE FROM requests WHERE id = ?", id);
  res.status(204).end();
});

router.delete("/", attachUser, (req, res) => {
  const user = requireUser(req);
  const result = run("DELETE FROM requests WHERE user_id = ?", user.id);
  res.json({ deleted: Number(result.changes) });
});

export default router;
