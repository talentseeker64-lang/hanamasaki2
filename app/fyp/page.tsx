import Link from "next/link";
import { Suspense } from "react";
import {
  Card,
  CardHeader,
  PLATFORM_BRAND,
  PLATFORM_ORDER,
  PageHeader,
  PageSkeleton,
  PlatformIcon,
  ProvenanceBadge,
  isPlatform,
} from "@/components/ui";
import { getDataset } from "@/lib/data";
import {
  FYP_CAVEAT,
  FYP_TREND_WINDOW_DAYS,
  fypAssessments,
  type FypAssessment,
  type FypIndicator,
  type FypUnit,
} from "@/lib/fyp";
import { formatCompact, formatDateShort, formatPercent } from "@/lib/format";
import type { Platform } from "@/lib/types";

const FORMAT_LABEL: Record<string, string> = {
  reels: "Reels",
  shorts: "Shorts",
  video: "Video",
  carousel: "Carousel",
  post: "Post",
  story: "Story",
};

const BAND_STYLE: Record<FypAssessment["band"], string> = {
  atas: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  setara: "bg-slate-100 text-slate-600 ring-slate-200",
  bawah: "bg-amber-50 text-amber-700 ring-amber-100",
};

export default async function FypPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string }>;
}) {
  const { platform } = await searchParams;
  return (
    <Suspense fallback={<PageSkeleton />}>
      <FypContent requested={platform} />
    </Suspense>
  );
}

async function FypContent({ requested }: { requested?: string }) {
  const dataset = await getDataset();

  // Kanal yang dipilih harus punya konten; kalau tidak, jatuh ke kanal pertama
  // yang punya. Skor hanya bermakna bila ada konten pembanding.
  const available = PLATFORM_ORDER.filter((key) =>
    dataset.content.some((item) => item.platform === key),
  );
  const active: Platform | null =
    requested && isPlatform(requested) && available.includes(requested)
      ? requested
      : (available[0] ?? null);

  if (!active) {
    return (
      <div className="flex flex-col gap-6">
        <FypHeader />
        <Card className="p-6">
          <p className="text-sm text-slate-500">
            Belum ada konten pada periode ini, sehingga belum ada yang bisa dibandingkan.
            Skor baru bermakna setelah ada beberapa konten di kanal yang sama.
          </p>
        </Card>
      </div>
    );
  }

  const assessments = fypAssessments(dataset, active, 8);
  const brand = PLATFORM_BRAND[active];

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex flex-wrap items-center gap-2">
        {PLATFORM_ORDER.map((key) => {
          const enabled = available.includes(key);
          const selected = key === active;
          const className = `inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition ${
            selected
              ? "bg-slate-900 text-white"
              : enabled
                ? "border border-slate-200 text-slate-600 hover:bg-slate-50"
                : "border border-dashed border-slate-200 text-slate-300"
          }`;
          return enabled ? (
            <Link key={key} href={`/fyp?platform=${key}`} className={className}>
              <PlatformIcon platform={key} className="size-3.5" />
              {PLATFORM_BRAND[key].label}
            </Link>
          ) : (
            <span key={key} className={className} aria-disabled>
              <PlatformIcon platform={key} className="size-3.5" />
              {PLATFORM_BRAND[key].label}
            </span>
          );
        })}
      </nav>

      <FypHeader />

      <CaveatCard />

      <Card className="p-5">
        <CardHeader
          title={`Bagaimana skor ${brand.label} ini dihitung`}
          description={`Setiap indikator dibandingkan dengan kebiasaan kanal ${brand.label} sendiri pada ${dataset.range.days} hari terakhir, bukan dengan kanal lain. Pembanding diambil dari ${assessments[0]?.peerCount ?? 0} konten di kanal yang sama.`}
        />
        <div className="flex flex-col gap-2 px-5 pb-5 pt-3 text-sm leading-relaxed text-slate-600">
          <p>
            Nilai 50 berarti konten ini persis setara kebiasaan kanal; nilai 100 berarti
            indikatornya mencapai dua kali kebiasaan kanal. Pita “atas” ditandai pada skor 60
            ke atas dan “bawah” pada 40 ke bawah.
          </p>
          <p className="text-xs text-slate-500">
            Bobot indikator ditetapkan terbuka: jangkauan tayangan dan rasio interaksi
            masing-masing 25%, bagikan dan simpan masing-masing 20%, tren topik 10%. Bobot ini
            pilihan yang dinyatakan, bukan hasil kalibrasi terhadap data FYP nyata — data itu
            tidak tersedia.
          </p>
        </div>
      </Card>

      {assessments.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-slate-500">Belum ada konten pada periode ini.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {assessments.map((assessment) => (
            <AssessmentCard key={assessment.item.id} assessment={assessment} />
          ))}
        </div>
      )}
    </div>
  );
}

