import type { ReactNode } from "react";
import { accentFor, cn, providerMonogram, severityClasses } from "@/lib/format";

export function ProviderMark({
  name,
  size = 36,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const accent = accentFor(name);
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-[10px] border font-semibold",
        className,
      )}
      style={{
        width: size,
        height: size,
        color: accent,
        borderColor: `${accent}33`,
        backgroundColor: `${accent}0f`,
        fontSize: size * 0.31,
        letterSpacing: "0.02em",
      }}
      aria-hidden
    >
      {providerMonogram(name)}
    </span>
  );
}

export function SeverityBadge({ severity, className }: { severity: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize leading-4",
        severityClasses(severity),
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {severity}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "alert" | "positive";
}) {
  return (
    <div className="card flex flex-col justify-between gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] font-medium text-muted">{label}</p>
        {icon ? (
          <span
            className={cn(
              "grid h-7 w-7 place-items-center rounded-lg border",
              tone === "alert"
                ? "border-rust/20 bg-rust-soft text-rust"
                : tone === "positive"
                  ? "border-positive/20 bg-positive-soft text-positive"
                  : "border-line bg-surface-2 text-muted",
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <div className="space-y-0.5">
        <p className="text-[26px] font-semibold leading-none tracking-[-0.02em] text-ink">{value}</p>
        {hint ? <p className="pt-1 text-[11.5px] text-faint">{hint}</p> : null}
      </div>
    </div>
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 pb-3">
      <div className="space-y-0.5">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        {description ? <p className="text-[12px] text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
