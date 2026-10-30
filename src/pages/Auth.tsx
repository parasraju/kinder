import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, KeyRound, Sparkles, TerminalSquare } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { BrandMark } from "@/components/layout";
import { Button, Field, Input } from "@/components/ui";

function AuthAside() {
  return (
    <div className="relative hidden flex-col justify-between overflow-hidden bg-moss p-10 text-[#eef3ea] lg:flex">
      <div className="pointer-events-none absolute inset-0 opacity-[0.14] dotgrid" />
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#c7dcc4]/10 blur-2xl" />
      <div className="relative flex items-center gap-2.5">
        <BrandMark size={34} className="ring-1 ring-white/15" />
        <div>
          <p className="text-sm font-semibold tracking-tight">Kinder</p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#c8d6c5]">API workspace</p>
        </div>
      </div>

      <div className="relative max-w-md space-y-6 pb-8">
        <h1 className="text-[34px] font-semibold leading-[1.12] tracking-[-0.025em]">
          Know your keys.
          <br />
          Keep them kind.
        </h1>
        <p className="text-[13.5px] leading-relaxed text-[#cfdccb]">
          One quiet workspace for the APIs you depend on: a curated catalog, an encrypted
          credential vault, and a request console that never leaks a secret.
        </p>
        <ul className="space-y-3.5 pt-2 text-[13px] text-[#dbe6d8]">
          <li className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#b9d3bb]" />
            <span>40 hand-picked providers with auth details that actually matter.</span>
          </li>
          <li className="flex items-start gap-3">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[#b9d3bb]" />
            <span>Secrets sealed with AES-256-GCM. Never displayed again after saving.</span>
          </li>
          <li className="flex items-start gap-3">
            <TerminalSquare className="mt-0.5 h-4 w-4 shrink-0 text-[#b9d3bb]" />
            <span>Request history with redacted headers and honest response bodies.</span>
          </li>
        </ul>
      </div>

      <p className="relative text-[11px] leading-relaxed text-[#a9bda7]">
        Detection and remediation only. Kinder never validates third-party keys found in
        public repositories.
      </p>
    </div>
  );
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[1.05fr_1fr]">
      <AuthAside />
      <div className="flex items-center justify-center px-4 py-8 sm:px-10 sm:py-10">
        <div className="w-full max-w-[380px] animate-rise">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <BrandMark size={30} />
            <span className="text-sm font-semibold tracking-tight">Kinder</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function useGuestRedirect() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);
}

export function LoginPage() {
  const { login } = useAuth();
  useGuestRedirect();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await login(email.trim(), password);
      navigate("/", { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFields(caught.fields ?? {});
      } else {
        setError("Could not sign in. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function demo() {
    setEmail("demo@kinderapply.dev");
    setPassword("kinderdemo123");
    setBusy(true);
    setError(null);
    try {
      await login("demo@kinderapply.dev", "kinderdemo123");
      navigate("/", { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not open the demo workspace.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <div className="space-y-2">
        <p className="eyebrow">Welcome back</p>
        <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-ink">Sign in</h2>
        <p className="text-[13px] text-muted">
          Continue to your catalog, vault, and request console.
        </p>
      </div>

      <form onSubmit={submit} className="mt-7 space-y-4">
        <Field label="Email" htmlFor="email" error={fields.email}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@studio.dev"
          />
        </Field>
        <Field label="Password" htmlFor="password" error={fields.password}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••••"
          />
        </Field>
        {error ? (
          <p className="rounded-lg border border-rust/25 bg-rust-soft px-3 py-2 text-[12.5px] text-rust">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
          Sign in
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <div className="mt-3">
        <Button type="button" variant="ghost" className="w-full" onClick={() => void demo()} disabled={busy}>
          Open the demo workspace
        </Button>
      </div>

      <p className="mt-6 text-center text-[12.5px] text-muted">
        New here?{" "}
        <Link to="/register" className="font-medium text-moss-ink underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
      <p className="mt-8 rounded-lg border border-line bg-surface/60 px-3 py-2 text-center text-[11.5px] leading-relaxed text-faint">
        Demo: demo@kinderapply.dev · kinderdemo123
      </p>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  useGuestRedirect();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await register(name.trim(), email.trim(), password);
      navigate("/", { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFields(caught.fields ?? {});
      } else {
        setError("Could not create the account. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <div className="space-y-2">
        <p className="eyebrow">Create account</p>
        <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-ink">Start a workspace</h2>
        <p className="text-[13px] text-muted">
          Your keys are encrypted on this machine. Nothing is sent to a third party.
        </p>
      </div>

      <form onSubmit={submit} className="mt-7 space-y-4">
        <Field label="Name" htmlFor="name" error={fields.name}>
          <Input
            id="name"
            autoComplete="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ada Lovelace"
          />
        </Field>
        <Field label="Email" htmlFor="email" error={fields.email}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@studio.dev"
          />
        </Field>
        <Field
          label="Password"
          htmlFor="password"
          hint="At least 10 characters."
          error={fields.password}
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••••"
          />
        </Field>
        {error ? (
          <p className="rounded-lg border border-rust/25 bg-rust-soft px-3 py-2 text-[12.5px] text-rust">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
          Create account
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <p className="mt-6 text-center text-[12.5px] text-muted">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-moss-ink underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
