import { STATUS_CODES } from "node:http";
import { Router } from "express";
import { z } from "zod";
import { getProvider } from "@shared/catalog";
import type { PlaygroundResponse } from "@shared/types";
import { attachUser, requireUser } from "../auth";
import { get, nowIso, run } from "../db";
import { open } from "../crypto";
import { HttpError, badRequest, notFound, rateLimit, validate } from "../http";
import { isSecretHeader, PlaygroundError, proxyRequest } from "../services/proxy";
import type { SavedApiRow } from "../mappers";

const router = Router();

const pairSchema = z.object({
  name: z.string().max(80),
  value: z.string().max(2000),
});

const requestSchema = z.object({
  savedApiId: z.number().int().positive().optional(),
  providerSlug: z.string().max(80).optional(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z.string().max(1000),
  query: z.array(pairSchema).max(20).default([]),
  headers: z.array(pairSchema).max(20).default([]),
  body: z.string().max(256_000).nullable().default(null),
  credentialId: z.number().int().positive().nullable().default(null),
  saveHistory: z.boolean().default(true),
});

interface CredentialRow {
  id: number;
  provider_slug: string;
  ciphertext: string;
  iv: string;
  tag: string;
}

function redactPairs(pairs: { name: string; value: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of pairs) {
    if (!pair.name) continue;
    out[pair.name] = isSecretHeader(pair.name) || /token|key|secret/i.test(pair.name)
      ? "[redacted]"
      : pair.value;
  }
  return out;
}

function redactBody(body: string | null): string | null {
  if (!body) return null;
  if (/(sk-|sk_|ghp_|gho_|AIza|xoxb-|Bearer\s+[A-Za-z0-9])/i.test(body)) return "[redacted]";
  return body.slice(0, 20_000);
}

router.post("/", attachUser, rateLimit("playground", 30, 60_000), (req, res, next) => {
  void (async () => {
    const user = requireUser(req);
    const input = validate(requestSchema, req.body);

    let provider = null;
    let baseUrl: string | null = null;
    let apiName = "Custom API";
    let customSaved: SavedApiRow | null = null;

    if (input.savedApiId) {
      customSaved = get<SavedApiRow>(
        "SELECT * FROM saved_apis WHERE id = ? AND user_id = ?",
        input.savedApiId,
        user.id,
      ) ?? null;
      if (!customSaved) throw notFound("Saved API not found.");
      baseUrl = customSaved.base_url;
      apiName = customSaved.name;
      if (customSaved.slug) {
        provider = getProvider(customSaved.slug) ?? null;
        apiName = provider?.name ?? apiName;
      }
    } else if (input.providerSlug) {
      provider = getProvider(input.providerSlug) ?? null;
      if (!provider) throw notFound("That API is not in the catalog.");
      baseUrl = provider.baseUrl;
      apiName = provider.name;
    } else {
      throw badRequest("Choose a catalog API or a saved API.");
    }

    if (provider?.playgroundSupported === false) {
      throw new HttpError(
        400,
        "playground_unsupported",
        provider.playgroundNote ??
          "This API needs authentication details the playground cannot inject.",
      );
    }

    let secret: string | null = null;
    let credentialId: number | null = null;
    if (input.credentialId) {
      const credential = get<CredentialRow>(
        "SELECT * FROM credentials WHERE id = ? AND user_id = ?",
        input.credentialId,
        user.id,
      );
      if (!credential) throw notFound("Credential not found.");
      if (!provider) {
        throw badRequest("Credentials can only be attached to catalog APIs.", {
          credentialId: "Add the secret as a header for this custom API.",
        });
      }
      if (credential.provider_slug !== provider.slug) {
        throw badRequest("That credential belongs to a different API.", {
          credentialId: "Choose a credential for this API.",
        });
      }
      secret = open({
        ciphertext: credential.ciphertext,
        iv: credential.iv,
        tag: credential.tag,
      });
      credentialId = credential.id;
      run("UPDATE credentials SET last_used_at = ? WHERE id = ?", nowIso(), credential.id);
    }

    const warnings: string[] = [];
    if (!secret && provider && provider.authScheme !== "none") {
      warnings.push("No credential attached. This request is unauthenticated.");
    }

    const started = Date.now();
    let result;
    try {
      result = await proxyRequest({
        provider,
        baseUrl: baseUrl!,
        secret,
        method: input.method,
        path: input.path,
        query: input.query,
        headers: input.headers,
        body: input.body,
      });
    } catch (error) {
      if (error instanceof PlaygroundError && ["network_error", "timeout", "no_response"].includes(error.code)) {
        const requestId = input.saveHistory
          ? logRequest(user.id, apiName, provider?.slug ?? null, input, null, error.message)
          : null;
        const payload: PlaygroundResponse = {
          ok: false,
          status: null,
          statusText: null,
          durationMs: Date.now() - started,
          responseHeaders: {},
          body: "",
          bodyBytes: 0,
          contentType: null,
          truncated: false,
          requestId,
          error: error.message,
          warnings,
        };
        res.status(502).json(payload);
        return;
      }
      if (error instanceof PlaygroundError) {
        throw new HttpError(error.status, error.code, error.message);
      }
      throw error;
    }

    const responseHeaders = Object.fromEntries(result.headers.map((h) => [h.name, h.value]));
    let requestId: number | null = null;
    if (input.saveHistory) {
      requestId = logRequest(
        user.id,
        apiName,
        provider?.slug ?? null,
        input,
        result,
        null,
      );
    }

    if (result.bodyTruncated) {
      warnings.push("The response was larger than 512 KB and has been truncated.");
    }
    if (credentialId) {
      warnings.push("The credential was used but never written to history.");
    }

    const payload: PlaygroundResponse = {
      ok: result.ok,
      status: result.status,
      statusText: STATUS_CODES[result.status] ?? null,
      durationMs: result.durationMs,
      responseHeaders,
      body: result.body,
      bodyBytes: result.bytes,
      contentType: result.contentType,
      truncated: result.bodyTruncated,
      requestId,
      error: result.ok ? null : `The API responded with ${result.status}.`,
      warnings,
    };
    res.json(payload);
  })().catch((error) => {
    next(error);
  });
});

interface ProxyLike {
  status: number;
  ok: boolean;
  url: string;
  body: string;
  bodyTruncated: boolean;
  bytes: number;
  contentType: string | null;
  durationMs: number;
  headers: { name: string; value: string }[];
}

function logRequest(
  userId: number,
  apiName: string,
  providerSlug: string | null,
  input: { method: string; path: string; query: { name: string; value: string }[]; headers: { name: string; value: string }[]; body: string | null },
  result: ProxyLike | null,
  error: string | null,
): number {
  const target = result ? new URL(result.url) : new URL("https://unknown.invalid/");
  const path = input.path.split("?")[0] ?? "/";
  const storedBody = result ? result.body.slice(0, 120_000) : null;
  const inserted = run(
    `INSERT INTO requests
      (user_id, api_name, provider_slug, method, url, host, path, status, ok, duration_ms,
       request_headers, request_query, request_body, response_headers, response_body,
       response_content_type, response_bytes, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    userId,
    apiName,
    providerSlug,
    input.method,
    result?.url ?? `${apiName} · ${path}`,
    target.hostname === "unknown.invalid" ? apiName : target.hostname,
    path,
    result?.status ?? null,
    result?.ok ? 1 : 0,
    result?.durationMs ?? null,
    JSON.stringify(redactPairs(input.headers)),
    JSON.stringify(redactPairs(input.query)),
    redactBody(input.body),
    JSON.stringify(result ? Object.fromEntries(result.headers.map((h) => [h.name, h.value])) : {}),
    storedBody,
    result?.contentType ?? null,
    result?.bytes ?? null,
    error,
    nowIso(),
  );
  return Number(inserted.lastInsertRowid);
}

export default router;
