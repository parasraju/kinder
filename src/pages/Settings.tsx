import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Github,
  LogOut,
  Moon,
  Palette,
  ShieldCheck,
  Sun,
  Trash2,
  UserRound,
} from "lucide-react";
import type { ApiCategory, UserPreferences } from "@shared/types";
import { authApi, integrationsApi, settingsApi } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/layout";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  Toggle,
  useToast,
} from "@/components/ui";
import { SectionHeading } from "@/components/bits";
import { absoluteDate, cn } from "@/lib/format";

const CATEGORIES: (ApiCategory | "all")[] = [
  "all",
  "ai",
  "payments",
  "communication",
  "data",
  "devtools",
  "auth",
  "maps",
  "media",
  "infrastructure",
  "productivity",
  "search",
];

function ProfileSection() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: () => authApi.updateProfile(name.trim(), email.trim()),
    onSuccess: async () => {
      await refresh();
      toast("Profile updated");
      setError(null);
      setFields({});
    },
    onError: (caught) => {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFields(caught.fields ?? {});
      } else setError("Could not update the profile");
    },
  });

  return (
    <Card className="p-5">
      <SectionHeading title="Profile" description="How this workspace addresses you." />
      <div className="mt-1 space-y-4">
        <Field label="Name" htmlFor="profile-name" error={fields.name}>
          <Input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Email" htmlFor="profile-email" error={fields.email}>
          <Input
            id="profile-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        {error ? (
          <p className="rounded-lg border border-rust/25 bg-rust-soft px-3 py-2 text-[12.5px] text-rust">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11.5px] text-faint">Joined {absoluteDate(user?.createdAt ?? null)}</p>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={!name.trim() || !email.trim() || (name === user?.name && email === user?.email)}
            onClick={() => save.mutate()}
          >
            Save profile
          </Button>
        </div>
      </div>
    </Card>
  );
}

function PasswordSection() {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => authApi.changePassword(current, next),
    onSuccess: () => {
      toast("Password changed");
      setCurrent("");
      setNext("");
      setConfirm("");
      setError(null);
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : "Could not change the password"),
  });

  const mismatch = confirm.length > 0 && confirm !== next;

  return (
    <Card className="p-5">
      <SectionHeading title="Password" description="Rotate it whenever a machine changes hands." />
      <div className="mt-1 space-y-4">
        <Field label="Current password" htmlFor="current-password">
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
        </Field>
        <Field label="New password" htmlFor="new-password" hint="At least 10 characters.">
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
        </Field>
        <Field
          label="Confirm new password"
          htmlFor="confirm-password"
          error={mismatch ? "Passwords do not match." : undefined}
        >
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </Field>
        {error ? (
          <p className="rounded-lg border border-rust/25 bg-rust-soft px-3 py-2 text-[12.5px] text-rust">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button
            variant="secondary"
            loading={save.isPending}
            disabled={!current || next.length < 10 || mismatch || !confirm}
            onClick={() => save.mutate()}
          >
            Change password
          </Button>
        </div>
      </div>
    </Card>
  );
}

function AppearanceSection() {
  const { user, updatePreferences } = useAuth();
  const toast = useToast();
  const prefs = user?.preferences;

  const save = useMutation({
    mutationFn: (next: Partial<UserPreferences>) => updatePreferences(next),
    onError: () => toast("Could not save appearance", "error"),
  });

  if (!prefs) return null;

  const themeOptions: { value: UserPreferences["theme"]; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Palette },
  ];

  return (
    <Card className="p-5">
      <SectionHeading title="Appearance" description="Cosmetic only. Nothing leaves this machine." />
      <div className="mt-2 space-y-5">
        <div>
          <p className="text-[13px] font-medium text-ink-soft">Theme</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {themeOptions.map((option) => {
              const Icon = option.icon;
              const active = prefs.theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => save.mutate({ theme: option.value })}
                  className={cn(
                    "flex flex-col items-center gap-1.5 sm:gap-2 rounded-xl border px-2 py-2.5 sm:px-3 sm:py-3 text-[11px] sm:text-[12px] font-medium transition-colors",
                    active
                      ? "border-moss/40 bg-moss-soft text-moss-ink"
                      : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {option.label}
                  {active ? <Check className="h-3 w-3" /> : null}
                </button>
              );
            })}
          </div>
        </div>

        <Field label="Default catalog category" htmlFor="default-category">
          <Select
            id="default-category"
            value={prefs.defaultCategory}
            onChange={(event) => save.mutate({ defaultCategory: event.target.value as ApiCategory | "all" })}
          >
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category === "all" ? "All categories" : category}
              </option>
            ))}
          </Select>
        </Field>

        <Toggle
          checked={prefs.density === "compact"}
          onChange={(next) => save.mutate({ density: next ? "compact" : "comfortable" })}
          label="Compact density"
          description="Tighter spacing for dense tables and long sessions."
        />
        <Toggle
          checked={prefs.reduceMotion}
          onChange={(next) => save.mutate({ reduceMotion: next })}
          label="Reduce motion"
          description="Disable entrance animations and transitions."
        />
      </div>
    </Card>
  );
}

