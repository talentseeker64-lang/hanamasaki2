import { Suspense } from "react";
import { BarList, DualLineChart } from "@/components/charts";
import {
  Card,
  CardHeader,
  DataNotice,
  KpiCard,
  PLATFORM_BRAND,
  PageHeader,
  PageSkeleton,
  PlatformBadge,
  ProvenanceBadge,
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
  apiSyncedPlatforms,
  audienceSummary,
  channelHealthScores,
  durationCoverage,
  engagementRateOf,
  HEALTH_BAND_LABEL,
  HEALTH_WEIGHTS,
  kpiSummary,
  pctChange,
  performanceByDuration,
  performanceByFormat,
  performanceByHour,
  performanceByTopic,
  performanceByWeekday,
  platformAggregates,
  postingConsistency,
  socialProvenance,
  topContent,
  topContentByEngagement,
  trendPoints,
  type ChannelHealthScore,
  type HealthBand,
} from "@/lib/metrics";

const FORMAT_LABEL: Record<string, string> = {
  reels: "Reels",
  shorts: "Shorts",
  video: "Video",
  carousel: "Carousel",
  post: "Post",
  story: "Story",
};

const HEALTH_BAND_STYLE: Record<HealthBand, string> = {
  "sangat-baik": "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  baik: "bg-teal-50 text-teal-700 ring-1 ring-teal-200",
  cukup: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  "perlu-perhatian": "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
};

