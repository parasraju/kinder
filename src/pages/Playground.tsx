import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Braces,
  CheckCircle2,
  History,
  Info,
  KeyRound,
  Plus,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import type {
  CredentialSummary,
  HttpMethod,
  PlaygroundRequest,
  PlaygroundResponse,
  Provider,
} from "@shared/types";
import { catalogApi, credentialsApi, playgroundApi, savedApi } from "@/lib/api";
import { PageHeader } from "@/components/layout";
import {
  Badge,
  Button,
  Card,
  CopyButton,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  Textarea,
  Toggle,
  useToast,
} from "@/components/ui";
import { ProviderMark } from "@/components/bits";
import { cn, formatBytes, toCurl } from "@/lib/format";

type Target = { key: string; label: string; provider: Provider | null; savedId: number | null; baseUrl: string };

interface Pair {
  id: number;
  name: string;
  value: string;
}

let pairSeq = 0;
const makePair = (name = "", value = ""): Pair => ({ id: ++pairSeq, name, value });

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function PairEditor({
  label,
  pairs,
  onChange,
  placeholderName,
  placeholderValue,
}: {
  label: string;
  pairs: Pair[];
  onChange: (next: Pair[]) => void;
  placeholderName: string;
  placeholderValue: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-medium text-ink-soft">{label}</p>
        <button
          type="button"
          onClick={() => onChange([...pairs, makePair()])}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted hover:bg-surface-2 hover:text-ink"
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      </div>
      {pairs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-2.5 py-2 text-[11.5px] text-faint">
          None
        </p>
      ) : (
        <div className="space-y-1.5">
          {pairs.map((pair) => (
            <div key={pair.id} className="flex items-center gap-1.5">
              <Input
                value={pair.name}
                onChange={(event) =>
                  onChange(pairs.map((row) => (row.id === pair.id ? { ...row, name: event.target.value } : row)))
                }
                placeholder={placeholderName}
                className="h-8 min-w-0 flex-1 text-[12px]"
                aria-label={`${label} name`}
              />
              <Input
                value={pair.value}
                onChange={(event) =>
                  onChange(pairs.map((row) => (row.id === pair.id ? { ...row, value: event.target.value } : row)))
                }
                placeholder={placeholderValue}
                className="h-8 min-w-0 flex-[1.4] text-[12px]"
                aria-label={`${label} value`}
              />
              <button
                type="button"
                onClick={() => onChange(pairs.filter((row) => row.id !== pair.id))}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-faint hover:bg-surface-2 hover:text-rust"
                aria-label={`Remove ${label} row`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewCredentialModal({
  open,
  provider,
  onClose,
  onCreated,
}: {
  open: boolean;
  provider: Provider | null;
  onClose: () => void;
  onCreated: (credential: CredentialSummary) => void;
}) {
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      credentialsApi.create({
        providerSlug: provider!.slug,
        label: label.trim() || "Default",
        secret: secret.trim(),
      }),
    onSuccess: ({ item }) => {
      toast("Credential sealed");
      setLabel("");
      setSecret("");
      setError(null);
      onCreated(item);
      onClose();
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : "Could not save the credential"),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={provider ? `Add a ${provider.name} credential` : "Add a credential"}
      description="Encrypted with AES-256-GCM before storage. It is never shown again."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={!secret.trim()}
            onClick={() => create.mutate()}
          >
            Seal credential
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Label" htmlFor="cred-label" hint="For example: personal, staging, team.">
          <Input
            id="cred-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Personal"
          />
        </Field>
        <Field label="Secret" htmlFor="cred-secret" hint={provider?.keyHint}>
          <Input
            id="cred-secret"
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            placeholder="Paste the key"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        {error ? (
          <p className="rounded-lg border border-rust/25 bg-rust-soft px-3 py-2 text-[12.5px] text-rust">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

function prettyBody(body: string, contentType: string | null): string {
  const looksJson = contentType?.includes("json") || /^\s*[[{]/.test(body);
  if (!looksJson || !body) return body;
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

function ResponsePanel({ response }: { response: PlaygroundResponse }) {
  const [tab, setTab] = useState<"body" | "headers">("body");
  const headers = Object.entries(response.responseHeaders);
  const body = prettyBody(response.body, response.contentType);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-line px-3.5 py-3 sm:px-4">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
          {response.ok ? (
            <CheckCircle2 className="h-4 w-4 text-positive shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 text-rust shrink-0" />
          )}
          <span className="mono text-[13px] font-semibold text-ink">
            {response.status ?? "ERR"} {response.statusText ?? ""}
          </span>
          <Badge tone="neutral" className="shrink-0">{response.durationMs} ms</Badge>
          <Badge tone="neutral" className="shrink-0">{formatBytes(response.bodyBytes)}</Badge>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setTab("body")}
            className={cn(
              "rounded-md px-2 py-1 text-[11.5px] font-medium",
              tab === "body" ? "bg-surface-2 text-ink" : "text-muted hover:text-ink",
            )}
          >
            Body
          </button>
          <button
            type="button"
            onClick={() => setTab("headers")}
            className={cn(
              "rounded-md px-2 py-1 text-[11.5px] font-medium",
              tab === "headers" ? "bg-surface-2 text-ink" : "text-muted hover:text-ink",
            )}
          >
            Headers
          </button>
          <CopyButton value={tab === "body" ? body : JSON.stringify(response.responseHeaders, null, 2)} />
        </div>
      </div>

      {response.error || response.warnings.length > 0 ? (
        <div className="space-y-1 border-b border-line bg-surface-2/40 px-4 py-2.5">
          {response.error ? (
            <p className="flex items-start gap-1.5 text-[11.5px] text-rust">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {response.error}
            </p>
          ) : null}
          {response.warnings.map((warning) => (
            <p key={warning} className="flex items-start gap-1.5 text-[11.5px] text-amber">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              {warning}
            </p>
          ))}
        </div>
      ) : null}

      {tab === "body" ? (
        <pre className="mono max-h-[460px] overflow-auto whitespace-pre-wrap break-words px-4 py-3 text-[11.5px] leading-relaxed text-ink-soft scroll-thin">
          {body || <span className="text-faint">Empty response body.</span>}
        </pre>
      ) : (
        <div className="max-h-[460px] overflow-auto scroll-thin">
          <table className="w-full text-left">
            <tbody className="divide-y divide-line">
              {headers.map(([name, value]) => (
                <tr key={name}>
                  <td className="mono w-2/5 align-top px-4 py-1.5 text-[11px] text-muted">{name}</td>
                  <td className="mono break-all px-4 py-1.5 text-[11px] text-ink-soft">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {response.requestId ? (
        <div className="border-t border-line px-4 py-2">
          <Link
            to="/history"
            className="inline-flex items-center gap-1 text-[11.5px] font-medium text-moss-ink hover:underline underline-offset-4"
          >
            <History className="h-3 w-3" />
            Saved to history
          </Link>
        </div>
      ) : null}
    </Card>
  );
}

export function PlaygroundPage() {
  const [params] = useSearchParams();
  const toast = useToast();
  const queryClient = useQueryClient();

  const saved = useQuery({ queryKey: ["saved-apis"], queryFn: savedApi.list });
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: catalogApi.list });
  const credentials = useQuery({ queryKey: ["credentials"], queryFn: credentialsApi.list });

  const targets = useMemo<Target[]>(() => {
    const list: Target[] = [];
    for (const provider of catalog.data?.providers ?? []) {
      list.push({
        key: `catalog:${provider.slug}`,
        label: provider.name,
        provider,
        savedId: null,
        baseUrl: provider.baseUrl,
      });
    }
    for (const item of saved.data?.items ?? []) {
      if (item.slug) continue;
      list.push({
        key: `saved:${item.id}`,
        label: `${item.name} (custom)`,
        provider: null,
        savedId: item.id,
        baseUrl: item.baseUrl,
      });
    }
    return list;
  }, [catalog.data, saved.data]);

  const initialKey = useMemo(() => {
    const api = params.get("api");
    const savedParam = params.get("saved");
    if (api) return `catalog:${api}`;
    if (savedParam) return `saved:${savedParam}`;
    return "";
  }, [params]);

  const [targetKey, setTargetKey] = useState(initialKey);
  const target = targets.find((item) => item.key === targetKey) ?? null;
  const provider = target?.provider ?? null;
  const [methodOverride, setMethodOverride] = useState<HttpMethod | null>(null);
  const [pathOverride, setPathOverride] = useState<string | null>(null);
  const method = methodOverride ?? provider?.sampleMethod ?? "GET";
  const path = pathOverride ?? provider?.samplePath ?? "/";
  const [queryPairs, setQueryPairs] = useState<Pair[]>([]);
  const [headerPairs, setHeaderPairs] = useState<Pair[]>([]);
  const [body, setBody] = useState("");
  const [credentialId, setCredentialId] = useState<number | null>(null);
  const [saveHistory, setSaveHistory] = useState(true);
  const [response, setResponse] = useState<PlaygroundResponse | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [credModalOpen, setCredModalOpen] = useState(false);

  const providerCredentials = (credentials.data?.items ?? []).filter(
    (item) => provider && item.providerSlug === provider.slug,
  );

  function selectTarget(key: string) {
    setTargetKey(key);
    setMethodOverride(null);
    setPathOverride(null);
    setQueryPairs([]);
    setHeaderPairs([]);
    setBody("");
    setCredentialId(null);
    setResponse(null);
    setRequestError(null);
  }

  const send = useMutation({
    mutationFn: () => {
      if (!target) throw new Error("Choose an API first.");
      const payload: PlaygroundRequest = {
        ...(target.provider ? { providerSlug: target.provider.slug } : { savedApiId: target.savedId ?? undefined }),
        method,
        path: path.trim() || "/",
        query: queryPairs.filter((pair) => pair.name.trim()).map(({ name, value }) => ({ name, value })),
        headers: headerPairs.filter((pair) => pair.name.trim()).map(({ name, value }) => ({ name, value })),
        body: method === "GET" || method === "DELETE" ? (body.trim() ? body : null) : body.trim() ? body : null,
        credentialId: target.provider ? credentialId : null,
        saveHistory,
      };
      return playgroundApi.send(payload);
    },
    onSuccess: (result) => {
      setResponse(result);
      setRequestError(null);
      void queryClient.invalidateQueries({ queryKey: ["history"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
      void queryClient.invalidateQueries({ queryKey: ["credentials"] });
      if (result.ok) toast(`${result.status} · ${result.durationMs} ms`);
      else toast(result.error ?? "The request did not succeed", "error");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "The request could not be sent.";
      setRequestError(message);
      setResponse(null);
    },
  });

  const previewUrl = target
    ? `${target.baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}${
        queryPairs.some((pair) => pair.name.trim())
          ? `?${queryPairs
              .filter((pair) => pair.name.trim())
              .map((pair) => `${encodeURIComponent(pair.name)}=${encodeURIComponent(pair.value)}`)
              .join("&")}`
          : ""
      }`
    : "";

  const curlPreview = target
    ? toCurl({
        method,
        url: previewUrl || target.baseUrl,
        headers: {
          ...(provider && provider.authScheme === "bearer"
            ? { Authorization: `Bearer ${credentialId ? "<credential>" : "<your-key>"}` }
            : {}),
          ...Object.fromEntries(headerPairs.filter((pair) => pair.name.trim()).map((p) => [p.name, p.value])),
        },
        body: method === "GET" ? null : body.trim() || null,
      })
    : "";

  if (catalog.isLoading || saved.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-1/2" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Operations"
        title="Playground"
        description="Send a request with your own stored credential. History is redacted; secrets never leave this machine except to the API you choose."
        actions={
          <Button variant="secondary" onClick={() => setCredModalOpen(true)} disabled={!provider}>
            <KeyRound className="h-4 w-4" />
            Add credential
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card className="p-4">
            <div className="space-y-3">
              <Field label="API" htmlFor="pg-target">
                <Select id="pg-target" value={targetKey} onChange={(event) => selectTarget(event.target.value)}>
                  <option value="">Choose an API…</option>
                  <optgroup label="Catalog">
                    {targets
                      .filter((item) => item.provider)
                      .map((item) => (
                        <option key={item.key} value={item.key}>
                          {item.label}
                        </option>
                      ))}
                  </optgroup>
                  {targets.some((item) => !item.provider) ? (
                    <optgroup label="Custom saved APIs">
                      {targets
                        .filter((item) => !item.provider)
                        .map((item) => (
                          <option key={item.key} value={item.key}>
                            {item.label}
                          </option>
                        ))}
                    </optgroup>
                  ) : null}
                </Select>
              </Field>

              {!target ? (
                <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center">
                  <Braces className="mx-auto h-5 w-5 text-faint" />
                  <p className="mt-2 text-[13px] font-medium text-ink">Pick an API to begin</p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    Catalog APIs know their auth scheme. Custom APIs take explicit headers.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2/50 px-3 py-2">
                    <ProviderMark name={target.label.replace(" (custom)", "")} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium text-ink">{target.label}</p>
                      <p className="mono truncate text-[11px] text-muted">{target.baseUrl}</p>
                    </div>
                    {provider?.playgroundSupported === false ? <Badge tone="amber">Manual</Badge> : null}
                  </div>

                  {provider?.playgroundSupported === false ? (
                    <div className="rounded-xl border border-amber/25 bg-amber-soft px-3 py-2 text-[11.5px] leading-relaxed text-amber">
                      {provider.playgroundNote}
                    </div>
                  ) : null}

                  <div className="flex items-center gap-1.5">
                    <Select
                      value={method}
                      onChange={(event) => setMethodOverride(event.target.value as HttpMethod)}
                      className="h-9 w-24 shrink-0 text-[12px] sm:w-28"
                      aria-label="HTTP method"
                    >
                      {METHODS.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </Select>
                    <Input
                      value={path}
                      onChange={(event) => setPathOverride(event.target.value)}
                      placeholder="/v1/example"
                      className="mono h-9 min-w-0 flex-1 text-[12px]"
                      aria-label="Request path"
                    />
                  </div>

                  <div className="mono truncate rounded-lg border border-line bg-surface-2/40 px-2.5 py-1.5 text-[11px] text-muted">
                    {previewUrl || "—"}
                  </div>

                  {provider ? (
                    <Field label="Credential" htmlFor="pg-cred" hint={`${provider.authScheme} · ${provider.keyHint}`}>
                      <div className="flex gap-1.5">
                        <Select
                          id="pg-cred"
                          value={credentialId ?? ""}
                          onChange={(event) => setCredentialId(event.target.value ? Number(event.target.value) : null)}
                          className="h-9 flex-1 text-[12px]"
                        >
                          <option value="">No credential (unauthenticated)</option>
                          {providerCredentials.map((credential) => (
                            <option key={credential.id} value={credential.id}>
                              {credential.label} · {credential.hint}
                            </option>
                          ))}
                        </Select>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-9"
                          onClick={() => setCredModalOpen(true)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </Field>
                  ) : null}

                  <PairEditor
                    label="Query parameters"
                    pairs={queryPairs}
                    onChange={setQueryPairs}
                    placeholderName="limit"
                    placeholderValue="10"
                  />

                  <PairEditor
                    label="Headers"
                    pairs={headerPairs}
                    onChange={setHeaderPairs}
                    placeholderName="Accept"
                    placeholderValue="application/json"
                  />

                  {method !== "GET" ? (
                    <Field label="Body" htmlFor="pg-body" hint="Sent as-is. JSON content type is added automatically.">
                      <Textarea
                        id="pg-body"
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        placeholder={'{\n  "example": true\n}'}
                        className="mono min-h-28 text-[12px]"
                        spellCheck={false}
                      />
                    </Field>
                  ) : null}

                  <Toggle
                    checked={saveHistory}
                    onChange={setSaveHistory}
                    label="Save to history"
                    description="Headers and query values are redacted before storage."
                  />

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      variant="primary"
                      className="flex-1 min-w-[140px]"
                      loading={send.isPending}
                      disabled={provider?.playgroundSupported === false}
                      onClick={() => send.mutate()}
                    >
                      <Send className="h-4 w-4" />
                      Send request
                    </Button>
                    <CopyButton value={curlPreview} label="cURL" className="h-10 shrink-0 border border-line px-3" />
                  </div>
                  {requestError ? (
                    <p className="rounded-lg border border-rust/25 bg-rust-soft px-3 py-2 text-[12px] text-rust">
                      {requestError}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </Card>

          {target ? (
            <details className="group rounded-2xl border border-line bg-surface px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-[12px] font-medium text-ink-soft">
                cURL equivalent
                <ArrowRight className="h-3.5 w-3.5 text-faint transition-transform group-open:rotate-90" />
              </summary>
              <pre className="mono mt-3 overflow-x-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed text-muted scroll-thin">
                {curlPreview}
              </pre>
            </details>
          ) : null}
        </div>

        <div className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          {send.isPending ? (
            <Card className="space-y-3 p-4">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-40" />
            </Card>
          ) : response ? (
            <ResponsePanel key={response.durationMs + String(response.requestId)} response={response} />
          ) : (
            <Card>
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-20 text-center">
                <Send className="h-5 w-5 text-faint" />
                <p className="text-[13px] font-medium text-ink">No response yet</p>
                <p className="max-w-xs text-[12px] leading-relaxed text-muted">
                  Pick an API, attach one of your credentials, and send a request. The response stays
                  in this session.
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>

      <NewCredentialModal
        open={credModalOpen}
        provider={provider}
        onClose={() => setCredModalOpen(false)}
        onCreated={(credential) => {
          void queryClient.invalidateQueries({ queryKey: ["credentials"] });
          void queryClient.invalidateQueries({ queryKey: ["overview"] });
          setCredentialId(credential.id);
        }}
      />
    </div>
  );
}
