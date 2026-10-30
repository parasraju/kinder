import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bookmark,
  Compass,
  Flag,
  Gauge,
  KeyRound,
  ScanSearch,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import type { ActivityItem } from "@shared/types";
import { ApiError, overviewApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn, relativeTime, shortDate } from "@/lib/format";
import { PageHeader } from "@/components/layout";
import { Badge, Button, Card, EmptyState, Skeleton } from "@/components/ui";
import { ProviderMark, SectionHeading, StatCard } from "@/components/bits";

const activityIcon: Record<ActivityItem["kind"], typeof Activity> = {
  finding: Flag,
  request: Terminal,
  scan: ScanSearch,
  credential: KeyRound,
  "saved-api": Bookmark,
};

const toneDot: Record<ActivityItem["tone"], string> = {
  neutral: "bg-line-strong",
  positive: "bg-positive",
  warning: "bg-amber",
  critical: "bg-rust",
};

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function OverviewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const overview = useQuery({ queryKey: ["overview"], queryFn: overviewApi.get });

  if (overview.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-2/3" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (overview.isError || !overview.data) {
    const isUnauthorized = overview.error instanceof ApiError && overview.error.status === 401;
    return (
      <Card>
        <EmptyState
          icon={<AlertTriangle className="h-5 w-5" />}
          title={isUnauthorized ? "Session ended" : "Could not load the workspace"}
          description={
            isUnauthorized
              ? "Your session has ended or is missing. Please sign in again to open your workspace."
              : overview.error instanceof Error
                ? overview.error.message
                : "The API did not return an overview. Check that the server is running, then retry."
          }
          action={
            isUnauthorized ? (
              <Button variant="primary" onClick={() => navigate("/login")}>
                Sign in
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => void overview.refetch()}>
                Retry
              </Button>
            )
          }
        />
      </Card>
    );
  }

  const { stats, activity, exposureByProvider, recentScans, suggestions } = overview.data;
  const totalExposure = Math.max(1, exposureByProvider.reduce((sum, row) => sum + row.count, 0));
  const firstName = user?.name.split(" ")[0] ?? "there";

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Workspace"
        title={`${greeting()}, ${firstName}`}
        description="Your key hygiene, catalog, and request console in one place."
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Button variant="secondary" onClick={() => navigate("/explore")} className="flex-1 sm:flex-initial">
              <Compass className="h-4 w-4" />
              Explore APIs
            </Button>
            <Button variant="primary" onClick={() => navigate("/scans")} className="flex-1 sm:flex-initial">
              <ScanSearch className="h-4 w-4" />
              Run a scan
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open findings"
          value={stats.openFindings}
          hint={`${stats.resolvedThisMonth} resolved this month`}
          icon={<Flag className="h-3.5 w-3.5" />}
          tone={stats.openFindings > 0 ? "alert" : "default"}
        />
        <StatCard
          label="Critical keys"
          value={stats.criticalFindings}
          hint={stats.criticalFindings > 0 ? "Revoke or rotate today" : "No critical exposure"}
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          tone={stats.criticalFindings > 0 ? "alert" : "positive"}
        />
        <StatCard
          label="Saved APIs"
          value={stats.savedApis}
          hint={`${stats.credentials} credentials in the vault`}
          icon={<Bookmark className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="Requests this week"
          value={stats.requestsThisWeek}
          hint={
            stats.successRate === null
              ? "No calls logged yet"
              : `${stats.successRate}% success · ${stats.medianLatencyMs ?? 0} ms median`
          }
          icon={<Gauge className="h-3.5 w-3.5" />}
          tone={stats.successRate !== null && stats.successRate >= 90 ? "positive" : "default"}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-4">
          <Card className="p-4">
            <SectionHeading
              title="Exposure by provider"
              description="Open and acknowledged findings across tracked repositories."
              action={
                <Link
                  to="/scans"
                  className="text-[12px] font-medium text-moss-ink underline-offset-4 hover:underline"
                >
                  Review
                </Link>
              }
            />
            {exposureByProvider.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line py-8 text-center">
                <ShieldCheck className="mx-auto h-5 w-5 text-positive" />
                <p className="mt-2 text-[13px] font-medium text-ink">No open exposure</p>
                <p className="text-[12px] text-muted">Run a scan to check your repositories.</p>
              </div>
            ) : (
              <ul className="space-y-3 pt-1">
                {exposureByProvider.map((row) => (
                  <li key={row.providerSlug} className="flex items-center gap-3">
                    <ProviderMark name={row.providerName} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-[13px] font-medium text-ink">
                          {row.providerName}
                        </span>
                        <span className="mono shrink-0 text-[11px] text-muted">{row.count}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-moss/70"
                          style={{ width: `${Math.max(6, (row.count / totalExposure) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="px-4 pt-4">
              <SectionHeading
                title="Recent scans"
                description="Each scan is read-only and never validates third-party keys."
                action={
                  <Link
                    to="/scans"
                    className="text-[12px] font-medium text-moss-ink underline-offset-4 hover:underline"
                  >
                    All scans
                  </Link>
                }
              />
            </div>
            {recentScans.length === 0 ? (
              <EmptyState
                icon={<ScanSearch className="h-5 w-5" />}
                title="No scans yet"
                description="Run the demo scan to see how findings look, or connect GitHub in Settings."
              />
            ) : (
              <div className="divide-y divide-line">
                {recentScans.map((scan) => (
                  <Link
                    key={scan.id}
                    to="/scans"
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60"
                  >
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        scan.status === "complete"
                          ? "bg-positive"
                          : scan.status === "failed"
                            ? "bg-rust"
                            : "bg-amber",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">
                        {scan.source === "demo" ? "Demo scan" : "GitHub scan"}
                        <span className="ml-2 font-normal text-muted">{scan.scope}</span>
                      </p>
                      <p className="text-[11.5px] text-faint">
                        {shortDate(scan.startedAt)} · {scan.filesScanned} files ·{" "}
                        {scan.findingCount} findings
                      </p>
                    </div>
                    <Badge
                      tone={
                        scan.status === "complete"
                          ? "positive"
                          : scan.status === "failed"
                            ? "rust"
                            : "amber"
                      }
                      className="shrink-0 capitalize"
                    >
                      {scan.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <SectionHeading title="Activity" description="The last eight events in this workspace." />
            {activity.length === 0 ? (
              <div className="py-8 text-center">
                <Activity className="mx-auto h-5 w-5 text-faint" />
                <p className="mt-2 text-[13px] font-medium text-ink">Quiet so far</p>
                <p className="text-[12px] text-muted">Save an API or make a request to begin.</p>
              </div>
            ) : (
              <ol className="space-y-3.5">
                {activity.map((item) => {
                  const Icon = activityIcon[item.kind];
                  return (
                    <li key={item.id} className="flex items-start gap-3">
                      <span className="relative mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-muted">
                        <Icon className="h-3.5 w-3.5" />
                        <span
                          className={cn(
                            "absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full ring-2 ring-[var(--surface)]",
                            toneDot[item.tone],
                          )}
                        />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium text-ink">{item.title}</p>
                        <p className="truncate text-[11.5px] text-muted">{item.detail}</p>
                      </div>
                      <span className="shrink-0 pt-0.5 text-[10.5px] text-faint">
                        {relativeTime(item.at)}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>

          <div className="rounded-2xl border border-line bg-moss-soft/70 p-4">
            <p className="eyebrow">A gentler practice</p>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
              Findings are detection and remediation only. Kinder will never send a discovered
              third-party key anywhere.
            </p>
            <Link
              to="/scans"
              className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-moss-ink underline-offset-4 hover:underline"
            >
              How scanning works
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      {suggestions.length > 0 ? (
        <div className="mt-5">
          <SectionHeading
            title="Worth a look"
            description="Popular providers you have not saved yet."
            action={
              <Link
                to="/explore"
                className="text-[12px] font-medium text-moss-ink underline-offset-4 hover:underline"
              >
                Browse catalog
              </Link>
            }
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {suggestions.map((provider) => (
              <Link
                key={provider.slug}
                to={`/explore/${provider.slug}`}
                className="card group flex items-start gap-3 p-4 transition-colors hover:border-line-strong"
              >
                <ProviderMark name={provider.name} />
                <div className="min-w-0">
                  <p className="flex items-center gap-1 text-[13px] font-medium text-ink">
                    {provider.name}
                    <ArrowUpRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-muted">
                    {provider.tagline}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
