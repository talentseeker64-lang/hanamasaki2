import { Suspense } from "react";
import { BarList, DualLineChart } from "@/components/charts";
import {
  Card,
  CardHeader,
  DataNotice,
  KpiCard,
  PageHeader,
  PageSkeleton,
  PlatformBadge,
} from "@/components/ui";
import { getDataset } from "@/lib/data";
import {
  formatCompact,
  formatDateShort,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import type { Platform } from "@/lib/types";
import {
  engagementRateOf,
  kpiSummary,
  pctChange,
  performanceByFormat,
  performanceByHour,
  performanceByTopic,
  performanceByWeekday,
  platformAggregates,
  topContent,
  topContentByEngagement,
  trendPoints,
} from "@/lib/metrics";

const FORMAT_LABEL: Record<string, string> = {
  reels: "Reels",
  shorts: "Shorts",
  video: "Video",
  carousel: "Carousel",
  post: "Post",
  story: "Story",
};

export default function SocialPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SocialContent />
    </Suspense>
  );
}

async function SocialContent() {
  const dataset = await getDataset();
  const kpi = kpiSummary(dataset);
  const channels = platformAggregates(dataset);
  const points = trendPoints(dataset);
  const byViews = topContent(dataset, 6);
  const byEngagement = topContentByEngagement(dataset, 6);
  const formats = performanceByFormat(dataset);
  const hours = performanceByHour(dataset);
  const weekdays = performanceByWeekday(dataset);
  const topics = performanceByTopic(dataset);

  const totalFollowers = channels.reduce((total, row) => total + row.followersGained, 0);
  const totalFollowersPrev = channels.reduce((total, row) => total + row.followersGainedPrev, 0);
  const totalInteractions = channels.reduce((total, row) => total + row.interactions, 0);
  const totalInteractionsPrev = channels.reduce((total, row) => total + row.interactionsPrev, 0);

  const impressionsByPlatform = new Map<Platform, number>();
  for (const row of dataset.social) {
    if (row.date < dataset.range.start) continue;
    impressionsByPlatform.set(
      row.platform,
      (impressionsByPlatform.get(row.platform) ?? 0) + row.impressions,
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`Social Media · ${dataset.range.days} hari terakhir`}
        title="Statistik per platform dan per konten"
        description="Empat kanal sosial dibaca dengan definisi metrik masing-masing. Angka tayangan antarplatform tidak selalu setara, jadi bandingkan arah perubahannya, bukan hanya nilai absolutnya."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total tayangan"
          value={formatCompact(kpi.totalViews)}
          change={pctChange(kpi.totalViews, kpi.totalViewsPrev)}
          hint={`${formatNumber(kpi.totalViews)} tayangan dari 4 kanal`}
        />
        <KpiCard
          label="Total interaksi"
          value={formatCompact(totalInteractions)}
          change={pctChange(totalInteractions, totalInteractionsPrev)}
          hint="Suka + komentar + bagikan + simpan"
        />
        <KpiCard
          label="Pengikut bertambah"
          value={formatNumber(totalFollowers)}
          change={pctChange(totalFollowers, totalFollowersPrev)}
          hint={`Total pengikut ${formatNumber(kpi.followers)}`}
        />
        <KpiCard
          label="Klik tautan keluar"
          value={formatCompact(kpi.linkClicks)}
          change={pctChange(kpi.linkClicks, kpi.linkClicksPrev)}
          hint="Jembatan dari kanal sosial menuju website"
        />
      </div>

      <Card>
        <CardHeader
          title="Tayangan sosial vs klik tautan keluar"
          description="Dua seri ini memberi gambaran apakah kenaikan tayangan benar-benar berlanjut menjadi kunjungan ke website."
        />
        <div className="px-5 pb-4 pt-5">
          <DualLineChart
            points={points.map((point) => ({
              label: point.label,
              primary: point.socialViews,
              secondary: point.linkClicks,
            }))}
            primaryLabel="Tayangan sosial"
            secondaryLabel="Klik tautan keluar"
            primaryColor="#4f46e5"
            secondaryColor="#f59e0b"
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Perbandingan kanal"
          description="Rasio interaksi = (suka + komentar + bagikan + simpan) ÷ tayangan. Rasio klik = klik tautan ÷ tayangan."
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-medium">Kanal</th>
                <th className="px-5 py-3 text-right font-medium">Tayangan</th>
                <th className="px-5 py-3 text-right font-medium">Jangkauan</th>
                <th className="px-5 py-3 text-right font-medium">Impresi</th>
                <th className="px-5 py-3 text-right font-medium">Suka</th>
                <th className="px-5 py-3 text-right font-medium">Komentar</th>
                <th className="px-5 py-3 text-right font-medium">Bagikan</th>
                <th className="px-5 py-3 text-right font-medium">Simpan</th>
                <th className="px-5 py-3 text-right font-medium">Interaksi</th>
                <th className="px-5 py-3 text-right font-medium">Kunjungan profil</th>
                <th className="px-5 py-3 text-right font-medium">Klik tautan</th>
                <th className="px-5 py-3 text-right font-medium">Rasio klik</th>
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
                        channel.views >= channel.viewsPrev ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {channel.views >= channel.viewsPrev ? "↑" : "↓"}
                      {Math.abs(pctChange(channel.views, channel.viewsPrev)).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {formatCompact(channel.reach)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {formatCompact(impressionsByPlatform.get(channel.platform) ?? 0)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {formatCompact(channel.likes)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {formatNumber(channel.comments)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {formatNumber(channel.shares)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {formatNumber(channel.saves)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {formatPercent(channel.engagementRate)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {formatCompact(channel.profileVisits)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {formatCompact(channel.linkClicks)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {formatPercent(channel.linkCtr, 2)}
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
          <DataNotice>
            Jangkauan (pengguna unik) dan impresi (total penayangan) bukan angka yang sama, dan
            definisinya berbeda di tiap platform. Kanal Facebook pada contoh ini berstatus perlu
            ditinjau, sehingga sebagian metriknya belum tersinkron.
          </DataNotice>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Konten dengan tayangan tertinggi"
            description="Konten yang paling banyak dilihat pada periode ini."
          />
          <div className="px-5 py-5">
            <BarList
              items={byViews.map((item) => ({
                label: item.title,
                value: item.views,
                display: formatCompact(item.views),
                sublabel: `${FORMAT_LABEL[item.format] ?? item.format} · ${formatDateShort(item.publishedAt.slice(0, 10))} · interaksi ${formatPercent(engagementRateOf(item))}`,
              }))}
              valueFormatter={formatCompact}
              showChange={false}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Konten dengan rasio interaksi tertinggi"
            description="Tayangan besar tidak selalu berarti interaksi besar. Daftar ini menunjukkan kualitas, bukan volume."
          />
          <div className="px-5 py-5">
            <BarList
              items={byEngagement.map((item) => ({
                label: item.title,
                value: engagementRateOf(item),
                display: formatPercent(engagementRateOf(item)),
                sublabel: `${FORMAT_LABEL[item.format] ?? item.format} · ${formatCompact(item.views)} tayangan · ${formatNumber(item.shares)} bagikan`,
              }))}
              valueFormatter={(value) => formatPercent(value)}
              showChange={false}
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Performa per format"
            description="Rata-rata rasio interaksi dari konten pada periode ini, dikelompokkan per format."
          />
          <div className="px-5 py-5">
            <BarList
              items={formats.map((bucket) => ({
                label: FORMAT_LABEL[bucket.key] ?? bucket.key,
                value: bucket.avgEngagement,
                display: formatPercent(bucket.avgEngagement),
                sublabel: `${formatNumber(bucket.posts)} unggahan · rata-rata ${formatCompact(bucket.avgViews)} tayangan`,
              }))}
              valueFormatter={(value) => formatPercent(value)}
              showChange={false}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Performa per topik"
            description="Topik yang paling sering dibicarakan dan paling efektif menarik interaksi."
          />
          <div className="px-5 py-5">
            <BarList
              items={topics.slice(0, 6).map((bucket) => ({
                label: bucket.label,
                value: bucket.avgEngagement,
                display: formatPercent(bucket.avgEngagement),
                sublabel: `${formatNumber(bucket.posts)} unggahan · ${formatNumber(bucket.totalShares)} bagikan`,
              }))}
              valueFormatter={(value) => formatPercent(value)}
              showChange={false}
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Jam publikasi terbaik"
            description="Rata-rata rasio interaksi berdasarkan jam unggah. Karena tiap platform berbeda, uji ulang per kanal."
          />
          <div className="px-5 py-5">
            <BarList
              items={hours.map((bucket) => ({
                label: bucket.label,
                value: bucket.avgEngagement,
                display: formatPercent(bucket.avgEngagement),
                sublabel: `${formatNumber(bucket.posts)} unggahan`,
              }))}
              valueFormatter={(value) => formatPercent(value)}
              showChange={false}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Hari publikasi terbaik"
            description="Rata-rata rasio interaksi berdasarkan hari unggah pada periode ini."
          />
          <div className="px-5 py-5">
            <BarList
              items={weekdays.map((bucket) => ({
                label: bucket.label,
                value: bucket.avgEngagement,
                display: formatPercent(bucket.avgEngagement),
                sublabel: `${formatNumber(bucket.posts)} unggahan · rata-rata ${formatCompact(bucket.avgViews)} tayangan`,
              }))}
              valueFormatter={(value) => formatPercent(value)}
              showChange={false}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