function GithubSection() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const github = useQuery({ queryKey: ["github"], queryFn: integrationsApi.github });
  const [token, setToken] = useState("");
  const [verified, setVerified] = useState<{ login: string; name: string | null; scopes: string | null; note: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const verify = useMutation({
    mutationFn: () => integrationsApi.verifyGithub(token.trim()),
    onSuccess: (result) => {
      setVerified(result);
      setError(null);
    },
    onError: (caught) => {
      setVerified(null);
      setError(caught instanceof Error ? caught.message : "Could not verify this token");
    },
  });

  const connect = useMutation({
    mutationFn: () => integrationsApi.connectGithub(token.trim()),
    onSuccess: () => {
      toast("GitHub connected");
      setToken("");
      setVerified(null);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["github"] });
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : "Could not connect GitHub"),
  });

  const disconnect = useMutation({
    mutationFn: integrationsApi.disconnectGithub,
    onSuccess: () => {
      toast("GitHub disconnected");
      void queryClient.invalidateQueries({ queryKey: ["github"] });
    },
    onError: () => toast("Could not disconnect GitHub", "error"),
  });

  const connection = github.data;

  return (
    <Card className="p-5">
      <SectionHeading
        title="GitHub integration"
        description="Read-only repository access for key scans. The token is encrypted at rest."
        action={
          connection?.connected ? (
            <Badge tone="positive">Connected</Badge>
          ) : (
            <Badge tone="outline">Not connected</Badge>
          )
        }
      />

      {github.isLoading ? (
        <Skeleton className="mt-3 h-20" />
      ) : connection?.connected ? (
        <div className="mt-3 space-y-3">
          <div className="rounded-xl border border-line bg-surface-2/50 px-3.5 py-3">
            <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
              <Github className="h-4 w-4" />
              {connection.login}
            </p>
            <p className="mt-1 text-[11.5px] text-muted">
              Connected {absoluteDate(connection.connectedAt)} · scopes: {connection.scopes ?? "unknown"}
            </p>
          </div>
          <div className="flex justify-end">
            <Button
              variant="secondary"
              className="text-rust hover:bg-rust-soft"
              loading={disconnect.isPending}
              onClick={() => disconnect.mutate()}
            >
              Disconnect GitHub
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <Field
            label="Personal access token"
            htmlFor="github-token"
            hint="Fine-grained token with read-only Contents access to the repositories you choose."
          >
            <Input
              id="github-token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(event) => {
                setToken(event.target.value);
                setVerified(null);
              }}
              placeholder="github_pat_…"
              className="mono text-[12px]"
            />
          </Field>
          {verified ? (
            <div className="rounded-xl border border-positive/25 bg-positive-soft px-3.5 py-2.5">
              <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-positive">
                <Check className="h-3.5 w-3.5" />
                Verified as {verified.login}
              </p>
              <p className="mt-1 text-[11.5px] text-positive/90">
                Scopes: {verified.scopes ?? "none reported"}
                {verified.note ? ` · ${verified.note}` : ""}
              </p>
            </div>
          ) : null}
          {error ? (
            <p className="rounded-lg border border-rust/25 bg-rust-soft px-3 py-2 text-[12.5px] text-rust">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              loading={verify.isPending}
              disabled={!token.trim()}
              onClick={() => verify.mutate()}
            >
              Verify token
            </Button>
            <Button
              variant="primary"
              loading={connect.isPending}
              disabled={!verified}
              onClick={() => connect.mutate()}
            >
              Connect GitHub
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function WorkspaceSection() {
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { logout } = useAuth();
  const summary = useQuery({ queryKey: ["settings-summary"], queryFn: settingsApi.summary });
  const [confirmOpen, setConfirmOpen] = useState(false);

  const reset = useMutation({
    mutationFn: settingsApi.resetWorkspace,
    onSuccess: async () => {
      toast("Workspace cleared");
      setConfirmOpen(false);
      await queryClient.invalidateQueries();
    },
    onError: () => toast("Could not clear the workspace", "error"),
  });

  async function signOut() {
    await logout();
    navigate("/login", { replace: true });
  }

  const stats = summary.data;

  return (
    <>
      <Card className="p-5">
        <SectionHeading title="Workspace data" description="What stays on this machine." />
        {summary.isLoading ? (
          <Skeleton className="mt-2 h-16" />
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { label: "Scans", value: stats?.scans ?? 0 },
              { label: "Findings", value: stats?.findings ?? 0 },
              { label: "Requests", value: stats?.requests ?? 0 },
              { label: "Credentials", value: stats?.credentials ?? 0 },
              { label: "Saved APIs", value: stats?.savedApis ?? 0 },
            ].map((item, idx) => (
              <div
                key={item.label}
                className={cn(
                  "rounded-lg border border-line bg-surface-2/40 px-2.5 py-2",
                  idx === 4 ? "col-span-2 sm:col-span-1" : ""
                )}
              >
                <p className="text-[18px] font-semibold leading-tight text-ink">{item.value}</p>
                <p className="text-[11px] text-muted">{item.label}</p>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5 text-[11.5px] text-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-positive" />
            AES-256-GCM, scrypt passwords, httpOnly session cookie.
          </p>
          <Button variant="ghost" onClick={() => void signOut()}>
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </Button>
        </div>
      </Card>

      <Card className="border-rust/20 p-5">
        <SectionHeading
          title="Danger zone"
          description="Irreversible. Keep it for a clean demo or a full reset."
        />
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-md text-[12px] leading-relaxed text-muted">
            Delete every scan, finding, request, credential, and saved API in this workspace. Your
            account and preferences remain.
          </p>
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="h-4 w-4" />
            Clear workspace
          </Button>
        </div>
      </Card>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Clear this workspace?"
        description="This deletes scans, findings, request history, credentials, and saved APIs."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={reset.isPending} onClick={() => reset.mutate()}>
              Delete everything
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3 rounded-xl border border-rust/20 bg-rust-soft/60 px-3 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rust" />
          <p className="text-[12.5px] leading-relaxed text-ink-soft">
            There is no undo and no export. Your account, password, and appearance preferences are
            kept.
          </p>
        </div>
      </Modal>
    </>
  );
}

export function SettingsPage() {
  const { user } = useAuth();
  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Profile, appearance, integrations, and the data this workspace keeps."
        actions={
          user ? (
            <Badge tone="outline" className="h-7 px-3 text-[12px]">
              <UserRound className="h-3 w-3" />
              {user.email}
            </Badge>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <ProfileSection />
          <PasswordSection />
          <WorkspaceSection />
        </div>
        <div className="space-y-4">
          <AppearanceSection />
          <GithubSection />
        </div>
      </div>
    </div>
  );
}
