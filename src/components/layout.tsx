import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Bookmark,
  Compass,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  ScanSearch,
  Settings,
  Terminal,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn, initials } from "@/lib/format";
import { Button } from "@/components/ui";

export function BrandMark({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0 rounded-[25%]", className)}
      aria-hidden
    >
      <rect width="64" height="64" rx="16" fill="#1d3a2c" />
      <path
        d="M20 42V22h6v9.6l10.2-9.6H44L32.4 32.1 44.6 42H37l-8.6-8.1-.4.4V42H20Z"
        fill="#f6f4ec"
      />
      <circle cx="47" cy="20" r="3.5" fill="#b9d4b0" />
    </svg>
  );
}

const PRIMARY_NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/explore", label: "Explore", icon: Compass },
  { to: "/my-apis", label: "My APIs", icon: Bookmark },
];

const OPS_NAV = [
  { to: "/playground", label: "Playground", icon: Terminal },
  { to: "/history", label: "History", icon: History },
  { to: "/scans", label: "Key scans", icon: ScanSearch },
];

function NavItem({
  to,
  label,
  icon: Icon,
  end,
  onNavigate,
}: {
  to: string;
  label: string;
  icon: typeof Compass;
  end?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition-colors",
          isActive
            ? "bg-[var(--nav-active)] text-ink"
            : "text-muted hover:bg-surface-2 hover:text-ink-soft",
        )
      }
      style={{ ["--nav-active" as string]: "var(--surface)" }}
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn("h-4 w-4 transition-colors", isActive ? "text-moss-ink" : "text-faint group-hover:text-muted")}
            strokeWidth={1.85}
          />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 pb-5 pt-5">
        <BrandMark />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold tracking-tight text-ink">Kinder</p>
          <p className="truncate text-[10px] uppercase tracking-[0.14em] text-faint">API workspace</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 scroll-thin">
        <div className="space-y-0.5">
          <p className="eyebrow mb-2 px-2.5">Workspace</p>
          {PRIMARY_NAV.map((item) => (
            <NavItem key={item.to} {...item} onNavigate={onNavigate} />
          ))}
        </div>
        <div className="space-y-0.5">
          <p className="eyebrow mb-2 px-2.5">Operations</p>
          {OPS_NAV.map((item) => (
            <NavItem key={item.to} {...item} onNavigate={onNavigate} />
          ))}
        </div>
        <div className="space-y-0.5">
          <p className="eyebrow mb-2 px-2.5">Account</p>
          <NavItem to="/settings" label="Settings" icon={Settings} onNavigate={onNavigate} />
        </div>
      </nav>

      <div className="p-3">
        <div className="rounded-xl border border-line bg-surface-2/60 p-2.5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line-strong bg-surface text-[11px] font-semibold text-moss-ink">
              {initials(user?.name ?? "?")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-medium text-ink">{user?.name ?? "Account"}</p>
              <p className="truncate text-[11px] text-muted">{user?.email ?? ""}</p>
            </div>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-faint transition-colors hover:bg-surface hover:text-rust"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const label =
    [...PRIMARY_NAV, ...OPS_NAV, { to: "/settings", label: "Settings" }].find((item) =>
      item.to === "/" ? pathname === "/" : pathname.startsWith(item.to),
    )?.label ?? "Kinder";
  return (
    <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-canvas/85 px-3.5 backdrop-blur sm:px-4 lg:hidden">
      <div className="flex items-center gap-2.5">
        <Button variant="ghost" size="icon" onClick={onMenu} aria-label="Open navigation">
          <Menu className="h-4.5 w-4.5" />
        </Button>
        <div className="flex items-center gap-2">
          <BrandMark size={24} />
          <span className="truncate text-[13px] font-medium text-ink">{label}</span>
        </div>
      </div>
      <NavLink
        to="/settings"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line-strong bg-surface text-[11px] font-semibold text-moss-ink transition-transform hover:scale-105"
        aria-label="Account settings"
        title={user?.name ?? "Account"}
      >
        {initials(user?.name ?? "?")}
      </NavLink>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const [prevPath, setPrevPath] = useState(location.pathname);

  if (prevPath !== location.pathname) {
    setPrevPath(location.pathname);
    setMobileOpen(false);
  }

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[236px] border-r border-line bg-[var(--sidebar)] lg:block">
        <Sidebar />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-[#101310]/45 backdrop-blur-[2px] animate-fade"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 w-[270px] max-w-[85vw] border-r border-line bg-[var(--sidebar)] shadow-float animate-fade">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-2 top-3 grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="lg:pl-[236px]">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-[1180px] px-3.5 pb-16 pt-5 sm:px-6 sm:pb-20 sm:pt-6 lg:px-10 lg:pt-9">
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3.5 sm:mb-7 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div className="space-y-1.5 min-w-0">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[26px] lg:text-[30px]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-xl text-[13px] leading-relaxed text-muted sm:text-[13.5px]">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
