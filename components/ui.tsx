import type { Severity, Platform } from "@/lib/types";
import { formatDelta, formatPoints } from "@/lib/format";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">{description}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-indigo-600">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">{description}</p>
      </div>
      {children}
    </div>
  );
}

export function DeltaChip({
  value,
  invert = false,
  suffix = "vs periode sebelumnya",
  asPoints = false,
}: {
  value: number;
  invert?: boolean;
  suffix?: string;
  asPoints?: boolean;
}) {
  const positive = invert ? value < 0 : value > 0;
  const flat = Math.abs(value) < 0.05;
  const tone = flat
    ? "bg-slate-100 text-slate-600"
    : positive
      ? "bg-emerald-50 text-emerald-700"
      : "bg-rose-50 text-rose-700";
  const arrow = flat ? "=" : value > 0 ? "↑" : "↓";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      <span aria-hidden>{arrow}</span>
      {asPoints ? formatPoints(value) : formatDelta(value)}
      <span className="font-normal text-slate-500">{suffix}</span>
    </span>
  );
}

const SEVERITY_STYLE: Record<Severity, { label: string; className: string }> = {
  critical: { label: "KRITIS", className: "bg-rose-600 text-white" },
  high: { label: "PENTING", className: "bg-rose-50 text-rose-700 ring-1 ring-rose-200" },
  medium: { label: "PERHATIAN", className: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" },
  low: { label: "RENDAH", className: "bg-sky-50 text-sky-700 ring-1 ring-sky-200" },
  info: { label: "INFO", className: "bg-slate-100 text-slate-600 ring-1 ring-slate-200" },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const style = SEVERITY_STYLE[severity];
  return (
    <span className={`rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide ${style.className}`}>
      {style.label}
    </span>
  );
}

const PLATFORM_STYLE: Record<Platform, { label: string; className: string; short: string }> = {
  instagram: { label: "Instagram", className: "bg-pink-50 text-pink-700 ring-1 ring-pink-200", short: "IG" },
  tiktok: { label: "TikTok", className: "bg-slate-900 text-white", short: "TT" },
  youtube: { label: "YouTube", className: "bg-red-50 text-red-700 ring-1 ring-red-200", short: "YT" },
  facebook: { label: "Facebook", className: "bg-blue-50 text-blue-700 ring-1 ring-blue-200", short: "FB" },
};

export function PlatformBadge({ platform }: { platform: Platform }) {
  const style = PLATFORM_STYLE[platform];
  return (
    <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${style.className}`}>
      {style.label}
    </span>
  );
}

export function platformStyles() {
  return PLATFORM_STYLE;
}

export function MetricRow({
  label,
  value,
  change,
  hint,
}: {
  label: string;
  value: string;
  change?: number;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0">
      <div>
        <p className="text-sm text-slate-700">{label}</p>
        {hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums text-slate-900">{value}</p>
        {change === undefined ? null : (
          <p
            className={`text-xs tabular-nums ${
              change > 0 ? "text-emerald-600" : change < 0 ? "text-rose-600" : "text-slate-400"
            }`}
          >
            {formatDelta(change)}
          </p>
        )}
      </div>
    </div>
  );
}

export function DataNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500 ring-1 ring-slate-100">
      {children}
    </p>
  );
}

/** Placeholder saat data D1 sedang dimuat pada request. */
export function PageSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-hidden>
      <div className="h-24 rounded-xl bg-slate-100" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-28 rounded-xl bg-slate-100" />
        ))}
      </div>
      <div className="h-72 rounded-xl bg-slate-100" />
    </div>
  );
}

export function KpiCard({
  label,
  value,
  change,
  hint,
  invertChange = false,
  asPoints = false,
}: {
  label: string;
  value: string;
  change?: number;
  hint?: string;
  invertChange?: boolean;
  asPoints?: boolean;
}) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {change === undefined ? null : (
        <div className="mt-2">
          <DeltaChip value={change} invert={invertChange} asPoints={asPoints} suffix="vs periode sebelumnya" />
        </div>
      )}
      {hint ? <p className="mt-2 text-xs leading-relaxed text-slate-400">{hint}</p> : null}
    </Card>
  );
}