/** Skor satu komponen kesehatan kanal; tanda pisah bila datanya belum ada. */
function healthComponent(row: ChannelHealthScore, key: "growth" | "consistency" | "engagement"): string {
  const component = row.components.find((item) => item.key === key);
  if (!component || component.score === null) return "—";
  return formatNumber(Math.round(component.score));
}

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
  const health = channelHealthScores(dataset);
  const consistency = channels.map((channel) => ({
    platform: channel.platform,
    stats: postingConsistency(dataset, channel.platform),
  }));
  const durations = performanceByDuration(dataset);
  const durationStats = durationCoverage(dataset);
  const audience = audienceSummary(dataset);

  const totalFollowers = channels.reduce((total, row) => total + row.followersGained, 0);
  const totalFollowersPrev = channels.reduce((total, row) => total + row.followersGainedPrev, 0);
  const totalInteractions = channels.reduce((total, row) => total + row.interactions, 0);
  const totalInteractionsPrev = channels.reduce((total, row) => total + row.interactionsPrev, 0);

  // Asal angka seluruh kanal pada jendela berjalan; dipakai sebagai badge per KPI.
  const provenance = socialProvenance(dataset);
  const synced = apiSyncedPlatforms(dataset);
  const unsyncedLabels = channels
    .filter((channel) => !synced.has(channel.platform))
    .map((channel) => PLATFORM_BRAND[channel.platform].label);

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
          provenance={provenance}
        />
        <KpiCard
          label="Total interaksi"
          value={formatCompact(totalInteractions)}
          change={pctChange(totalInteractions, totalInteractionsPrev)}
          hint="Suka + komentar + bagikan + simpan"
          provenance={provenance}
        />
        <KpiCard
          label="Pengikut bertambah"
          value={formatNumber(totalFollowers)}
          change={pctChange(totalFollowers, totalFollowersPrev)}
          hint={`Total pengikut ${formatNumber(kpi.followers)}`}
          provenance={provenance}
        />
        <KpiCard
          label="Klik tautan keluar"
          value={formatCompact(kpi.linkClicks)}
          change={pctChange(kpi.linkClicks, kpi.linkClicksPrev)}
          hint="Jembatan dari kanal sosial menuju website"
          provenance={provenance}
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
            definisinya berbeda di tiap platform.{" "}
            {unsyncedLabels.length === 0
              ? "Metrik harian seluruh kanal pada periode ini sudah berasal dari API platform."
              : `Metrik harian kanal ${unsyncedLabels.join(", ")} belum berasal dari API platform, sehingga angkanya belum dapat dijadikan dasar keputusan.`}
          </DataNotice>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Kesehatan kanal"
          description={`Skor 0–100 yang menggabungkan pertumbuhan pengikut (${Math.round(HEALTH_WEIGHTS.growth * 100)}%), konsistensi posting (${Math.round(HEALTH_WEIGHTS.consistency * 100)}%), dan rasio interaksi (${Math.round(HEALTH_WEIGHTS.engagement * 100)}%). Komponen yang datanya belum tersedia dikeluarkan bersama bobotnya, bukan diganti nilai netral, supaya kanal yang datanya sedikit tidak tampak lebih sehat daripada kenyataannya.`}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-medium">Kanal</th>
                <th className="px-5 py-3 text-right font-medium">Skor</th>
                <th className="px-5 py-3 font-medium">Kategori</th>
                <th className="px-5 py-3 text-right font-medium">Pertumbuhan</th>
                <th className="px-5 py-3 text-right font-medium">Konsistensi</th>
                <th className="px-5 py-3 text-right font-medium">Interaksi</th>
                <th className="px-5 py-3 font-medium">Asal data</th>
              </tr>
            </thead>
            <tbody>
              {health.map((row) => (
                <tr key={row.platform} className="border-b border-slate-50 last:border-b-0">
                  <td className="px-5 py-3">
                    <PlatformBadge platform={row.platform} />
                  </td>
                  <td className="px-5 py-3 text-right font-semibold tabular-nums text-slate-900">
                    {row.weightUsed === 0 ? "—" : formatNumber(Math.round(row.score))}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${HEALTH_BAND_STYLE[row.band]}`}
                    >
                      {row.weightUsed === 0 ? "Belum ada data" : HEALTH_BAND_LABEL[row.band]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {healthComponent(row, "growth")}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {healthComponent(row, "consistency")}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {healthComponent(row, "engagement")}
                  </td>
                  <td className="px-5 py-3">
                    <ProvenanceBadge provenance={socialProvenance(dataset, row.platform)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 px-5 py-4">
          <DataNotice>
            Skor tiap kanal hanya sebanding dengan kanal itu sendiri antarwaktu. Nilai 50 pada
            komponen pertumbuhan berarti tidak ada perubahan, dan rasio interaksi dipetakan
            terhadap acuan sehat 5%.
          </DataNotice>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Konsistensi posting"
          description="Jeda dihitung dari tanggal publikasi yang sebenarnya, bukan dari urutan baris data. Tingkat konsistensi = jumlah hari yang berisi unggahan ÷ rentang hari antara unggahan pertama dan terakhir."
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-medium">Kanal</th>
                <th className="px-5 py-3 text-right font-medium">Unggahan</th>
                <th className="px-5 py-3 text-right font-medium">Hari aktif</th>
                <th className="px-5 py-3 text-right font-medium">Rentang</th>
                <th className="px-5 py-3 text-right font-medium">Rata-rata jeda</th>
                <th className="px-5 py-3 text-right font-medium">Jeda terpanjang</th>
                <th className="px-5 py-3 text-right font-medium">Tingkat konsistensi</th>
              </tr>
            </thead>
            <tbody>
              {consistency.map((row) => (
                <tr key={row.platform} className="border-b border-slate-50 last:border-b-0">
                  <td className="px-5 py-3">
                    <PlatformBadge platform={row.platform} />
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {formatNumber(row.stats.posts)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {formatNumber(row.stats.activeDays)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {row.stats.posts === 0 ? "—" : `${formatNumber(row.stats.spanDays)} hari`}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {row.stats.posts === 0 ? "—" : `${row.stats.avgGapDays.toFixed(1)} hari`}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {row.stats.posts === 0 ? "—" : `${formatNumber(row.stats.longestGapDays)} hari`}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {row.stats.posts === 0 ? "—" : formatPercent(row.stats.consistencyRate, 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 px-5 py-4">
          <DataNotice>
            Konsistensi hanya dihitung dari konten yang tanggal publikasinya tersimpan.{" "}
            {consistency
              .filter((row) => row.stats.posts === 0)
              .map((row) => PLATFORM_BRAND[row.platform].label)
              .join(", ") || "Seluruh kanal"} punya unggahan pada periode ini; kanal tanpa unggahan
            tidak diberi nilai apa pun.
          </DataNotice>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Performa per durasi konten"
          description="Rata-rata rasio interaksi dan tayangan menurut panjang konten. Hanya konten yang durasinya benar-benar dilaporkan platform yang masuk hitungan; konten bergambar tidak diperlakukan sebagai berdurasi nol detik."
        />
        {durations.length === 0 ? (
          <div className="px-5 py-5">
            <p className="text-sm text-slate-400">
              Belum ada konten dengan durasi yang dilaporkan platform pada periode ini.
            </p>
          </div>
        ) : (
          <div className="px-5 py-5">
            <BarList
              items={durations.map((bucket) => ({
                label: bucket.label,
                value: bucket.avgEngagement,
                display: formatPercent(bucket.avgEngagement),
                sublabel: `${formatNumber(bucket.posts)} unggahan · rata-rata ${formatCompact(bucket.avgViews)} tayangan`,
              }))}
              valueFormatter={(value) => formatPercent(value)}
              showChange={false}
            />
          </div>
        )}
        <div className="border-t border-slate-100 px-5 py-4">
          <DataNotice>
            {durationStats.withDuration} dari {durationStats.total} konten pada periode ini memiliki
            durasi yang dilaporkan platform
            {durationStats.withoutDuration > 0
              ? `; ${durationStats.withoutDuration} konten (umumnya gambar) tidak dihitung karena durasinya tidak diketahui.`
              : "."}
          </DataNotice>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Demografi audiens"
          description="Dilaporkan platform sebagai akumulasi seumur akun, bukan sebagai rentang tanggal, dan hanya untuk dimensi yang benar-benar disediakan API."
        />
        {!audience.available ? (
          <div className="px-5 py-5">
            <p className="text-sm text-slate-400">
              Belum tersedia. Demografi audiens belum pernah ditarik dari API platform, sehingga
              tidak ada angka pengganti yang ditampilkan.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 px-5 py-5 lg:grid-cols-2">
            {audience.dimensions.map((dimension) => (
              <div key={dimension.dimension}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {dimension.label}
                  </h3>
                  <ProvenanceBadge provenance={dimension.sourceKind} />
                </div>
                <BarList
                  items={dimension.buckets.map((bucket) => ({
                    label: bucket.bucket,
                    value: bucket.share,
                    display: formatPercent(bucket.share, 1),
                    sublabel: `${formatNumber(bucket.value)} dari ${formatNumber(dimension.total)}`,
                  }))}
                  valueFormatter={(value) => formatPercent(value, 1)}
                  showChange={false}
                />
              </div>
            ))}
          </div>
        )}
        <div className="border-t border-slate-100 px-5 py-4">
          <DataNotice>
            Persentase dihitung terhadap total dimensi itu sendiri. Bila satu dimensi sudah berasal
            dari API, data ilustratif pada dimensi yang sama tidak lagi ditampilkan agar angkanya
            tidak tergandakan.
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
            title="Waktu publikasi terbaik"
            description="Rata-rata rasio interaksi berdasarkan jam unggah konten, bukan jam aktif audiens — platform tidak menyediakan jam aktif audiens. Karena tiap platform berbeda, uji ulang per kanal."
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
