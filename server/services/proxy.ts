import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { Provider } from "@shared/types";

export class PlaygroundError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "invalid_request") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface KeyValuePair {
  name: string;
  value: string;
}

export interface ProxyInput {
  provider: Provider | null;
  baseUrl: string;
  secret: string | null;
  method: string;
  path: string;
  query: KeyValuePair[];
  headers: KeyValuePair[];
  body: string | null;
  timeoutMs?: number;
}

export interface ProxyResult {
  status: number;
  ok: boolean;
  url: string;
  headers: KeyValuePair[];
  body: string;
  bodyTruncated: boolean;
  bytes: number;
  contentType: string | null;
  durationMs: number;
}

const MAX_RESPONSE_BYTES = 512 * 1024;
const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const BLOCKED_REQUEST_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "transfer-encoding",
  "upgrade",
  "expect",
  "authorization",
]);

export function isPrivateIp(value: string): boolean {
  const version = isIP(value);
  if (version === 4) {
    const parts = value.split(".").map(Number);
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true;
    return false;
  }
  if (version === 6) {
    const normalized = value.toLowerCase();
    if (normalized === "::1" || normalized === "::") return true;
    if (normalized.startsWith("fe80") || normalized.startsWith("fc") || normalized.startsWith("fd")) {
      return true;
    }
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return true;
}

/**
 * Reject anything that could reach localhost, a private network, or a
 * non-TLS endpoint. DNS is resolved and every address must be public.
 */
export async function assertPublicHttpsUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new PlaygroundError("That URL is not valid.", 400, "invalid_url");
  }
  if (url.protocol !== "https:") {
    throw new PlaygroundError("Only HTTPS endpoints are allowed.", 400, "insecure_url");
  }
  if (url.username || url.password) {
    throw new PlaygroundError("Credentials in the URL are not allowed.", 400, "invalid_url");
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".internal")) {
    throw new PlaygroundError("Local and internal hosts are blocked.", 400, "blocked_host");
  }
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new PlaygroundError("Private network addresses are blocked.", 400, "blocked_host");
    }
    return url;
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new PlaygroundError(`Could not resolve ${hostname}.`, 400, "dns_failure");
  }
  if (addresses.length === 0) {
    throw new PlaygroundError(`Could not resolve ${hostname}.`, 400, "dns_failure");
  }
  if (addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new PlaygroundError("That host resolves to a private address and is blocked.", 400, "blocked_host");
  }
  return url;
}

function joinPath(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix === "/" ? "" : suffix}`;
}

function applyAuth(
  url: URL,
  headers: Record<string, string>,
  provider: Provider | null,
  secret: string | null,
): void {
  if (!provider || !secret) return;
  const prefix = provider.authPrefix ?? "";
  switch (provider.authScheme) {
    case "bearer":
      headers.Authorization = `Bearer ${secret}`;
      break;
    case "header": {
      const name = provider.authHeaderName ?? "Authorization";
      headers[name] = `${prefix}${secret}`;
      break;
    }
    case "query": {
      const name = provider.authQueryName ?? "api_key";
      url.searchParams.set(name, secret);
      break;
    }
    case "basic": {
      const user = provider.basicUsername ?? "user";
      headers.Authorization = `Basic ${Buffer.from(`${user}:${secret}`).toString("base64")}`;
      break;
    }
    case "path":
    case "aws":
    case "none":
    default:
      break;
  }
}

async function readCapped(response: Response): Promise<{ text: string; bytes: number; truncated: boolean }> {
  if (!response.body) return { text: "", bytes: 0, truncated: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    bytes += value.byteLength;
    if (bytes > MAX_RESPONSE_BYTES) {
      const remaining = MAX_RESPONSE_BYTES - (bytes - value.byteLength);
      chunks.push(value.slice(0, Math.max(0, remaining)));
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
  }
  const merged = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  return { text: merged.toString("utf8"), bytes, truncated };
}

export async function proxyRequest(input: ProxyInput): Promise<ProxyResult> {
  const method = input.method.toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    throw new PlaygroundError(`Method ${method} is not allowed.`, 400, "invalid_method");
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(input.path)) {
    throw new PlaygroundError("The request path contains control characters.", 400, "invalid_path");
  }
  if (input.path.includes("://")) {
    throw new PlaygroundError("Provide only a path, not a full URL.", 400, "invalid_path");
  }
  if (input.path.split("/").includes("..")) {
    throw new PlaygroundError("Path traversal is not allowed.", 400, "invalid_path");
  }

  const target = joinPath(input.baseUrl, input.path.split("?")[0] ?? "/");
  const url = new URL(target);
  for (const pair of input.query) {
    if (pair.name) url.searchParams.append(pair.name, pair.value);
  }

  if (input.provider?.authScheme === "path" && input.provider.authPathPrefix && input.secret) {
    const prefix = input.provider.authPathPrefix.replace("{token}", encodeURIComponent(input.secret));
    url.pathname = `${url.pathname.replace(/\/+$/, "")}${prefix}`;
  }

  const headers: Record<string, string> = {
    "User-Agent": "KinderApply-Playground/1.0",
    Accept: "application/json",
  };
  for (const pair of input.headers) {
    const name = pair.name.trim();
    if (!name) continue;
    if (BLOCKED_REQUEST_HEADERS.has(name.toLowerCase())) continue;
    if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(name)) {
      throw new PlaygroundError(`Header name "${name}" is not valid.`, 400, "invalid_header");
    }
    headers[name] = pair.value;
  }
  if (input.body !== null && method !== "GET" && method !== "HEAD") {
    headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
  }
  applyAuth(url, headers, input.provider, input.secret);

  const started = Date.now();
  let current = url;
  let response: Response | null = null;
  for (let hop = 0; hop < 4; hop += 1) {
    await assertPublicHttpsUrl(current.toString());
    try {
      response = await fetch(current, {
        method,
        headers,
        body: input.body !== null && method !== "GET" && method !== "HEAD" ? input.body : undefined,
        redirect: "manual",
        signal: AbortSignal.timeout(input.timeoutMs ?? 20_000),
      });
    } catch (error) {
      if (error instanceof PlaygroundError) throw error;
      const isTimeout = error instanceof Error && error.name === "TimeoutError";
      throw new PlaygroundError(
        isTimeout
          ? "The API did not respond within 20 seconds."
          : "Could not reach the API. The host may be offline or blocking requests.",
        isTimeout ? 504 : 502,
        isTimeout ? "timeout" : "network_error",
      );
    }
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      const next = new URL(location, current);
      if (next.origin !== current.origin) {
        throw new PlaygroundError(
          "The API redirected to a different origin. Cross-origin redirects are not followed.",
          502,
          "cross_origin_redirect",
        );
      }
      current = next;
      continue;
    }
    break;
  }
  if (!response) {
    throw new PlaygroundError("The API returned no response.", 502, "no_response");
  }

  const { text, bytes, truncated } = await readCapped(response);
  const responseHeaders: KeyValuePair[] = [];
  response.headers.forEach((value, name) => {
    if (name.toLowerCase() === "set-cookie") return;
    responseHeaders.push({ name, value });
  });

  return {
    status: response.status,
    ok: response.ok,
    url: current.toString(),
    headers: responseHeaders,
    body: text,
    bodyTruncated: truncated,
    bytes,
    contentType: response.headers.get("content-type"),
    durationMs: Date.now() - started,
  };
}

export function isSecretHeader(name: string): boolean {
  return /authorization|api[-_]?key|token|secret|password|cookie/i.test(name);
}
