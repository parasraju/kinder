import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Loader2, X } from "lucide-react";
import { cn } from "@/lib/format";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-moss text-[var(--on-moss)] hover:bg-moss-hover border border-transparent shadow-soft",
  secondary:
    "bg-surface text-ink border border-line-strong hover:border-ink/40 hover:bg-surface-2",
  ghost: "bg-transparent text-ink-soft border border-transparent hover:bg-surface-2",
  danger: "bg-rust text-white border border-transparent hover:brightness-95",
  link: "bg-transparent text-moss-ink border border-transparent hover:underline underline-offset-4 p-0 h-auto",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-[10px]",
  lg: "h-11 px-5 text-sm gap-2 rounded-xl",
  icon: "h-9 w-9 rounded-lg justify-center",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin-slow" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  action,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-soft">
          {label}
        </label>
        {action}
      </div>
      {children}
      {error ? (
        <p className="text-xs text-rust">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("field", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("field min-h-24 resize-y leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn("field cursor-pointer appearance-none pr-8", className)} {...props}>
      {children}
    </select>
  );
}

type BadgeTone = "neutral" | "moss" | "amber" | "rust" | "positive" | "outline";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-ink-soft border-line-strong",
  moss: "bg-moss-soft text-moss-ink border-moss/20",
  amber: "bg-amber-soft text-amber border-amber/25",
  rust: "bg-rust-soft text-rust border-rust/25",
  positive: "bg-positive-soft text-positive border-positive/25",
  outline: "bg-transparent text-muted border-line-strong",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("card", className)}>{children}</div>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin-slow text-muted", className)} aria-hidden />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-surface-2", className)} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon ? (
        <div className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface-2 text-muted">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-[#101310]/45 backdrop-blur-[2px] animate-fade"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative z-10 flex w-full max-h-[90vh] sm:max-h-[85vh] flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-float animate-rise sm:rounded-2xl",
          width,
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="space-y-1 min-w-0">
            <h2 className="text-[15px] font-semibold text-ink truncate">{title}</h2>
            {description ? <p className="text-[13px] text-muted break-words">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 scroll-thin">{children}</div>
        {footer ? (
          <div className="flex flex-wrap shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-2/50 px-4 py-3 sm:px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <label htmlFor={id} className="text-[13px] font-medium text-ink">
          {label}
        </label>
        {description ? <p className="text-xs text-muted">{description}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors",
          checked ? "border-moss bg-moss" : "border-line-strong bg-surface-3",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-surface shadow-sm transition-all",
            checked ? "left-[18px] bg-[#fbfcf8]" : "left-[3px] bg-muted",
          )}
        />
      </button>
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange: (next: T) => void;
  tabs: { value: T; label: string; count?: number }[];
}) {
  return (
    <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-line bg-surface-2/70 p-1 scroll-thin">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
            value === tab.value
              ? "bg-surface text-ink shadow-soft"
              : "text-muted hover:text-ink-soft",
          )}
        >
          {tab.label}
          {tab.count !== undefined ? (
            <span className="text-[11px] text-faint">{tab.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink",
        className,
      )}
    >
      {copied ? <Check className="h-3 w-3 text-positive" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="eyebrow">{children}</span>;
}

const ToastContext = createContext<(message: string, tone?: "default" | "error") => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; message: string; tone: "default" | "error" }[]>([]);

  function push(message: string, tone: "default" | "error" = "default") {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3800);
  }

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex max-w-md items-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] shadow-float animate-rise",
              toast.tone === "error"
                ? "border-rust/30 bg-rust-soft text-rust"
                : "border-line bg-surface text-ink",
            )}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
