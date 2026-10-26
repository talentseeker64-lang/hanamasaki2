import { Suspense } from "react";
import { Card, CardHeader, DataNotice, PageHeader, PageSkeleton } from "@/components/ui";
import { buildReport } from "@/lib/ai";
import { getDataset } from "@/lib/data";
import { formatDateLong, formatDelta, formatNumber } from "@/lib/format";

export default function ReportsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReportsContent />
    </Suspense>
  );
}

async function ReportsContent() {
  const dataset = await getDataset();
  const report = buildReport(dataset);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`Reports · ${dataset.range.days} hari terakhir`}
        title="Laporan otomatis"
        description="Ringkasan siap dibagikan ke tim atau klien. Isinya dibangkitkan dari mesin analitik yang sama dengan halaman lain, sehingga angkanya konsisten di seluruh dashboard."
      />

      <Card>
        <CardHeader
          title={report.title}
          description={`Periode ${report.period}`}
          action={
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              Dibuat {formatDateLong(dataset.range.end)}
            </span>
          }
        />
        <div className="px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Sorotan utama
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {report.highlights.map((highlight) => (
              <li key={highlight} className="flex gap-2 text-sm leading-relaxed text-slate-700">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-indigo-400" />
                {highlight}
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Metrik kunci"
          description="Perbandingan terhadap periode sebelumnya dengan panjang jendela yang sama."
        />
        <dl className="grid gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
          {report.metrics.map((metric) => (
            <div key={metric.label} className="rounded-lg border border-slate-100 bg-slate-50/60 p-4">
              <dt className="text-xs text-slate-500">{metric.label}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
                {metric.value}
              </dd>
              {metric.change === undefined ? null : (
                <dd
                  className={`mt-1 text-xs ${
                    metric.change > 0
                      ? "text-emerald-600"
                      : metric.change < 0
                        ? "text-rose-600"
                        : "text-slate-400"
                  }`}
                >
                  {formatDelta(metric.change)}
                  <span className="ml-1 text-slate-400">vs periode sebelumnya</span>
                </dd>
              )}
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <CardHeader
          title="Rekomendasi tindak lanjut"
          description="Disusun dari temuan berprioritas tertinggi dan diagnosis lintas kanal."
        />
        <ol className="flex flex-col gap-3 px-5 py-5">
          {report.recommendations.map((recommendation, index) => (
            <li key={recommendation} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">
                {index + 1}
              </span>
              <p className="text-sm leading-relaxed text-slate-700">{recommendation}</p>
            </li>
          ))}
        </ol>
        <div className="border-t border-slate-100 px-5 py-4">
          <DataNotice>
            Versi ini menghasilkan laporan secara langsung saat halaman dibuka. Penjadwalan
            berkala, ekspor PDF/CSV, dan pengiriman otomatis ke email atau kanal tim belum termasuk
            dan direncanakan pada tahap berikutnya.
          </DataNotice>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Cakupan data"
          description="Ringkasan jumlah baris data yang mendasari laporan ini."
        />
        <div className="grid gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-slate-500">Baris metrik sosial</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
              {formatNumber(dataset.social.length)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Baris metrik website</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
              {formatNumber(dataset.web.length)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Konten</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
              {formatNumber(dataset.content.length)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Komentar</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
              {formatNumber(dataset.comments.length)}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
