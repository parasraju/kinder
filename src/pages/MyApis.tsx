import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Bookmark,
  BookmarkPlus,
  Globe,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Star,
  Terminal,
  Trash2,
} from "lucide-react";
import type { ApiCategory, SavedApi } from "@shared/types";
import { catalogApi, savedApi } from "@/lib/api";
import { PageHeader } from "@/components/layout";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  Tabs,
  Textarea,
  useToast,
} from "@/components/ui";
import { ProviderMark } from "@/components/bits";
import { cn, relativeTime } from "@/lib/format";

type Filter = "all" | "favorites" | "catalog" | "custom";

const CATEGORY_OPTIONS: { value: ApiCategory | "custom"; label: string }[] = [
  { value: "custom", label: "Custom" },
  { value: "ai", label: "AI" },
  { value: "payments", label: "Payments" },
  { value: "communication", label: "Communication" },
  { value: "data", label: "Data" },
  { value: "devtools", label: "Developer tools" },
  { value: "auth", label: "Auth" },
  { value: "maps", label: "Maps" },
  { value: "media", label: "Media" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "productivity", label: "Productivity" },
  { value: "search", label: "Search" },
];

function AddCustomModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://");
  const [category, setCategory] = useState<string>("custom");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      savedApi.addCustom({
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        category: category === "custom" ? undefined : category,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      toast("Custom API saved");
      setName("");
      setBaseUrl("https://");
      setNotes("");
      setError(null);
      onCreated();
      onClose();
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : "Could not save this API"),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a custom API"
      description="Track any HTTPS endpoint. It stays private to this workspace."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={!name.trim() || !baseUrl.startsWith("https://")}
            onClick={() => create.mutate()}
          >
            Save API
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" htmlFor="custom-name">
          <Input
            id="custom-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Internal billing service"
          />
        </Field>
        <Field label="Base URL" htmlFor="custom-url" hint="Must be an https:// origin.">
          <Input
            id="custom-url"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://api.example.com"
            className="mono text-[13px]"
          />
        </Field>
        <Field label="Category" htmlFor="custom-category">
          <Select id="custom-category" value={category} onChange={(event) => setCategory(event.target.value)}>
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes" htmlFor="custom-notes" hint="Optional. Never put a secret here.">
          <Textarea
            id="custom-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Who owns it, what it does, where the key lives…"
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

function NotesModal({
  api,
  onClose,
  onSaved,
}: {
  api: SavedApi | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [notes, setNotes] = useState(api?.notes ?? "");

  const save = useMutation({
    mutationFn: () => savedApi.update(api!.id, { notes: notes.trim() || null }),
    onSuccess: () => {
      toast("Notes updated");
      onSaved();
      onClose();
    },
    onError: () => toast("Could not update notes", "error"),
  });

  return (
    <Modal
      open={Boolean(api)}
      onClose={onClose}
      title={`Notes for ${api?.name ?? ""}`}
      description="Local to this workspace. Never store a secret here."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            Save notes
          </Button>
        </>
      }
    >
      <Textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Rotation owner, environment, caveats…"
        className="min-h-32"
      />
    </Modal>
  );
}

export function MyApisPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const saved = useQuery({ queryKey: ["saved-apis"], queryFn: savedApi.list });
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: catalogApi.list });
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [notesFor, setNotesFor] = useState<SavedApi | null>(null);
  const [menuFor, setMenuFor] = useState<number | null>(null);

  const items = useMemo(() => saved.data?.items ?? [], [saved.data]);
  const catalogMap = new Map((catalog.data?.providers ?? []).map((provider) => [provider.slug, provider]));

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === "favorites" && !item.favorite) return false;
      if (filter === "catalog" && item.custom) return false;
      if (filter === "custom" && !item.custom) return false;
      if (!needle) return true;
      return (
        item.name.toLowerCase().includes(needle) ||
        item.baseUrl.toLowerCase().includes(needle) ||
        (item.notes ?? "").toLowerCase().includes(needle)
      );
    });
  }, [items, filter, q]);

  const favorite = useMutation({
    mutationFn: (item: SavedApi) => savedApi.update(item.id, { favorite: !item.favorite }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["saved-apis"] }),
    onError: () => toast("Could not update this API", "error"),
  });

  const remove = useMutation({
    mutationFn: (item: SavedApi) => savedApi.remove(item.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["saved-apis"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
      setMenuFor(null);
      toast("Removed from your workspace");
    },
    onError: () => toast("Could not remove this API", "error"),
  });

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Workspace"
        title="My APIs"
        description="Everything you have saved, with notes and a shortcut into the playground."
        actions={
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add custom API
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: "all", label: "All", count: items.length },
            { value: "favorites", label: "Favorites", count: items.filter((item) => item.favorite).length },
            { value: "catalog", label: "Catalog" },
            { value: "custom", label: "Custom" },
          ]}
        />
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Filter saved APIs…"
            className="h-9 w-full pl-9"
            aria-label="Filter saved APIs"
          />
        </div>
      </div>

      {saved.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Bookmark className="h-5 w-5" />}
            title={items.length === 0 ? "Nothing saved yet" : "No matches"}
            description={
              items.length === 0
                ? "Save a provider from Explore, or add a custom HTTPS endpoint of your own."
                : "Try a different filter or search term."
            }
            action={
              items.length === 0 ? (
                <Button variant="primary" onClick={() => navigate("/explore")}>
                  Browse the catalog
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFilter("all");
                    setQ("");
                  }}
                >
                  Clear filters
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((item) => {
            const provider = item.slug ? catalogMap.get(item.slug) : undefined;
            return (
              <Card key={item.id} className="relative flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <ProviderMark name={item.name} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {item.slug ? (
                        <Link
                          to={`/explore/${item.slug}`}
                          className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-ink hover:underline underline-offset-4"
                        >
                          {item.name}
                          <ArrowUpRight className="h-3 w-3 text-faint" />
                        </Link>
                      ) : (
                        <span className="text-[13.5px] font-semibold text-ink">{item.name}</span>
                      )}
                      {item.custom ? <Badge tone="outline">custom</Badge> : null}
                      <Badge tone="neutral">{item.category}</Badge>
                    </div>
                    <p className="mono mt-0.5 truncate text-[11.5px] text-muted">{item.baseUrl}</p>
                    <p className="mt-1 line-clamp-1 text-[11.5px] text-faint">
                      {item.notes ? item.notes : `Saved ${relativeTime(item.createdAt)}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-1 border-t border-line/60 pt-2 sm:border-t-0 sm:pt-0 sm:justify-end">
                  {provider ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 sm:flex-initial"
                      onClick={() => navigate(`/playground?api=${provider.slug}`)}
                    >
                      <Terminal className="h-3.5 w-3.5" />
                      Request
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 sm:flex-initial"
                      onClick={() => navigate(`/playground?saved=${item.id}`)}
                    >
                      <Globe className="h-3.5 w-3.5" />
                      Request
                    </Button>
                  )}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => favorite.mutate(item)}
                      className={cn(
                        "grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-surface-2",
                        item.favorite ? "text-amber" : "text-faint hover:text-muted",
                      )}
                      aria-label={item.favorite ? "Remove favorite" : "Add favorite"}
                    >
                      <Star className={cn("h-4 w-4", item.favorite && "fill-current")} />
                    </button>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setMenuFor(menuFor === item.id ? null : item.id)}
                        className="grid h-8 w-8 place-items-center rounded-lg text-faint transition-colors hover:bg-surface-2 hover:text-ink"
                        aria-label="More actions"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {menuFor === item.id ? (
                        <div className="absolute right-0 top-9 z-20 w-40 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-float animate-fade">
                          <button
                            type="button"
                            onClick={() => {
                              setNotesFor(item);
                              setMenuFor(null);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-ink-soft hover:bg-surface-2"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit notes
                          </button>
                          <button
                            type="button"
                            onClick={() => remove.mutate(item)}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-rust hover:bg-rust-soft"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-5 rounded-xl border border-dashed border-line-strong bg-surface/50 px-4 py-3">
        <p className="flex items-center gap-2 text-[12px] text-muted">
          <BookmarkPlus className="h-3.5 w-3.5" />
          Looking for something else? The catalog has 40 providers with auth notes and sample requests.
          <Link to="/explore" className="font-medium text-moss-ink underline-offset-4 hover:underline">
            Explore
          </Link>
        </p>
      </div>

      <AddCustomModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => void queryClient.invalidateQueries({ queryKey: ["saved-apis"] })}
      />
      <NotesModal
        key={notesFor?.id ?? "none"}
        api={notesFor}
        onClose={() => setNotesFor(null)}
        onSaved={() => void queryClient.invalidateQueries({ queryKey: ["saved-apis"] })}
      />
    </div>
  );
}
