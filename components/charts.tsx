import { formatCompact, formatDelta, formatNumber, formatPercent } from "@/lib/format";

/* ------------------------------------------------------------------ */
/* Grafik garis dua seri dengan sumbu ganda                            */
/* ------------------------------------------------------------------ */

export interface LinePoint {
  label: string;
  primary: number;
  secondary: number;
}

export function DualLineChart({
  points,
  primaryLabel,
  secondaryLabel,
  primaryColor = "#4f46e5",
  secondaryColor = "#0ea5e9",
  height = 260,
}: {
  points: LinePoint[];
  primaryLabel: string;
  secondaryLabel: string;
  primaryColor?: string;
  secondaryColor?: string;
  height?: number;
}) {
  const width = 780;
  const pad = { top: 16, right: 56, bottom: 28, left: 56 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const primaryMax = Math.max(1, ...points.map((point) => point.primary));
  const secondaryMax = Math.max(1, ...points.map((point) => point.secondary));

  const x = (index: number) =>
    pad.left + (points.length <= 1 ? 0 : (index / (points.length - 1)) * innerW);
  const yPrimary = (value: number) => pad.top + innerH - (value / primaryMax) * innerH;
  const ySecondary = (value: number) => pad.top + innerH - (value / secondaryMax) * innerH;

  const primaryPath = points.map((point, index) => `${x(index)},${yPrimary(point.primary)}`).join(" ");
  const secondaryPath = points
    .map((point, index) => `${x(index)},${ySecondary(point.secondary)}`)
    .join(" ");
  const primaryArea = `${pad.left},${pad.top + innerH} ${primaryPath} ${x(points.length - 1)},${pad.top + innerH}`;

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs">
        <span className="inline-flex items-center gap-2 text-slate-600">
          <span className="h-0.5 w-5 rounded" style={{ background: primaryColor }} />
          {primaryLabel}
        </span>
        <span className="inline-flex items-center gap-2 text-slate-600">
          <span className="h-0.5 w-5 rounded" style={{ background: secondaryColor }} />
          {secondaryLabel}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Grafik ${primaryLabel} dan ${secondaryLabel}`}
      >
        <defs>
          <linearGradient id="primaryFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={primaryColor} stopOpacity="0.18" />
            <stop offset="100%" stopColor={primaryColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((tick) => {
          const y = pad.top + innerH * (1 - tick);
          return (
            <g key={tick}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
                stroke="#e2e8f0"
                strokeDasharray="3 4"
              />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" className="fill-slate-400 text-[10px]">
                {formatCompact(primaryMax * tick)}
              </text>
              <text
                x={width - pad.right + 8}
                y={y + 4}
                textAnchor="start"
                className="fill-slate-400 text-[10px]"
              >
                {formatCompact(secondaryMax * tick)}
              </text>
            </g>
          );
        })}

        <polygon points={primaryArea} fill="url(#primaryFill)" />
        <polyline points={primaryPath} fill="none" stroke={primaryColor} strokeWidth="2.4" />
        <polyline
          points={secondaryPath}
          fill="none"
          stroke={secondaryColor}
          strokeWidth="2.4"
          strokeDasharray="6 4"
        />

        {points.map((point, index) => (
          <g key={point.label}>
            <circle cx={x(index)} cy={yPrimary(point.primary)} r="2.6" fill={primaryColor}>
              <title>{`${point.label} · ${primaryLabel}: ${formatNumber(point.primary)}`}</title>
            </circle>
            <circle cx={x(index)} cy={ySecondary(point.secondary)} r="2.6" fill={secondaryColor}>
              <title>{`${point.label} · ${secondaryLabel}: ${formatNumber(point.secondary)}`}</title>
            </circle>
          </g>
        ))}

        {points.map((point, index) =>
          index % 5 === 0 || index === points.length - 1 ? (
            <text
              key={`label-${point.label}`}
              x={x(index)}
              y={height - 8}
              textAnchor="middle"
              className="fill-slate-400 text-[10px]"
            >
              {point.label}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Daftar batang horizontal                                            */
/* ------------------------------------------------------------------ */

export interface BarItem {
  label: string;
  value: number;
  display?: string;
  change?: number;
  sublabel?: string;
  color?: string;
}

export function BarList({
  items,
  valueFormatter = formatNumber,
  showChange = true,
}: {
  items: BarItem[];
  valueFormatter?: (value: number) => string;
  showChange?: boolean;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium text-slate-700">{item.label}</span>
            <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
              <span className="font-semibold text-slate-900">
                {item.display ?? valueFormatter(item.value)}
              </span>
              {showChange && item.change !== undefined ? (
                <span
                  className={`text-xs ${
                    item.change > 0
                      ? "text-emerald-600"
                      : item.change < 0
                        ? "text-rose-600"
                        : "text-slate-400"
                  }`}
                >
                  {formatDelta(item.change)}
                </span>
              ) : null}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(2, (item.value / max) * 100)}%`,
                background: item.color ?? "#4f46e5",
              }}
            />
          </div>
          {item.sublabel ? (
            <p className="mt-1 text-[11px] text-slate-400">{item.sublabel}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Batang bertumpuk                                                    */
/* ------------------------------------------------------------------ */

export interface StackSegment {
  label: string;
  value: number;
  color: string;
}

export function StackedBar({ segments }: { segments: StackSegment[] }) {
  const total = Math.max(
    1,
    segments.reduce((sum, segment) => sum + segment.value, 0),
  );
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
        {segments.map((segment) => (
          <div
            key={segment.label}
            title={`${segment.label}: ${formatNumber(segment.value)}`}
            style={{ width: `${(segment.value / total) * 100}%`, background: segment.color }}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600">
        {segments.map((segment) => (
          <span key={segment.label} className="inline-flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: segment.color }} />
            {segment.label}
            <span className="font-semibold tabular-nums text-slate-900">
              {formatPercent((segment.value / total) * 100)}
            </span>
            <span className="tabular-nums text-slate-400">({formatNumber(segment.value)})</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Corong konversi                                                     */
/* ------------------------------------------------------------------ */

export function FunnelBars({
  steps,
}: {
  steps: Array<{ key: string; label: string; value: number; stepRate: number | null; totalRate: number }>;
}) {
  const max = Math.max(1, ...steps.map((step) => step.value));
  return (
    <ul className="flex flex-col gap-3">
      {steps.map((step) => (
        <li key={step.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium text-slate-700">{step.label}</span>
            <span className="tabular-nums font-semibold text-slate-900">{formatNumber(step.value)}</span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-indigo-500"
              style={{ width: `${Math.max(1.5, (step.value / max) * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {step.stepRate === null
              ? "Titik awal corong"
              : `Lanjut dari langkah sebelumnya ${formatPercent(step.stepRate)} · ${formatPercent(step.totalRate)} dari total tayangan`}
          </p>
        </li>
      ))}
    </ul>
  );
}
