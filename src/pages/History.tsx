import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Eraser,
  History,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { RequestRecord, RequestSummary } from "@shared/types";
import { catalogApi, historyApi } from "@/lib/api";
import { PageHeader } from "@/components/layout";
import {
  Badge,
  Button,
  Card,
  CopyButton,
  EmptyState,
  Input,
  Modal,
  Select,
  Skeleton,
  useToast,
} from "@/components/ui";
import { cn, formatBytes, methodClasses, relativeTime } from "@/lib/format";

const PAGE_SIZE = 15;

function StatusPill({ ok, status }: { ok: boolean; status: number | null }) {
  return (
    <span
      className={cn(
        "mono inline-flex min-w-[38px] items-center justify-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
        ok ? "border-positive/25 bg-positive-soft text-positive" : "border-rust/25 bg-rust-soft text-rust",
      )}
    >
      {status ?? "ERR"}
    </span>
  );
}

function KeyValueTable({ data }: { data: Record<string, string> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return <p className="text-[12px] text-faint">None</p>;
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <table className="w-full text-left">
        <tbody className="divide-y divide-line">
          {entries.map(([key, value]) => (
            <tr key={key}>
              <td className="mono w-2/5 break-all bg-surface-2/40 px-2.5 py-1.5 align-top text-[11px] text-muted">
                {key}
              </td>
              <td className="mono break-all px-2.5 py-1.5 text-[11px] text-ink-soft">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailBody({ record }: { record: RequestRecord }) {
  const [tab, setTab] = useState<"request" | "response">("request");
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
        <div>
          <dt className="text-muted">Status</dt>
          <dd className="mt-1">
            <StatusPill ok={record.ok} status={record.status} />
          </dd>
        </div>
        <div>
          <dt className="text-muted">Duration</dt>
          <dd className="mono mt-1 text-ink-soft">{record.durationMs ?? "—"} ms</dd>
        </div>
        <div>
          <dt className="text-muted">Size</dt>
          <dd className="mono mt-1 text-ink-soft">{formatBytes(record.responseBytes)}</dd>
        </div>
        <div>
          <dt className="text-muted">When</dt>
          <dd className="mt-1 text-ink-soft">{relativeTime(record.createdAt)}</dd>
        </div>
      </dl>

      <div>
        <p className="text-[12px] font-medium text-ink-soft">URL</p>
        <div className="mono mt-1 flex items-start justify-between gap-2 rounded-lg border border-line bg-surface-2/40 px-2.5 py-1.5 text-[11px] text-ink-soft">
          <span className="break-all">{record.url}</span>
          <CopyButton value={record.url} label="" />
        </div>
      </div>

      {record.error ? (
        <p className="rounded-lg border border-rust/25 bg-rust-soft px-3 py-2 text-[12px] text-rust">
          {record.error}
        </p>
      ) : null}

      <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface-2/70 p-0.5">
        {(["request", "response"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              "rounded-md px-2.5 py-1 text-[12px] font-medium capitalize",
              tab === value ? "bg-surface text-ink shadow-soft" : "text-muted hover:text-ink",
            )}
          >
            {value}
          </button>
        ))}
      </div>

      {tab === "request" ? (
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-[12px] font-medium text-ink-soft">Headers (redacted)</p>
            <KeyValueTable data={record.requestHeaders} />
          </div>
          <div>
            <p className="mb-1 text-[12px] font-medium text-ink-soft">Query</p>
            <KeyValueTable data={record.requestQuery} />
          </div>
          <div>
            <p className="mb-1 text-[12px] font-medium text-ink-soft">Body</p>
            <pre className="mono max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-surface-2/30 px-2.5 py-2 text-[11px] leading-relaxed text-ink-soft scroll-thin">
              {record.requestBody || "None"}
            </pre>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-[12px] font-medium text-ink-soft">Headers</p>
            <KeyValueTable data={record.responseHeaders} />
          </div>
          <div>
            <p className="mb-1 flex items-center justify-between text-[12px] font-medium text-ink-soft">
              Body
              {record.responseBody ? <CopyButton value={record.responseBody} /> : null}
            </p>
            <pre className="mono max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-surface-2/30 px-2.5 py-2 text-[11px] leading-relaxed text-ink-soft scroll-thin">
              {record.responseBody || "Empty response body."}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailModal({
  summary,
  onClose,
  onDeleted,
}: {
  summary: RequestSummary | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const detail = useQuery({
    queryKey: ["history", summary?.id],
    queryFn: () => historyApi.detail(summary!.id),
    enabled: Boolean(summary),
  });

  const remove = useMutation({
    mutationFn: () => historyApi.remove(summary!.id),
    onSuccess: () => {
      toast("Request removed");
      onDeleted();
      onClose();
    },
    onError: () => toast("Could not remove this request", "error"),
  });

  return (
    <Modal
      open={Boolean(summary)}
      onClose={onClose}
      title={summary ? `${summary.method} ${summary.apiName}` : "Request"}
      description={summary?.url}
      width="max-w-2xl"
      footer={
        <>
          <Button
            variant="ghost"
            className="mr-auto text-rust hover:bg-rust-soft"
            loading={remove.isPending}
            onClick={() => remove.mutate()}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      {detail.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-40" />
        </div>
      ) : detail.data ? (
        <DetailBody record={detail.data.item} />
      ) : (
        <p className="text-[13px] text-muted">Could not load this request.</p>
      )}
    </Modal>
  );
}

export function HistoryPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [provider, setProvider] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<RequestSummary | null>(null);
  const [clearOpen, setClearOpen] = useState(false);

  const catalog = useQuery({ queryKey: ["catalog"], queryFn: catalogApi.list });
  const history = useQuery({
    queryKey: ["history", { q, status, provider, offset }],
    queryFn: () => historyApi.list({ q: q || undefined, status, provider: provider || undefined, limit: PAGE_SIZE, offset }),
    placeholderData: (previous) => previous,
  });

  const clear = useMutation({
    mutationFn: historyApi.clear,
    onSuccess: ({ deleted }) => {
      toast(`${deleted} request${deleted === 1 ? "" : "s"} cleared`);
      setClearOpen(false);
      setOffset(0);
      void queryClient.invalidateQueries({ queryKey: ["history"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: () => toast("Could not clear history", "error"),
  });

  const items = history.data?.items ?? [];
  const total = history.data?.total ?? 0;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Operations"
        title="Request history"
        description="Every playground call, with secrets redacted before storage. Bodies are capped and kept local."
        actions={
          <Button variant="secondary" onClick={() => setClearOpen(true)} disabled={total === 0}>
            <Eraser className="h-4 w-4" />
            Clear history
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setOffset(0);
            }}
            placeholder="Search by URL or API name…"
            className="h-9 pl-9"
            aria-label="Search history"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setOffset(0);
            }}
            className="h-9 w-full sm:w-36"
            aria-label="Filter by result"
          >
            <option value="all">All results</option>
            <option value="success">Success</option>
            <option value="error">Errors</option>
          </Select>
          <Select
            value={provider}
            onChange={(event) => {
              setProvider(event.target.value);
              setOffset(0);
            }}
            className="h-9 w-full sm:w-44"
            aria-label="Filter by provider"
          >
            <option value="">All providers</option>
            {(catalog.data?.providers ?? []).map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {history.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-14" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<History className="h-5 w-5" />}
            title={total === 0 ? "No requests yet" : "No matching requests"}
            description={
              total === 0
                ? "Send a request from the playground and it will appear here with secrets redacted."
                : "Loosen the filters or search for a different URL."
            }
            action={
              total === 0 ? (
                <Button onClick={() => navigate("/playground")}>Open playground</Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQ("");
                    setStatus("all");
                    setProvider("");
                  }}
                >
                  Clear filters
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="divide-y divide-line">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelected(item)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2/60"
                >
                  <span
                    className={cn(
                      "mono w-14 shrink-0 rounded-md border px-1.5 py-0.5 text-center text-[10.5px] font-semibold",
                      methodClasses(item.method),
                    )}
                  >
                    {item.method}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-[12.5px] font-medium text-ink">{item.apiName}</p>
                      <span className="mono text-[10.5px] text-faint sm:hidden">
                        · {item.durationMs ?? "—"} ms
                      </span>
                    </div>
                    <p className="mono truncate text-[11px] text-muted">{item.url}</p>
                  </div>
                  <StatusPill ok={item.ok} status={item.status} />
                  <span className="mono hidden w-16 shrink-0 text-right text-[11px] text-muted sm:block">
                    {item.durationMs ?? "—"} ms
                  </span>
                  <span className="hidden w-16 shrink-0 text-right text-[11px] text-faint md:block">
                    {relativeTime(item.createdAt)}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-faint" />
                </button>
              ))}
            </div>
          </Card>

          <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11.5px] text-muted text-center sm:text-left">
              {total} request{total === 1 ? "" : "s"} · page {page} of {pages}
            </p>
            <div className="flex items-center justify-center sm:justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Next
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}

      <DetailModal
        key={selected?.id ?? "none"}
        summary={selected}
        onClose={() => setSelected(null)}
        onDeleted={() => void queryClient.invalidateQueries({ queryKey: ["history"] })}
      />
      <Modal
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title="Clear request history?"
        description="Every stored request in this workspace will be removed. Credentials are not affected."
        footer={
          <>
            <Button variant="ghost" onClick={() => setClearOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={clear.isPending} onClick={() => clear.mutate()}>
              Clear {total} request{total === 1 ? "" : "s"}
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3 rounded-xl border border-rust/20 bg-rust-soft/60 px-3 py-3">
          <X className="mt-0.5 h-4 w-4 shrink-0 text-rust" />
          <p className="text-[12.5px] leading-relaxed text-ink-soft">
            This cannot be undone. Response bodies saved in history will be deleted along with the
            metadata.
          </p>
        </div>
      </Modal>

      <p className="mt-6 flex items-center gap-1.5 text-[11px] text-faint">
        <Clock className="h-3 w-3" />
        History keeps request and response bodies locally, capped at 120 KB per record.
      </p>
      <div className="hidden">
        <Badge>history</Badge>
      </div>
    </div>
  );
}
