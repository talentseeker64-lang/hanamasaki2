import CopilotPanel from "@/components/CopilotPanel";
import { DualLineChart } from "@/components/charts";
import {
  Card,
  CardHeader,
  DataNotice,
  PageHeader,
  SeverityBadge,
} from "@/components/ui";
import {
  COPILOT_SUGGESTIONS,
  answerCopilot,
  buildInsights,
  detectAnomalies,
  forecastSeries,
} from "@/lib/ai";
import { getDataset } from "@/lib/data";
import {
  formatCompact,
  formatDateShort,
  formatDelta,
  formatNumber,
} from "@/lib/format";
import { RANGE_DAYS, WINDOW, bestLag, pctChange, trendPoints } from "@/lib/metrics";

export default function InsightsPage() {
  const dataset = getDataset();
  const insights = buildInsights(dataset);
  const anomalies = detectAnomalies(dataset);
  const copilot = answerCopilot(COPILOT_SUGGESTIONS[3], dataset);

  const points = trendPoints(dataset, RANGE_DAYS);
  const actualViews = points.map((point) => point.socialViews);
  const actualSessions = points.map((point) => point.webSessions);
  const forecastViews = forecastSeries(actualViews, WINDOW);
  const forecastSessions = forecastSeries(actualSessions, WINDOW);

  const lastDate = new Date(`${dataset.range.end}T00:00:00Z`).getTime();
  const forecastLabels = Array.from({ length: WINDOW }, (_, index) =>
    new Date(lastDate + (index + 1) * 86_400_000).toISOString().slice(5, 10),
  );

  const combined = [
    ...points.map((point) => ({
      label: point.label,
      primary: point.socialViews,
      secondary: point.webSessions,
    })),
    ...forecastLabels.map((label, index) => ({
      label,
      primary: forecastViews[index],
      secondary: forecastSessions[index],
    })),
  ];

  const lag = bestLag(actualViews, actualSessions);
  const mean = (values: number[]) =>
    values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
  const viewsTrend = pctChange(mean(forecastViews), mean(actualViews.slice(-WINDOW)));
  const sessionsTrend = pctChange(mean(forecastSessions), mean(actualSessions.slice(-WINDOW)));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`AI Insights · ${dataset.range.days} hari terakhir`}
        title="Rekomendasi dan prediksi"
        description="Temuan disusun dari tiga tingkat kemampuan: monitoring, analisis, dan rekomendasi. Setiap temuan menyertakan bukti angka agar dapat diverifikasi, bukan hanya kesimpulan."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Temuan aktif</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
            {formatNumber(insights.length)}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            Terurut berdasarkan tingkat dampak, bukan hanya besaran angka.
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Anomali terdeteksi
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
            {formatNumber(anomalies.length)}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            Diukur dengan z-score ≥ 2 terhadap rata-rata periode sebelumnya.
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Korelasi sosial → sesi
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
            r = {lag.r.toFixed(2)}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            Kekuatan hubungan pada jeda {lag.lag} hari. Korelasi bukan sebab-akibat.
          </p>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        {insights.map((insight) => (
          <Card key={insight.id}>
            <CardHeader
              title={insight.title}
              description={insight.narrative}
              action={<SeverityBadge severity={insight.severity} />}
            />
            <div className="grid gap-5 px-5 py-5 lg:grid-cols-[1.3fr_1fr]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Bukti
                </p>
                <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  {insight.evidence.map((item) => (
                    <div key={item.label} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                      <dt className="text-[11px] text-slate-400">{item.label}</dt>
                      <dd className="mt-1 text-sm font-semibold tabular-nums text-slate-800">
                        {item.value}
                        {item.change === undefined ? null : (
                          <span
                            className={`ml-2 text-xs ${
                              item.change > 0
                                ? "text-emerald-600"
                                : item.change < 0
                                  ? "text-rose-600"
                                  : "text-slate-400"
                            }`}
                          >
                            {formatDelta(item.change)}
                          </span>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Tindakan disarankan
                </p>
                <ul className="mt-3 flex flex-col gap-2">
                  {insight.actions.map((action) => (
                    <li key={action} className="flex gap-2 text-sm leading-relaxed text-slate-700">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-indigo-400" />
                      {action}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[11px] uppercase tracking-wide text-slate-400">
                  Kategori: {insight.category}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader
          title={`Prediksi ${WINDOW} hari ke depan`}
          description={`Proyeksi memakai regresi linear atas ${RANGE_DAYS} hari data terakhir. Ini arah, bukan kepastian, dan tidak memodelkan musiman atau lonjakan kampanye.`}
        />
        <div className="px-5 pb-4 pt-5">
          <DualLineChart
            points={combined.map((point) => ({
              label: point.label,
              primary: point.primary,
              secondary: point.secondary,
            }))}
            primaryLabel="Tayangan sosial (aktual lalu proyeksi)"
            secondaryLabel="Sesi website (aktual lalu proyeksi)"
            primaryColor="#4f46e5"
            secondaryColor="#0ea5e9"
          />
        </div>
        <div className="border-t border-slate-100 px-5 py-4">
          <DataNotice>
            {WINDOW} titik terakhir pada grafik adalah proyeksi, bukan data aktual. Rata-rata
            harian diproyeksikan {formatDelta(viewsTrend)} untuk tayangan sosial dan{" "}
            {formatDelta(sessionsTrend)} untuk sesi website dibanding {WINDOW} hari terakhir.
          </DataNotice>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Anomali pada periode ini"
          description="Tanggal dengan penyimpangan terbesar dari kebiasaan. Cocokkan dengan jadwal kampanye atau perubahan situs untuk mencari penyebabnya."
        />
        {anomalies.length === 0 ? (
          <p className="px-5 py-5 text-sm text-slate-500">Tidak ada anomali signifikan terdeteksi.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">Tanggal</th>
                  <th className="px-5 py-3 font-medium">Metrik</th>
                  <th className="px-5 py-3 text-right font-medium">Nilai</th>
                  <th className="px-5 py-3 text-right font-medium">Rata-rata dasar</th>
                  <th className="px-5 py-3 text-right font-medium">Z-score</th>
                  <th className="px-5 py-3 font-medium">Tingkat</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.map((anomaly) => (
                  <tr key={anomaly.id} className="border-b border-slate-50 last:border-b-0">
                    <td className="px-5 py-3 font-medium text-slate-700">
                      {formatDateShort(anomaly.date)}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {anomaly.metric}
                      <span
                        className={`ml-2 text-xs ${
                          anomaly.direction === "naik" ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {anomaly.direction === "naik" ? "↑" : "↓"} {anomaly.direction}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                      {formatCompact(anomaly.value)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-500">
                      {formatCompact(anomaly.baseline)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                      {anomaly.zScore.toFixed(2)}
                    </td>
                    <td className="px-5 py-3">
                      <SeverityBadge severity={anomaly.severity} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Tanya AI Marketing Copilot"
          description="Copilot dapat menjelaskan temuan, memproyeksikan performa, atau menyarankan jadwal publikasi berdasarkan data."
        />
        <div className="px-5 py-5">
          <CopilotPanel suggestions={COPILOT_SUGGESTIONS} initialAnswer={copilot} />
        </div>
      </Card>
    </div>
  );
}
