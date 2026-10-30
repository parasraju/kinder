import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  Check,
  Compass,
  ExternalLink,
  KeyRound,
  Lock,
  Search,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import type { ApiCategory, Provider, SavedApi } from "@shared/types";
import { catalogApi, savedApi } from "@/lib/api";
import { PageHeader } from "@/components/layout";
import {
  Badge,
  Button,
  Card,
  CopyButton,
  EmptyState,
  Input,
  Skeleton,
  useToast,
} from "@/components/ui";
import { ProviderMark, SeverityBadge } from "@/components/bits";
import { cn, toCurl } from "@/lib/format";

const AUTH_LABEL: Record<string, string> = {
  bearer: "Bearer token",
  header: "Custom header",
  query: "Query parameter",
  basic: "Basic auth",
  path: "Token in path",
  aws: "AWS signature",
  none: "No auth",
};

function useSavedSlugs() {
  const saved = useQuery({ queryKey: ["saved-apis"], queryFn: savedApi.list });
  const slugs = new Set(
    (saved.data?.items ?? [])
      .map((item) => item.slug)
      .filter((slug): slug is string => Boolean(slug)),
  );
  return { saved, slugs };
}

export function ExplorePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: catalogApi.list });
  const { slugs, saved } = useSavedSlugs();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<ApiCategory | "all">("all");

  const toggleSave = useMutation({
    mutationFn: async (provider: Provider) => {
      const existing = (saved.data?.items ?? []).find((item) => item.slug === provider.slug);
      if (existing) {
        await savedApi.remove(existing.id);
        return { saved: false, name: provider.name };
      }
      await savedApi.addCatalog(provider.slug);
      return { saved: true, name: provider.name };
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["saved-apis"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
      toast(result.saved ? `${result.name} saved` : `${result.name} removed`);
    },
    onError: (error) => toast(error instanceof Error ? error.message : "Could not update", "error"),
  });

  const providers = useMemo(() => catalog.data?.providers ?? [], [catalog.data]);
  const categories = catalog.data?.categories ?? [];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return providers.filter((provider) => {
      if (category !== "all" && provider.category !== category) return false;
      if (!needle) return true;
      return (
        provider.name.toLowerCase().includes(needle) ||
        provider.tagline.toLowerCase().includes(needle) ||
        provider.tags.some((tag) => tag.toLowerCase().includes(needle))
      );
    });
  }, [providers, q, category]);

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Catalog"
        title="Explore APIs"
        description="A curated registry of APIs worth building on, with the auth details that usually cost an afternoon."
        actions={
          <Badge tone="outline" className="h-7 px-3 text-[12px]">
            {providers.length} providers
          </Badge>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search by name, tag, or use case…"
            className="h-10 pl-9"
            aria-label="Search APIs"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1 scroll-thin sm:pb-0">
          <button
            type="button"
            onClick={() => setCategory("all")}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
              category === "all"
                ? "border-moss bg-moss text-[var(--on-moss)]"
                : "border-line-strong bg-surface text-muted hover:text-ink",
            )}
          >
            All
          </button>
          {categories.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setCategory(item.key)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                category === item.key
                  ? "border-moss bg-moss text-[var(--on-moss)]"
                  : "border-line-strong bg-surface text-muted hover:text-ink",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {catalog.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, index) => (
            <Skeleton key={index} className="h-40" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Compass className="h-5 w-5" />}
            title="No APIs match that"
            description="Try a different search term or clear the category filter."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setQ("");
                  setCategory("all");
                }}
              >
                Clear filters
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((provider) => {
            const isSaved = slugs.has(provider.slug);
            return (
              <div
                key={provider.slug}
                className="card group flex flex-col p-4 transition-colors hover:border-line-strong"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/explore/${provider.slug}`)}
                    className="flex min-w-0 items-start gap-3 text-left"
                  >
                    <ProviderMark name={provider.name} size={38} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1 text-[14px] font-semibold tracking-[-0.01em] text-ink">
                        {provider.name}
                        <ArrowUpRight className="h-3 w-3 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-[12px] leading-relaxed text-muted">
                        {provider.tagline}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSave.mutate(provider)}
                    disabled={toggleSave.isPending}
                    className={cn(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-colors",
                      isSaved
                        ? "border-moss/25 bg-moss-soft text-moss-ink"
                        : "border-line bg-surface text-faint hover:text-ink",
                    )}
                    aria-label={isSaved ? `Remove ${provider.name}` : `Save ${provider.name}`}
                  >
                    {isSaved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                  </button>
                </div>

                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
                  <Badge tone="outline">{provider.category}</Badge>
                  <Badge tone="neutral">{AUTH_LABEL[provider.authScheme] ?? provider.authScheme}</Badge>
                  {provider.playgroundSupported === false ? (
                    <Badge tone="amber">Manual setup</Badge>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-center text-[11.5px] text-faint">
        Missing a provider? Save it as a custom HTTPS endpoint from My APIs.
      </p>
    </div>
  );
}

function authDetail(provider: Provider): string {
  switch (provider.authScheme) {
    case "bearer":
      return `Send Authorization: Bearer <key> with every request.`;
    case "header":
      return `Send ${provider.authHeaderName ?? "Authorization"}: ${provider.authPrefix ?? ""}<key>.`;
    case "query":
      return `Append ?${provider.authQueryName ?? "api_key"}=<key> to the request URL.`;
    case "basic":
      return `Use HTTP Basic auth with the username "${provider.basicUsername ?? "user"}" and your key as the password.`;
    case "path":
      return `Place the key in the URL path, replacing {token} in the sample request.`;
    case "aws":
      return `Requests are signed with AWS Signature v4; a single key alone is not enough.`;
    default:
      return "This endpoint does not require authentication.";
  }
}

export function ApiDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["catalog", slug],
    queryFn: () => catalogApi.detail(String(slug)),
    enabled: Boolean(slug),
  });
  const { saved } = useSavedSlugs();

  const save = useMutation({
    mutationFn: async (provider: Provider) => {
      const existing = (saved.data?.items ?? []).find((item) => item.slug === provider.slug);
      if (existing) {
        await savedApi.remove(existing.id);
        return false;
      }
      await savedApi.addCatalog(provider.slug);
      return true;
    },
    onSuccess: (isSaved) => {
      void queryClient.invalidateQueries({ queryKey: ["saved-apis"] });
      void queryClient.invalidateQueries({ queryKey: ["catalog", slug] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
      toast(isSaved ? "Saved to your workspace" : "Removed from your workspace");
    },
    onError: (error) => toast(error instanceof Error ? error.message : "Could not update", "error"),
  });

  if (detail.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <Card>
        <EmptyState
          icon={<Compass className="h-5 w-5" />}
          title="API not found"
          description="That provider is not in the catalog. It may have been renamed or removed."
          action={<Button onClick={() => navigate("/explore")}>Back to Explore</Button>}
        />
      </Card>
    );
  }

  const { provider } = detail.data;
  const savedList: SavedApi[] = saved.data?.items ?? [];
  const isSaved = savedList.some((item) => item.slug === provider.slug);
  const sampleUrl = `${provider.baseUrl.replace(/\/+$/, "")}${provider.samplePath}`;
  const curl = toCurl({
    method: provider.sampleMethod,
    url: sampleUrl,
    headers:
      provider.authScheme === "bearer"
        ? { Authorization: "Bearer <your-key>", Accept: "application/json" }
        : provider.authScheme === "header"
          ? { [provider.authHeaderName ?? "Authorization"]: `${provider.authPrefix ?? ""}<your-key>` }
          : { Accept: "application/json" },
    body: provider.sampleMethod === "GET" ? null : '{\n  "example": true\n}',
  });

  return (
    <div className="animate-rise">
      <button
        type="button"
        onClick={() => navigate("/explore")}
        className="mb-5 inline-flex items-center gap-1.5 text-[12px] font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All APIs
      </button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
        <div className="flex items-start gap-3.5 sm:gap-4 min-w-0">
          <ProviderMark name={provider.name} size={44} className="sm:h-[52px] sm:w-[52px]" />
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink sm:text-[26px]">{provider.name}</h1>
              <SeverityBadge severity={provider.severity} />
            </div>
            <p className="max-w-xl text-[13px] leading-relaxed text-muted sm:text-[13.5px]">{provider.tagline}</p>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <Badge tone="outline">{provider.category}</Badge>
              <Badge tone="neutral">{AUTH_LABEL[provider.authScheme] ?? provider.authScheme}</Badge>
              {provider.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} tone="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto sm:shrink-0">
          <Button variant="secondary" className="flex-1 sm:flex-initial" onClick={() => save.mutate(provider)} loading={save.isPending}>
            {isSaved ? <Check className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
            {isSaved ? "Saved" : "Save"}
          </Button>
          <Button variant="primary" className="flex-1 sm:flex-initial" onClick={() => navigate(`/playground?api=${provider.slug}`)}>
            <Terminal className="h-4 w-4" />
            Open playground
          </Button>
        </div>
      </div>

      <div className="mt-7 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Card className="p-5">
            <p className="eyebrow">Overview</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">{provider.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={provider.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:border-ink/30"
              >
                Documentation
                <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href={provider.consoleUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:border-ink/30"
              >
                Get a key
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div>
                <p className="text-[13px] font-medium text-ink">Sample request</p>
                <p className="text-[11.5px] text-muted">
                  {provider.sampleMethod} {provider.samplePath}
                </p>
              </div>
              <CopyButton value={curl} label="Copy cURL" />
            </div>
            <pre className="mono overflow-x-auto bg-surface-2/50 px-4 py-4 text-[11.5px] leading-relaxed text-ink-soft scroll-thin">
              {curl}
            </pre>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <p className="eyebrow">Connection</p>
            <dl className="mt-3 space-y-3 text-[12.5px]">
              <div>
                <dt className="text-muted">Base URL</dt>
                <dd className="mono mt-1 flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-2/60 px-2.5 py-1.5 text-[11.5px] text-ink-soft">
                  <span className="truncate">{provider.baseUrl}</span>
                  <CopyButton value={provider.baseUrl} label="" />
                </dd>
              </div>
              <div>
                <dt className="text-muted">Authentication</dt>
                <dd className="mt-1 leading-relaxed text-ink-soft">{authDetail(provider)}</dd>
              </div>
              <div>
                <dt className="text-muted">Key format</dt>
                <dd className="mt-1 flex items-start gap-2 leading-relaxed text-ink-soft">
                  <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />
                  {provider.keyHint}
                </dd>
              </div>
            </dl>
          </Card>

          <div className="rounded-2xl border border-line bg-surface-2/60 p-4">
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-moss-ink" />
              <p className="text-[12.5px] font-medium text-ink">Kept on this machine</p>
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
              Credentials are sealed with AES-256-GCM before they touch the database. The
              playground masks them in history.
            </p>
          </div>

          {provider.playgroundSupported === false ? (
            <div className="rounded-2xl border border-amber/25 bg-amber-soft p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-amber" />
                <p className="text-[12.5px] font-medium text-amber">Playground limitation</p>
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-amber/90">
                {provider.playgroundNote}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
