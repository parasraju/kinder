import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Flag,
  Github,
  Globe,
  Loader2,
  Play,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  Square,
} from "lucide-react";
import type { Finding, FindingStatus, Scan } from "@shared/types";
import { integrationsApi, scansApi } from "@/lib/api";
import { PageHeader } from "@/components/layout";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Select,
  Skeleton,
  useToast,
} from "@/components/ui";
import { ProviderMark, SeverityBadge } from "@/components/bits";
import { absoluteDate, cn, relativeTime } from "@/lib/format";

const PAGE_SIZE = 20;

const NEXT_STATUS: Record<FindingStatus, FindingStatus | null> = {
  open: "acknowledged",
  acknowledged: "resolved",
  resolved: null,
  dismissed: null,
};

const STATUS_LABEL: Record<FindingStatus, string> = {
  open: "Acknowledge",
  acknowledged: "Mark resolved",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

function scanTone(status: Scan["status"]): "positive" | "rust" | "amber" | "neutral" {
  if (status === "complete") return "positive";
  if (status === "failed") return "rust";
  if (status === "running" || status === "queued") return "amber";
  return "neutral";
}

function FindingModal({
  finding,
  onClose,
  onUpdate,
  updating,
  onReport,
  reporting,
  hasGithubToken,
}: {
  finding: Finding | null;
  onClose: () => void;
  onUpdate: (status: FindingStatus) => void;
  updating: boolean;
  onReport: (finding: Finding) => void;
  reporting: boolean;
  hasGithubToken: boolean;
}) {
  if (!finding) return null;
  const next = NEXT_STATUS[finding.status];
  const isRepoValid = /^[\w.-]+\/[\w.-]+$/.test(finding.repo);
  const githubUrl = isRepoValid
    ? `https://github.com/${finding.repo}/blob/HEAD/${finding.filePath.split("/").map(encodeURIComponent).join("/")}#L${finding.line}`
    : null;

  return (
    <Modal
      open
      onClose={onClose}
      title={`${finding.providerName} key exposure`}
      description={`${finding.repo} · ${finding.filePath}:${finding.line}`}
      width="max-w-2xl"
      footer={
        <>
          {finding.status !== "dismissed" && finding.status !== "resolved" ? (
            <Button
              variant="ghost"
              className="mr-auto"
              onClick={() => onUpdate("dismissed")}
              disabled={updating || reporting}
            >
              Dismiss
            </Button>
          ) : (
            <div className="mr-auto" />
          )}

          {isRepoValid ? (
            finding.issueUrl ? (
              <Button
                variant="secondary"
                onClick={() => window.open(finding.issueUrl!, "_blank", "noreferrer")}
                className="gap-1.5"
                title="Open the created issue on GitHub"
              >
                <Github className="h-3.5 w-3.5" />
                <span>View Issue</span>
                <ExternalLink className="h-3 w-3 opacity-60" />
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => onReport(finding)}
                loading={reporting}
                disabled={updating}
                className="gap-1.5 border-rust/35 text-rust hover:bg-rust-soft hover:text-rust"
                title={
                  hasGithubToken
                    ? "Automatically report this finding as an issue on GitHub"
                    : "Connect GitHub in Settings → Integrations first"
                }
              >
                <Github className="h-3.5 w-3.5" />
                <span>Report Issue</span>
              </Button>
            )
          ) : null}

          <Button variant="secondary" onClick={onClose} disabled={reporting}>
            Close
          </Button>
          {next ? (
            <Button
              variant="primary"
              loading={updating}
              disabled={reporting}
              onClick={() => onUpdate(next)}
            >
              {STATUS_LABEL[finding.status]}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <ProviderMark name={finding.providerName} size={34} />
          <SeverityBadge severity={finding.severity} />
          <Badge tone={finding.status === "open" ? "rust" : finding.status === "acknowledged" ? "amber" : "positive"}>
            {finding.status}
          </Badge>
          {finding.issueUrl ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-positive/30 bg-positive-soft px-2 py-0.5 text-[11px] font-medium text-positive">
              <CheckCircle2 className="h-3 w-3" />
              Issue reported
            </span>
          ) : null}
          <span className="mono ml-auto text-[11px] text-faint">{finding.ruleId}</span>
        </div>

        {finding.issueUrl ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-positive/30 bg-positive-soft/80 px-3.5 py-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-positive" />
              <div className="min-w-0 text-[12px]">
                <p className="font-medium text-ink">Reported on GitHub</p>
                <p className="truncate text-[11px] text-muted">
                  Issue created in {finding.repo} with your GitHub token.
                </p>
              </div>
            </div>
            <a
              href={finding.issueUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-moss-ink hover:underline underline-offset-4"
            >
              Open issue
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ) : null}

        <div>
          <p className="text-[12px] font-medium text-ink-soft">Matched value (masked)</p>
          <p className="mono mt-1 rounded-lg border border-line bg-surface-2/50 px-2.5 py-2 text-[12px] text-ink-soft">
            {finding.maskedValue}
          </p>
          <p className="mt-1 text-[11px] text-faint">
            The full value was never stored. This workspace only keeps a hash and this mask.
          </p>
        </div>

        <div>
          <p className="text-[12px] font-medium text-ink-soft">Redacted context</p>
          <pre className="mono mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-surface-2/40 px-2.5 py-2 text-[11px] leading-relaxed text-muted scroll-thin">
            {finding.snippet}
          </pre>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-[12px]">
          <div>
            <dt className="text-muted">First seen</dt>
            <dd className="mt-0.5 text-ink-soft">{absoluteDate(finding.firstSeenAt)}</dd>
          </div>
          <div>
            <dt className="text-muted">Last seen</dt>
            <dd className="mt-0.5 text-ink-soft">{absoluteDate(finding.lastSeenAt)}</dd>
          </div>
        </dl>

        <div className="rounded-xl border border-amber/25 bg-amber-soft px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-amber">
            <ShieldAlert className="h-3.5 w-3.5" />
            Remediation
          </p>
          <ol className="mt-1 list-inside list-decimal space-y-0.5 text-[11.5px] leading-relaxed text-amber/90">
            <li>Rotate the key in the provider console today.</li>
            <li>Remove the literal from git history, not just the working tree.</li>
            <li>Move the secret to an environment variable or secret manager.</li>
          </ol>
        </div>

        {githubUrl ? (
          <a
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-moss-ink hover:underline underline-offset-4"
          >
            Open the file on GitHub
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>
    </Modal>
  );
}

export function ScansPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("all");
  const [provider, setProvider] = useState("");
  const [scanId, setScanId] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Finding | null>(null);

  const scans = useQuery({
    queryKey: ["scans"],
    queryFn: () => scansApi.list(10),
    refetchInterval: (query) =>
      query.state.data?.items.some((scan) => scan.status === "running" || scan.status === "queued")
        ? 2500
        : false,
  });
  const github = useQuery({ queryKey: ["github"], queryFn: integrationsApi.github });

  const findings = useQuery({
    queryKey: ["findings", { q, severity, status, provider, scanId, offset }],
    queryFn: () =>
      scansApi.findings({
        q: q || undefined,
        severity,
        status,
        provider: provider || undefined,
        scanId: scanId ?? undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    placeholderData: (previous) => previous,
  });

  const start = useMutation({
    mutationFn: (source: "demo" | "github" | "search") => scansApi.start({ source }),
    onSuccess: ({ scan }) => {
      toast(sourceLabel(scan) + " started");
      void queryClient.invalidateQueries({ queryKey: ["scans"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: (error) => toast(error instanceof Error ? error.message : "Could not start the scan", "error"),
  });

  const cancel = useMutation({
    mutationFn: (id: number) => scansApi.cancel(id),
    onSuccess: () => {
      toast("Scan cancelled");
      void queryClient.invalidateQueries({ queryKey: ["scans"] });
    },
    onError: () => toast("Could not cancel the scan", "error"),
  });

  const update = useMutation({
    mutationFn: ({ id, next }: { id: number; next: FindingStatus }) => scansApi.updateFinding(id, next),
    onSuccess: ({ item }) => {
      toast(`${item.providerName} finding marked ${item.status}`);
      setSelected((current) => (current && current.id === item.id ? item : current));
      void queryClient.invalidateQueries({ queryKey: ["findings"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: () => toast("Could not update the finding", "error"),
  });

  const report = useMutation({
    mutationFn: (f: Finding) => scansApi.reportFinding(f.id),
    onSuccess: ({ issueNumber, item }) => {
      toast(`Issue #${issueNumber} opened on ${item.repo}!`);
      setSelected(item);
      void queryClient.invalidateQueries({ queryKey: ["findings"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: (error) => {
      toast(
        error instanceof Error ? error.message : "Could not create issue on GitHub",
        "error",
      );
    },
  });

  const allScans = scans.data?.items ?? [];
  const activeScan = allScans.find((scan) => scan.status === "running" || scan.status === "queued");
  const items = findings.data?.items ?? [];
  const total = findings.data?.total ?? 0;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const providerOptions = findings.data?.providers ?? [];
  const connected = github.data?.connected ?? false;

  function resetFilters() {
    setQ("");
    setSeverity("all");
    setStatus("all");
    setProvider("");
    setScanId(null);
    setOffset(0);
  }

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Operations"
        title="Key scans"
        description="Find exposed provider keys in repositories across GitHub, then remediate them. Detection only — discovered keys are never used."
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Button
              variant="secondary"
              onClick={() => start.mutate("search")}
              loading={start.isPending && start.variables === "search"}
              disabled={!connected || Boolean(activeScan)}
              title={connected ? undefined : "Connect GitHub in Settings first"}
              className="flex-1 sm:flex-initial"
            >
              <Globe className="h-4 w-4" />
              Scan GitHub
            </Button>
            <Button
              variant="secondary"
              onClick={() => start.mutate("github")}
              loading={start.isPending && start.variables === "github"}
              disabled={!connected || Boolean(activeScan)}
              title={connected ? undefined : "Connect GitHub in Settings first"}
              className="flex-1 sm:flex-initial"
            >
              <Github className="h-4 w-4" />
              Scan my repos
            </Button>
            <Button
              variant="primary"
              onClick={() => start.mutate("demo")}
              loading={start.isPending && start.variables === "demo"}
              disabled={Boolean(activeScan)}
              className="flex-1 sm:flex-initial"
            >
              <Play className="h-4 w-4" />
              Run demo scan
            </Button>
          </div>
        }
      />

      {!connected ? (
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-line bg-surface-2/60 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-[12px] text-muted">
            <Github className="h-3.5 w-3.5" />
            GitHub is not connected. Demo scans work now; repository scans need a token.
          </p>
          <Link
            to="/settings"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-moss-ink hover:underline underline-offset-4"
          >
            Connect in Settings
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      ) : null}

      <Card className="mb-5 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold text-ink">Scan runs</p>
            <p className="text-[11.5px] text-muted">Scan your repos or search across all public GitHub repositories.</p>
          </div>
          {activeScan ? (
            <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-amber">
              <Loader2 className="h-3 w-3 animate-spin-slow" />
              {activeScan.status === "queued" ? "Queued" : "Scanning"} · {activeScan.filesScanned} files
            </span>
          ) : null}
        </div>

        {scans.isLoading ? (
          <div className="space-y-2 p-3">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : allScans.length === 0 ? (
          <EmptyState
            icon={<ScanSearch className="h-5 w-5" />}
            title="No scans yet"
            description="Run the demo scan to seed a realistic set of findings, then connect GitHub for a real check."
            action={
              <Button variant="primary" onClick={() => start.mutate("demo")} loading={start.isPending}>
                <Play className="h-4 w-4" />
                Run demo scan
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-line">
            {allScans.map((scan) => (
              <div key={scan.id} className="flex flex-col gap-2.5 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      scan.status === "complete"
                        ? "bg-positive"
                        : scan.status === "failed"
                          ? "bg-rust"
                          : scan.status === "cancelled"
                            ? "bg-line-strong"
                            : "bg-amber",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-medium text-ink">
                      {sourceLabel(scan)}
                      <Badge tone={scanTone(scan.status)} className="capitalize">
                        {scan.status}
                      </Badge>
                      {scanId === scan.id ? <Badge tone="moss">filtering</Badge> : null}
                    </p>
                    <p className="text-[11px] text-faint break-words">
                      {scan.scope} · {scan.reposScanned} repos · {scan.filesScanned} files ·{" "}
                      {scan.findingCount} findings · {relativeTime(scan.startedAt)}
                    </p>
                    {scan.error ? (
                      <p className="mt-0.5 text-[11px] text-rust break-words">{scan.error}</p>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-1.5 shrink-0 pl-4 sm:pl-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setScanId(scan.id === scanId ? null : scan.id);
                      setOffset(0);
                    }}
                  >
                    <Flag className="h-3.5 w-3.5" />
                    {scan.findingCount} findings
                  </Button>
                  {scan.status === "running" || scan.status === "queued" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-rust hover:bg-rust-soft"
                      onClick={() => cancel.mutate(scan.id)}
                    >
                      <Square className="h-3 w-3" />
                      Stop
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[14px] font-semibold text-ink">
            Findings
            <span className="ml-1.5 text-[12px] font-normal text-muted">{total}</span>
          </h2>
          <p className="text-[11.5px] text-muted">
            Masked values only. Rotate anything marked critical.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:flex-wrap sm:items-center sm:w-auto">
          <div className="relative col-span-2 sm:col-span-1">
            <Input
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
                setOffset(0);
              }}
              placeholder="Search repo or file…"
              className="h-8 w-full sm:w-44 pl-2.5 text-[12px]"
              aria-label="Search findings"
            />
          </div>
          <Select
            value={severity}
            onChange={(event) => {
              setSeverity(event.target.value);
              setOffset(0);
            }}
            className="h-8 w-full sm:w-32 text-[12px]"
            aria-label="Filter by severity"
          >
            <option value="all">Severity</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setOffset(0);
            }}
            className="h-8 w-full sm:w-36 text-[12px]"
            aria-label="Filter by status"
          >
            <option value="all">Status</option>
            <option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </Select>
          <Select
            value={provider}
            onChange={(event) => {
              setProvider(event.target.value);
              setOffset(0);
            }}
            className="h-8 w-full col-span-2 sm:col-span-1 sm:w-40 text-[12px]"
            aria-label="Filter by provider"
          >
            <option value="">Provider</option>
            {providerOptions.map((option) => (
              <option key={option.provider_slug} value={option.provider_slug}>
                {option.provider_name} ({option.count})
              </option>
            ))}
          </Select>
          {scanId || q || severity !== "all" || status !== "all" || provider ? (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="col-span-2 sm:col-span-1">
              Reset
            </Button>
          ) : null}
        </div>
      </div>

      {findings.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ShieldCheck className="h-5 w-5" />}
            title={total === 0 ? "No findings" : "Nothing matches these filters"}
            description={
              total === 0
                ? "Scans have not found an exposed key yet. Run a scan or approve a smaller filter set."
                : "Adjust the severity, status, or provider filter to see more."
            }
            action={
              total === 0 ? (
                <Button variant="secondary" onClick={() => start.mutate("demo")}>
                  Run demo scan
                </Button>
              ) : (
                <Button variant="secondary" onClick={resetFilters}>
                  Reset filters
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="divide-y divide-line">
              {items.map((finding) => (
                <button
                  key={finding.id}
                  type="button"
                  onClick={() => setSelected(finding)}
                  className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2/60 sm:px-4 sm:py-3"
                >
                  <ProviderMark name={finding.providerName} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[12.5px] font-medium text-ink">{finding.providerName}</span>
                      <SeverityBadge severity={finding.severity} />
                      <Badge
                        tone={
                          finding.status === "open"
                            ? "rust"
                            : finding.status === "acknowledged"
                              ? "amber"
                              : finding.status === "dismissed"
                                ? "neutral"
                                : "positive"
                        }
                      >
                        {finding.status}
                      </Badge>
                      {finding.issueUrl ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-md border border-positive/30 bg-positive-soft px-1.5 py-0.5 text-[10.5px] font-medium text-positive"
                          title="Issue reported on GitHub"
                        >
                          <Github className="h-2.5 w-2.5" />
                          Reported
                        </span>
                      ) : null}
                    </div>
                    <p className="mono truncate text-[11px] text-muted">
                      {finding.repo}/{finding.filePath}:{finding.line}
                    </p>
                  </div>
                  <span className="mono hidden shrink-0 text-[11px] text-faint md:block">
                    {finding.maskedValue}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-faint" />
                </button>
              ))}
            </div>
          </Card>

          <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11.5px] text-muted text-center sm:text-left">
              Page {page} of {pages}
              {scanId ? " · filtered to one scan" : ""}
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

      <div className="mt-6 flex items-start gap-2 rounded-xl border border-line bg-surface-2/40 px-3.5 py-3">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />
        <p className="text-[11.5px] leading-relaxed text-muted">
          Kinder never sends a discovered key to a provider to verify it. Treat every finding as
          compromised until the key is rotated.
        </p>
      </div>

      <FindingModal
        finding={selected}
        onClose={() => setSelected(null)}
        onUpdate={(next) =>
          selected ? update.mutate({ id: selected.id, next }) : undefined
        }
        updating={update.isPending}
        onReport={(f) => {
          if (!connected) {
            toast("Connect your GitHub account in Settings → Integrations first.", "error");
            return;
          }
          report.mutate(f);
        }}
        reporting={report.isPending}
        hasGithubToken={connected}
      />
    </div>
  );
}

function sourceLabel(scan: Scan): string {
  if (scan.source === "demo") return "Demo scan";
  if (scan.source === "search") return "Public code search";
  return "GitHub scan";
}
