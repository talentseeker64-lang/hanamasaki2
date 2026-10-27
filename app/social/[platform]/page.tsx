import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BarList, DualLineChart } from "@/components/charts";
import {
  Card,
  CardHeader,
  DataNotice,
  KpiCard,
  MetricRow,
  PLATFORM_BRAND,
  PLATFORM_ORDER,
  PageHeader,
  PageSkeleton,
  PlatformIcon,
  isPlatform,
} from "@/components/ui";
import { getDataset } from "@/lib/data";
import {
  formatCompact,
  formatDateShort,
  formatDateTime,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import type { ChannelAccount, Platform } from "@/lib/types";
import {
  engagementRateOf,
  pctChange,
  performanceByFormat,
  performanceByHour,
  performanceByTopic,
  performanceByWeekday,
  platformAggregates,
  platformTrendPoints,
  topContent,
  topContentByEngagement,
} from "@/lib/metrics";

const FORMAT_LABEL: Record<string, string> = {
  reels: "Reels",
  shorts: "Shorts",
  video: "Video",
  carousel: "Carousel",
  post: "Post",
  story: "Story",
};

export default async function PlatformSocialPage({
  params,
}: {
  params: Promise<{ platform: string }>;
}) {
  const { platform } = await params;
  if (!isPlatform(platform)) notFound();

  return (
    <Suspense fallback={<PageSkeleton />}>
      <PlatformContent platform={platform} />
    </Suspense>
  );
}

/** Label status koneksi yang jujur: hijau hanya bila sinkronisasi pernah berhasil. */
function connectionBadge(account: ChannelAccount): { label: string; className: string } {
  if (account.lastSyncAt) {
    return {
      label: "Terhubung (terverifikasi)",
      className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    };
  }
  if (account.connection === "connected" || account.connection === "needs_review") {
    return {
      label: account.connection === "connected" ? "Terhubung (belum diverifikasi)" : "Perlu ditinjau",
      className: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    };
  }
  return {
    label: "Belum terhubung",
    className: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  };
}

function ListBody({ hasItems, children }: { hasItems: boolean; children: React.ReactNode }) {
  if (!hasItems) {
    return <p className="text-sm text-slate-400">Belum ada konten pada periode ini.</p>;
  }
  return <>{children}</>;
}

async function PlatformContent({ platform }: { platform: Platform }) {
  const dataset = await getDataset();
  const brand = PLATFORM_BRAND[platform];
  const account = dataset.accounts.find((entry) => entry.platform === platform);
  const aggregate = platformAggregates(dataset).find((row) => row.platform === platform);
  if (!aggregate) notFound();

  const points = platformTrendPoints(dataset, platform);
  const byViews = topContent(dataset, 6, platform);
  const byEngagement = topContentByEngagement(dataset, 6, platform);
  const formats = performanceByFormat(dataset, platform);
  const topics = performanceByTopic(dataset, platform);
  const hours = performanceByHour(dataset, platform);
  const weekdays = performanceByWeekday(dataset, platform);

  const impressions = dataset.social
    .filter((row) => row.platform === platform && row.date >= dataset.range.start)
    .reduce((total, row) => total + row.impressions, 0);
  const conversation = dataset.comments.filter(
    (item) => item.platform === platform && item.createdAt.slice(0, 10) >= dataset.range.start,
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex flex-wrap items-center gap-2">
        <Link
          href="/social"
          className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Semua kanal
        </Link>
        {PLATFORM_ORDER.map((key) => {
          const active = key === platform;
          return (
            <Link
              key={key}
              href={`/social/${key}`}
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <PlatformIcon platform={key} className="size-3.5" />
              {PLATFORM_BRAND[key].label}
            </Link>
          );
        })}
      </nav>

      <PageHeader
        eyebrow={`Social Media · ${brand.label} · ${dataset.range.days} hari terakhir`}
        title={`Kinerja ${brand.label}`}
        description={`Seluruh angka pada halaman ini hanya berasal dari kanal ${brand.label}, sehingga trennya tidak tercampur kanal lain. Definisi metrik tetap mengikuti platform ini dan tidak bisa dibandingkan langsung sebagai nilai absolut dengan kanal berbeda.`}
      />

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-50 ring-1 ring-slate-100">
              <PlatformIcon platform={platform} className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {account?.displayName ?? `Akun ${brand.label} belum terdaftar`}
              </p>
              <p className="text-xs text-slate-500">
                {account?.handle ? `@${account.handle.replace(/^@/, "")}` : "Hubungkan akun di menu Integrations"}
              </p>
              {account ? (
                <span
                  className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${connectionBadge(account).className}`}
                >
                  {connectionBadge(account).label}
                </span>
              ) : null}
            </div>
          </div>
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">Pengikut saat ini</dt>
              <dd className="font-semibold tabular-nums text-slate-900">
                {account ? formatNumber(account.followers) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Pengikut awal periode</dt>
              <dd className="font-semibold tabular-nums text-slate-900">
                {account ? formatNumber(account.followersStart) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Sinkronisasi terakhir</dt>
              <dd className="font-semibold tabular-nums text-slate-900">
                {account?.lastSyncAt ? formatDateTime(account.lastSyncAt) : "Belum pernah"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Percakapan (komentar AI)</dt>
              <dd className="font-semibold tabular-nums text-slate-900">
                {formatNumber(conversation)}
              </dd>
            </div>
          </dl>
        </div>
        {account?.limitation ? (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 ring-1 ring-amber-100">
            {account.limitation}
          </p>
        ) : null}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Tayangan"
          value={formatCompact(aggregate.views)}
          change={pctChange(aggregate.views, aggregate.viewsPrev)}
          hint={`${formatNumber(aggregate.views)} tayangan pada periode ini`}
        />
        <KpiCard
          label="Interaksi"
          value={formatCompact(aggregate.interactions)}
          change={pctChange(aggregate.interactions, aggregate.interactionsPrev)}
          hint={`Rasio interaksi ${formatPercent(aggregate.engagementRate)}`}
        />
        <KpiCard
          label="Pengikut bertambah"
          value={formatNumber(aggregate.followersGained)}
          change={pctChange(aggregate.followersGained, aggregate.followersGainedPrev)}
          hint={`Total pengikut ${account ? formatNumber(account.followers) : "—"}`}
        />
        <KpiCard
          label="Klik tautan keluar"
          value={formatCompact(aggregate.linkClicks)}
          change={pctChange(aggregate.linkClicks, aggregate.linkClicksPrev)}
          hint={`Rasio klik ${formatPercent(aggregate.linkCtr, 2)} dari tayangan`}
        />
      </div>

      <Card>
        <CardHeader
          title={`Tayangan vs klik tautan keluar — ${brand.label}`}
          description="Hanya dua seri dari kanal ini. Kenaikan tayangan yang tidak diikuti klik menandakan dorongan menuju website masih lemah."
        />
        <div className="px-5 pb-4 pt-5">
          <DualLineChart
            points={points.map((point) => ({
              label: point.label,
              primary: point.socialViews,
              secondary: point.linkClicks,
            }))}
            primaryLabel="Tayangan"
            secondaryLabel="Klik tautan keluar"
            primaryColor={brand.color}
            secondaryColor="#f59e0b"
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Rincian metrik kanal"
          description="Angka periode ini dibandingkan periode sebelumnya. Impresi adalah total penayangan, jangkauan adalah pengguna unik."
        />
        <div className="grid gap-x-10 px-5 py-4 sm:grid-cols-2">
          <MetricRow
            label="Tayangan"
            value={formatNumber(aggregate.views)}
            change={pctChange(aggregate.views, aggregate.viewsPrev)}
          />
          <MetricRow
            label="Jangkauan"
            value={formatNumber(aggregate.reach)}
            change={pctChange(aggregate.reach, aggregate.reachPrev)}
          />
          <MetricRow label="Impresi" value={formatNumber(impressions)} />
          <MetricRow label="Suka" value={formatNumber(aggregate.likes)} />
          <MetricRow label="Komentar" value={formatNumber(aggregate.comments)} />
          <MetricRow label="Bagikan" value={formatNumber(aggregate.shares)} />
          <MetricRow label="Simpan" value={formatNumber(aggregate.saves)} />
          <MetricRow
            label="Interaksi"
            value={formatNumber(aggregate.interactions)}
            change={pctChange(aggregate.interactions, aggregate.interactionsPrev)}
          />
          <MetricRow
            label="Rasio interaksi"
            value={formatPercent(aggregate.engagementRate)}
            change={aggregate.engagementRate - aggregate.engagementRatePrev}
            hint="Suka + komentar + bagikan + simpan ÷ tayangan"
          />
          <MetricRow label="Kunjungan profil" value={formatNumber(aggregate.profileVisits)} />
          <MetricRow
            label="Klik tautan keluar"
            value={formatNumber(aggregate.linkClicks)}
            change={pctChange(aggregate.linkClicks, aggregate.linkClicksPrev)}
          />
          <MetricRow
            label="Rasio klik tautan"
            value={formatPercent(aggregate.linkCtr, 2)}
            change={aggregate.linkCtr - aggregate.linkCtrPrev}
            hint="Klik tautan ÷ tayangan"
          />
          <MetricRow
            label="Pengikut bertambah"
            value={`+${formatNumber(aggregate.followersGained)}`}
            change={pctChange(aggregate.followersGained, aggregate.followersGainedPrev)}
          />
        </div>
        <div className="border-t border-slate-100 px-5 py-4">
          <DataNotice>
            Nilai rasio interaksi dan rasio klik ditampilkan sebagai selisih poin persen terhadap
            periode sebelumnya, bukan persentase pertumbuhan.
          </DataNotice>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={`Konten ${brand.label} dengan tayangan tertinggi`}
            description="Konten kanal ini yang paling banyak dilihat pada periode berjalan."
          />
          <div className="px-5 py-5">
            <ListBody hasItems={byViews.length > 0}>
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
            </ListBody>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Konten dengan rasio interaksi tertinggi"
            description="Tayangan besar tidak selalu berarti interaksi besar. Daftar ini menunjukkan kualitas, bukan volume."
          />
          <div className="px-5 py-5">
            <ListBody hasItems={byEngagement.length > 0}>
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
            </ListBody>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Performa per format"
            description={`Rata-rata rasio interaksi konten ${brand.label}, dikelompokkan per format.`}
          />
          <div className="px-5 py-5">
            <ListBody hasItems={formats.length > 0}>
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
            </ListBody>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Performa per topik"
            description={`Topik yang paling sering dibicarakan dan paling efektif menarik interaksi di ${brand.label}.`}
          />
          <div className="px-5 py-5">
            <ListBody hasItems={topics.length > 0}>
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
            </ListBody>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Jam publikasi terbaik"
            description={`Rata-rata rasio interaksi berdasarkan jam unggah konten ${brand.label}.`}
          />
          <div className="px-5 py-5">
            <ListBody hasItems={hours.length > 0}>
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
            </ListBody>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Hari publikasi terbaik"
            description={`Rata-rata rasio interaksi berdasarkan hari unggah konten ${brand.label}.`}
          />
          <div className="px-5 py-5">
            <ListBody hasItems={weekdays.length > 0}>
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
            </ListBody>
          </div>
        </Card>
      </div>
    </div>
  );
}
