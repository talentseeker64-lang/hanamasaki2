import CopilotPanel from "@/components/CopilotPanel";
import { DualLineChart, FunnelBars } from "@/components/charts";
import {
  Card,
  CardHeader,
  DataNotice,
  KpiCard,
  PageHeader,
  PlatformBadge,
} from "@/components/ui";
import { COPILOT_SUGGESTIONS, answerCopilot } from "@/lib/ai";
import { getDataset } from "@/lib/data";
import {
  formatCompact,
  formatDuration,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import type { TrafficChannel } from "@/lib/types";
import { conversionFunnel, pctChange, webTotals } from "@/lib/metrics";

const CHANNEL_LABEL: Record<TrafficChannel, string> = {
  organic: "Pencarian organik",
  social: "Media sosial",
  referral: "Rujukan",
  direct: "Langsung",
  paid: "Iklan berbayar",
  email: "Email",
};

export default function WebsitePage() {
  const dataset = getDataset();
  const totals = webTotals(dataset);
  const funnel = conversionFunnel(dataset);
  const copilot = answerCopilot(COPILOT_SUGGESTIONS[0], dataset);

  const recentWeb = dataset.web.slice(-dataset.range.days);
  const points = recentWeb.map((row) => ({
    label: row.date.slice(5),
    primary: row.sessions,
    secondary: row.conversions,
  }));

  const sources = [...dataset.sources].sort((a, b) => b.sessions - a.sessions);
  const pages = [...dataset.pages].sort((a, b) => b.views30 - a.views30);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`Website Analytics · ${dataset.range.days} hari terakhir`}
        title="Trafik, sumber kunjungan, dan konversi"
        description="Perjalanan pengunjung dilacak dari sumber kunjungan, halaman masuk, hingga konversi. Konversi di sini adalah target bisnis yang dilaporkan oleh situs, bukan transaksi yang diverifikasi."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Sesi"
          value={formatNumber(totals.sessions)}
          change={pctChange(totals.sessions, totals.sessionsPrev)}
          hint={`${formatNumber(totals.users)} pengguna · ${formatNumber(totals.newUsers)} pengguna baru`}
        />
        <KpiCard
          label="Tampilan halaman"
          value={formatNumber(totals.pageViews)}
          hint={`Rata-rata ${(totals.pageViews / Math.max(1, totals.sessions)).toFixed(2)} halaman per sesi`}
        />
        <KpiCard
          label="Konversi"
          value={formatNumber(totals.conversions)}
          change={pctChange(totals.conversions, totals.conversionsPrev)}
          hint={`Tingkat konversi ${formatPercent(totals.conversionRate)} (sebelumnya ${formatPercent(totals.conversionRatePrev)})`}
        />
        <KpiCard
          label="Rasio pentalan"
          value={formatPercent(totals.bounceRate)}
          hint={`Rata-rata durasi sesi ${formatDuration(totals.avgSessionSeconds)}`}
        />
      </div>

      <Card>
        <CardHeader
          title="Tren sesi dan konversi"
          description="Sesi dan konversi diplot pada dua sumbu karena skalanya berbeda. Keduanya perlu dibaca bersama agar tidak menyimpulkan tren dari satu garis saja."
        />
        <div className="px-5 pb-4 pt-5">
          <DualLineChart
            points={points}
            primaryLabel="Sesi"
            secondaryLabel="Konversi"
            primaryColor="#0ea5e9"
            secondaryColor="#10b981"
          />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <Card>
          <CardHeader
            title="Sumber kunjungan"
            description="Sesi dan konversi per sumber pada periode ini, dibandingkan dengan periode sebelumnya."
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">Sumber</th>
                  <th className="px-5 py-3 font-medium">Kanal</th>
                  <th className="px-5 py-3 text-right font-medium">Sesi</th>
                  <th className="px-5 py-3 text-right font-medium">Konversi</th>
                  <th className="px-5 py-3 text-right font-medium">Rasio pentalan</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <tr key={source.source} className="border-b border-slate-50 last:border-b-0">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">{source.source}</span>
                        {source.platform ? <PlatformBadge platform={source.platform} /> : null}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{CHANNEL_LABEL[source.channel]}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                      {formatNumber(source.sessions)}
                      <span
                        className={`ml-2 text-xs ${
                          source.sessions >= source.sessionsPrev ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {source.sessions >= source.sessionsPrev ? "↑" : "↓"}
                        {Math.abs(pctChange(source.sessions, source.sessionsPrev)).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                      {formatNumber(source.conversions)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                      {formatPercent(source.bounceRate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Corong lintas kanal"
            description="Penyempitan dari tayangan sosial sampai konversi website. Ini gambaran keterkaitan, bukan atribusi transaksi."
          />
          <div className="px-5 py-5">
            <FunnelBars steps={funnel} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Halaman yang paling banyak dikunjungi"
          description="Tingkat konversi dihitung dari konversi dibagi tampilan halaman pada periode ini."
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-medium">Halaman</th>
                <th className="px-5 py-3 text-right font-medium">Tampilan</th>
                <th className="px-5 py-3 text-right font-medium">Konversi</th>
                <th className="px-5 py-3 text-right font-medium">Tingkat konversi</th>
                <th className="px-5 py-3 text-right font-medium">Durasi</th>
                <th className="px-5 py-3 text-right font-medium">Rasio keluar</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((page) => (
                <tr key={page.path} className="border-b border-slate-50 last:border-b-0">
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-800">{page.title}</p>
                    <p className="text-xs text-slate-400">{page.path}</p>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {formatNumber(page.views30)}
                    <span
                      className={`ml-2 text-xs ${
                        page.views30 >= page.views30Prev ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {page.views30 >= page.views30Prev ? "↑" : "↓"}
                      {Math.abs(pctChange(page.views30, page.views30Prev)).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {formatNumber(page.conversions30)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {formatPercent((page.conversions30 / Math.max(1, page.views30)) * 100, 2)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {formatDuration(page.avgSeconds)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {formatPercent(page.exitRate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 px-5 py-4">
          <DataNotice>
            Halaman <span className="font-medium text-slate-600">/promo-oktober</span> menerima
            cukup banyak kunjungan tetapi konversinya melemah, sejalan dengan temuan pada halaman
            AI Insights.
          </DataNotice>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Google Search Console"
          description="Klik organik, impresi, CTR, dan posisi rata-rata per kata kunci. Perubahan posisi menjelaskan sebagian pergerakan trafik organik."
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-medium">Kata kunci</th>
                <th className="px-5 py-3 text-right font-medium">Impresi</th>
                <th className="px-5 py-3 text-right font-medium">Klik</th>
                <th className="px-5 py-3 text-right font-medium">CTR</th>
                <th className="px-5 py-3 text-right font-medium">Posisi</th>
              </tr>
            </thead>
            <tbody>
              {dataset.search.map((query) => (
                <tr key={query.query} className="border-b border-slate-50 last:border-b-0">
                  <td className="px-5 py-3 font-medium text-slate-700">{query.query}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {formatCompact(query.impressions)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {formatNumber(query.clicks)}
                    <span
                      className={`ml-2 text-xs ${
                        query.clicks >= query.clicksPrev ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {query.clicks >= query.clicksPrev ? "↑" : "↓"}
                      {Math.abs(pctChange(query.clicks, query.clicksPrev)).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {formatPercent(query.ctr)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {query.position.toFixed(1)}
                    <span
                      className={`ml-2 text-xs ${
                        query.position <= query.positionPrev ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {query.position <= query.positionPrev ? "↑" : "↓"}
                      {Math.abs(query.position - query.positionPrev).toFixed(1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Tanya AI Marketing Copilot"
          description="Ajukan pertanyaan tentang penurunan trafik, sumber kunjungan, atau halaman yang perlu diperbaiki."
        />
        <div className="px-5 py-5">
          <CopilotPanel suggestions={COPILOT_SUGGESTIONS} initialAnswer={copilot} />
        </div>
      </Card>
    </div>
  );
}
