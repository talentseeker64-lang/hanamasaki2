import Link from "next/link";
import CopilotPanel from "@/components/CopilotPanel";
import { BarList, DualLineChart, FunnelBars, StackedBar } from "@/components/charts";
import {
  Card,
  CardHeader,
  DataNotice,
  KpiCard,
  PageHeader,
  PlatformBadge,
  SeverityBadge,
} from "@/components/ui";
import { COPILOT_SUGGESTIONS, answerCopilot, buildInsights } from "@/lib/ai";
import { getDataset } from "@/lib/data";
import {
  formatCompact,
  formatDateLong,
  formatNumber,
  formatPercent,
  formatPoints,
} from "@/lib/format";
import {
  commentAnalysis,
  conversionFunnel,
  kpiSummary,
  pctChange,
  platformAggregates,
  trendPoints,
} from "@/lib/metrics";

const SENTIMENT_COLOR = { positive: "#10b981", neutral: "#94a3b8", negative: "#f43f5e" };

export default function OverviewPage() {
  const dataset = getDataset();
  const kpi = kpiSummary(dataset);
  const channels = platformAggregates(dataset);
  const insights = buildInsights(dataset).slice(0, 3);
  const comments = commentAnalysis(dataset);
  const points = trendPoints(dataset);
  const funnel = conversionFunnel(dataset);
  const copilot = answerCopilot(COPILOT_SUGGESTIONS[0], dataset);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`Overview · ${dataset.range.days} hari terakhir`}
        title="Pusat kendali performa digital"
        description={`Periode ${formatDateLong(dataset.range.start)} — ${formatDateLong(dataset.range.end)}. Seluruh kanal sosial dan website disatukan pada satu tampilan, dengan pembanding periode sebelumnya yang panjangnya sama.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total tayangan"
          value={formatCompact(kpi.totalViews)}
          change={pctChange(kpi.totalViews, kpi.totalViewsPrev)}
          hint={`${formatNumber(kpi.totalViews)} tayangan dari 4 kanal sosial`}
        />
        <KpiCard
          label="Rasio interaksi"
          value={formatPercent(kpi.engagementRate)}
          change={kpi.engagementRate - kpi.engagementRatePrev}
          asPoints
          hint="(suka + komentar + bagikan + simpan) ÷ tayangan"
        />
        <KpiCard
          label="Pengunjung website"
          value={formatNumber(kpi.sessions)}
          change={pctChange(kpi.sessions, kpi.sessionsPrev)}
          hint={`${formatNumber(kpi.sessions)} sesi, termasuk ${formatCompact(kpi.linkClicks)} klik dari sosial`}
        />
        <KpiCard
          label="Konversi"
          value={formatNumber(kpi.conversions)}
          change={pctChange(kpi.conversions, kpi.conversionsPrev)}
          hint={`Tingkat konversi ${formatPercent((kpi.conversions / Math.max(1, kpi.sessions)) * 100)}`}
        />
      </div>

      <Card>
        <CardHeader
          title="Performa digital"
          description="Tayangan sosial dan sesi website diplot pada dua sumbu berbeda karena skalanya berbeda jauh. Garis putus-putus adalah sesi website."
        />
        <div className="px-5 pb-4 pt-5">
          <DualLineChart
            points={points.map((point) => ({
              label: point.label,
              primary: point.socialViews,
              secondary: point.webSessions,
            }))}
            primaryLabel="Tayangan sosial"
            secondaryLabel="Sesi website"
          />
        </div>
        <div className="border-t border-slate-100 px-5 py-4">
          <DataNotice>
            Kenaikan tayangan tidak selalu berarti kenaikan kunjungan. Pada periode ini, klik
            tautan keluar dari kanal sosial {kpi.linkClicksPrev > 0
              ? `berubah ${((kpi.linkClicks - kpi.linkClicksPrev) / kpi.linkClicksPrev * 100).toFixed(1)}%`
              : "belum dapat dibandingkan"}
            , sehingga perlu dibaca bersama angka sesi website.
          </DataNotice>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="AI Insights"
            description="Temuan yang sudah diprioritaskan berdasarkan besaran dampak, bukan sekadar peringkat angka."
            action={
              <Link href="/insights" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
                Lihat semua
              </Link>
            }
          />
          <ul className="flex flex-col divide-y divide-slate-100">
            {insights.map((insight) => (
              <li key={insight.id} className="px-5 py-4">
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={insight.severity} />
                  <span className="text-[11px] uppercase tracking-wide text-slate-400">
                    {insight.category}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium text-slate-900">{insight.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{insight.narrative}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Analisis komentar"
            description="Temukan topik yang sering dibicarakan, pertanyaan yang belum terjawab, dan sentimen audiens."
            action={
              <Link href="/comments" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
                Buka Comments AI
              </Link>
            }
          />
          <div className="flex flex-col gap-5 px-5 py-5">
            <StackedBar
              segments={comments.sentiments.map((item) => ({
                label:
                  item.key === "positive" ? "Positif" : item.key === "negative" ? "Negatif" : "Netral",
                value: item.count,
                color: SENTIMENT_COLOR[item.key],
              }))}
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Topik teratas
              </p>
              <div className="mt-2">
                <BarList
                  items={comments.topics.slice(0, 4).map((topic) => ({
                    label: topic.topic,
                    value: topic.count,
                    display: `${formatNumber(topic.count)} komentar`,
                    sublabel: `Skor sentimen ${topic.sentimentScore.toFixed(0)} dari 100`,
                    showChange: false,
                  }))}
                  showChange={false}
                />
              </div>
            </div>
            <DataNotice>
              {comments.unanswered.length} pertanyaan bernilai tinggi dan {comments.complaints.length}{" "}
              keluhan menunggu tindak lanjut pada periode ini.
            </DataNotice>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Rekomendasi berikutnya"
          description="Bandingkan performa berdasarkan jenis konten, waktu publikasi, dan tujuan kampanye."
        />
        <div className="px-5 py-5">
          <BarList
            items={channels.map((channel) => ({
              label: channel.platform === "instagram" ? "Instagram" : channel.platform === "tiktok" ? "TikTok" : channel.platform === "youtube" ? "YouTube" : "Facebook",
              value: channel.views,
              display: formatCompact(channel.views),
              change: pctChange(channel.views, channel.viewsPrev),
              sublabel: `Interaksi ${formatPercent(channel.engagementRate)} · klik tautan ${formatPercent(channel.linkCtr, 2)} · pengikut +${formatNumber(channel.followersGained)}`,
            }))}
            valueFormatter={formatCompact}
          />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader
            title="Corong lintas kanal"
            description="Dari tayangan konten sosial sampai konversi di website. Setiap langkah menunjukkan berapa yang benar-benar lanjut."
          />
          <div className="px-5 py-5">
            <FunnelBars steps={funnel} />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Tanya AI Marketing Copilot"
            description="Copilot menggabungkan metrik sosial, trafik, dan komentar untuk menjawab pertanyaan diagnosis, bukan hanya menampilkan angka."
          />
          <div className="px-5 py-5">
            <CopilotPanel suggestions={COPILOT_SUGGESTIONS} initialAnswer={copilot} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Perbandingan kanal"
          description="Angka dari setiap platform memiliki definisi yang berbeda. Bandingkan arah perubahan, bukan hanya nilai absolutnya."
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-medium">Kanal</th>
                <th className="px-5 py-3 text-right font-medium">Tayangan</th>
                <th className="px-5 py-3 text-right font-medium">Jangkauan</th>
                <th className="px-5 py-3 text-right font-medium">Interaksi</th>
                <th className="px-5 py-3 text-right font-medium">Klik tautan</th>
                <th className="px-5 py-3 text-right font-medium">Pengikut +</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((channel) => (
                <tr key={channel.platform} className="border-b border-slate-50 last:border-b-0">
                  <td className="px-5 py-3">
                    <PlatformBadge platform={channel.platform} />
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {formatCompact(channel.views)}
                    <span
                      className={`ml-2 text-xs ${
                        channel.views - channel.viewsPrev >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {pctChange(channel.views, channel.viewsPrev) >= 0 ? "↑" : "↓"}
                      {Math.abs(pctChange(channel.views, channel.viewsPrev)).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {formatCompact(channel.reach)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {formatPercent(channel.engagementRate)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {formatCompact(channel.linkClicks)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    +{formatNumber(channel.followersGained)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 px-5 py-4">
          <p className="text-xs leading-relaxed text-slate-500">
            Total pengikut gabungan {formatNumber(kpi.followers)} (+
            {formatNumber(kpi.followers - kpi.followersPrev)} pada periode ini). Rasio interaksi
            keseluruhan {formatPercent(kpi.engagementRate)} ({formatPoints(kpi.engagementRate - kpi.engagementRatePrev)}).
          </p>
        </div>
      </Card>
    </div>
  );
}