function FypHeader() {
  return (
    <PageHeader
      eyebrow="FYP & Viral Potential"
      title="Potensi distribusi relatif"
      description="Skor di halaman ini menempatkan sebuah konten terhadap konten lain di kanal yang sama. Ini bukan prediksi algoritma: tidak ada dokumentasi publik yang memetakan indikator ke keputusan distribusi, sehingga setiap angka di sini harus dibaca sebagai perbandingan, bukan jaminan."
    />
  );
}

/** Peringatan batas modul; dibuat menonjol supaya tidak terlewat. */
function CaveatCard() {
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
        Batas yang wajib dibaca
      </p>
      <p className="mt-1 text-sm leading-relaxed text-amber-900">{FYP_CAVEAT}</p>
    </section>
  );
}

function AssessmentCard({ assessment }: { assessment: FypAssessment }) {
  const { item } = assessment;
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-50 ring-1 ring-slate-100">
              <PlatformIcon platform={item.platform} className="size-4" />
            </span>
            <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
            <ProvenanceBadge provenance={item.sourceKind} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {FORMAT_LABEL[item.format] ?? item.format} · topik {item.topic} ·{" "}
            {formatDateShort(item.publishedAt.slice(0, 10))} · {formatCompact(item.views)} tayangan
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-2xl font-semibold tabular-nums text-slate-900">
              {assessment.score}
            </p>
            <p className="text-[11px] text-slate-400">dari 100</p>
          </div>
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${BAND_STYLE[assessment.band]}`}
          >
            {bandLabel(assessment.band)}
          </span>
        </div>
      </div>

      <div className="px-5 py-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
              <th className="pb-2 font-medium">Indikator</th>
              <th className="pb-2 text-right font-medium">Konten</th>
              <th className="pb-2 text-right font-medium">Kebiasaan kanal</th>
              <th className="pb-2 text-right font-medium">Skor relatif</th>
            </tr>
          </thead>
          <tbody>
            {assessment.indicators.map((indicator) => (
              <tr key={indicator.id} className="border-t border-slate-100">
                <td className="py-2 text-slate-700">{indicator.label}</td>
                <td className="py-2 text-right tabular-nums text-slate-900">
                  {formatIndicator(indicator)}
                </td>
                <td className="py-2 text-right tabular-nums text-slate-500">
                  {formatBenchmark(indicator)}
                </td>
                <td className="py-2 text-right tabular-nums text-slate-900">
                  {Math.round(indicator.score * 100)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {assessment.unavailable.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-2">
            {assessment.unavailable.map((indicator) => (
              <li
                key={indicator.id}
                className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500 ring-1 ring-slate-100"
              >
                <span className="font-semibold text-slate-600">
                  {indicator.label} — belum tersedia.
                </span>{" "}
                {indicator.reason}
              </li>
            ))}
          </ul>
        ) : null}

        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          Skor relatif 100 berarti indikator mencapai dua kali kebiasaan kanal, 50 berarti setara.
          Pembanding: {assessment.peerCount} konten sekanal dalam {FYP_TREND_WINDOW_DAYS} hari
          terakhir untuk arah tren.
        </p>
      </div>
    </Card>
  );
}

function bandLabel(band: FypAssessment["band"]): string {
  if (band === "atas") return "Di atas kebiasaan kanal";
  if (band === "setara") return "Setara kebiasaan kanal";
  return "Di bawah kebiasaan kanal";
}

function formatByUnit(value: number, unit: FypUnit): string {
  if (unit === "count") return formatCompact(value);
  if (unit === "percent") return formatPercent(value);
  if (unit === "perThousand") return `${decimal(value, 1)} per 1.000`;
  return `${decimal(value, 2)}×`;
}

/** Bilangan pecahan dengan pemisah desimal Indonesia. */
function decimal(value: number, digits: number): string {
  return value.toFixed(digits).replace(".", ",");
}

function formatIndicator(indicator: FypIndicator): string {
  return formatByUnit(indicator.value, indicator.unit);
}

function formatBenchmark(indicator: FypIndicator): string {
  if (indicator.unit === "ratio") return "1,00× (acuan)";
  return formatByUnit(indicator.benchmark, indicator.unit);
}
