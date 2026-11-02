import { RANGE_DAYS, RANGE_TOTAL, WINDOW } from "./demo-dataset";
import type {
  AudienceDimension,
  AudienceInsight,
  CommentIntent,
  CommentItem,
  ContentItem,
  DailySocialMetric,
  DataProvenance,
  DataSourceKind,
  Dataset,
  KpiSummary,
  Platform,
  Sentiment,
  TrendPoint,
} from "./types";

const PLATFORMS: Platform[] = ["instagram", "tiktok", "youtube", "facebook"];

export function pctChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

/* ------------------------------------------------------------------ */
/* Jendela berbasis tanggal                                            */
/* ------------------------------------------------------------------ */

/** Rentang tanggal inklusif. */
export interface DateWindow {
  start: string;
  end: string;
}

/** Geser tanggal ISO (`YYYY-MM-DD`) sebanyak `days` hari; negatif berarti mundur. */
export function shiftDate(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Jendela `days` hari yang berakhir pada `end`, beserta jendela pembanding tepat
 * sebelumnya.
 *
 * Batasnya tanggal, bukan posisi baris. Itulah intinya: kanal yang belum
 * tersinkronisasi tidak lagi menggeser periode kanal lain, dan menambah data di
 * luar rentang tidak mengubah angka yang sedang dibandingkan.
 */
export function trailingWindows(
  end: string,
  days: number,
): { current: DateWindow; previous: DateWindow } {
  return {
    current: { start: shiftDate(end, -(days - 1)), end },
    previous: { start: shiftDate(end, -(days * 2 - 1)), end: shiftDate(end, -days) },
  };
}

/** Apakah tanggal ISO (`YYYY-MM-DD`) berada di dalam jendela, inklusif. */
export function inWindow(date: string, window: DateWindow): boolean {
  return date >= window.start && date <= window.end;
}

/* ------------------------------------------------------------------ */
/* Provenance                                                          */
/* ------------------------------------------------------------------ */

/**
 * Ringkasan asal data untuk sekumpulan baris.
 *
 * Dipakai supaya penanda asal data menempel pada angka yang benar-benar
 * ditampilkan, bukan pada seluruh aplikasi. Kumpulan baris yang tidak seragam
 * dilaporkan `mixed`, agar angkanya tidak tampak lebih terpercaya daripada
 * kenyataannya.
 */
export function provenanceOf(rows: Array<{ sourceKind: DataSourceKind }>): DataProvenance {
  if (rows.length === 0) return "empty";
  const kinds = new Set(rows.map((row) => row.sourceKind));
  if (kinds.size > 1) return "mixed";
  return [...kinds][0];
}

/**
 * Platform yang metrik hariannya benar-benar pernah ditulis sinkronisasi API.
 *
 * Dipakai untuk memisahkan koneksi yang terbukti dari koneksi yang baru sempat
 * membaca pengikut: `lastSyncAt` saja tidak cukup karena `recordFollowers`
 * mengisinya walau metrik utama kanal belum pernah berhasil diambil.
 */
export function apiSyncedPlatforms(dataset: Dataset): Set<Platform> {
  return new Set(
    dataset.social.filter((row) => row.sourceKind === "platform-api").map((row) => row.platform),
  );
}

/**
 * Asal data untuk sekumpulan baris metrik pada jendela berjalan.
 *
 * Dipakai agar badge provenance menempel pada angka yang benar-benar
 * ditampilkan — bukan pada seluruh aplikasi. Baris di luar jendela tidak ikut
 * dihitung, sama seperti agregatnya.
 */
export function socialProvenance(
  dataset: Dataset,
  platform?: Platform,
  days = RANGE_DAYS,
): DataProvenance {
  const window = trailingWindows(dataset.range.end, days).current;
  return provenanceOf(
    dataset.social.filter(
      (row) => inWindow(row.date, window) && (!platform || row.platform === platform),
    ),
  );
}

export function webProvenance(dataset: Dataset, days = RANGE_DAYS): DataProvenance {
  const window = trailingWindows(dataset.range.end, days).current;
  return provenanceOf(dataset.web.filter((row) => inWindow(row.date, window)));
}

export function commentProvenance(
  dataset: Dataset,
  platform?: Platform,
  days = RANGE_DAYS,
): DataProvenance {
  const window = trailingWindows(dataset.range.end, days).current;
  return provenanceOf(
    dataset.comments.filter(
      (item) =>
        inWindow(item.createdAt.slice(0, 10), window) && (!platform || item.platform === platform),
    ),
  );
}

export function engagementRateOf(item: {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
}): number {
  if (item.views === 0) return 0;
  return ((item.likes + item.comments + item.shares + item.saves) / item.views) * 100;
}

/* ------------------------------------------------------------------ */
/* Agregat kanal sosial                                                */
/* ------------------------------------------------------------------ */

export interface PlatformAggregate {
  platform: Platform;
  views: number;
  viewsPrev: number;
  reach: number;
  reachPrev: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  interactions: number;
  interactionsPrev: number;
  followersGained: number;
  followersGainedPrev: number;
  profileVisits: number;
  linkClicks: number;
  linkClicksPrev: number;
  engagementRate: number;
  engagementRatePrev: number;
  /** Rasio klik tautan terhadap tayangan, dalam persen. */
  linkCtr: number;
  linkCtrPrev: number;
}

function emptyMetric() {
  return {
    views: 0,
    reach: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    followersGained: 0,
    profileVisits: 0,
    linkClicks: 0,
  };
}

function aggregateRows(rows: DailySocialMetric[], window: DateWindow): ReturnType<typeof emptyMetric> {
  const total = emptyMetric();
  for (const row of rows) {
    if (!inWindow(row.date, window)) continue;
    total.views += row.views;
    total.reach += row.reach;
    total.likes += row.likes;
    total.comments += row.comments;
    total.shares += row.shares;
    total.saves += row.saves;
    total.followersGained += row.followersGained;
    total.profileVisits += row.profileVisits;
    total.linkClicks += row.linkClicks;
  }
  return total;
}

export function platformAggregates(
  dataset: Dataset,
  days = RANGE_DAYS,
): PlatformAggregate[] {
  const { current, previous } = trailingWindows(dataset.range.end, days);
  return PLATFORMS.map((platform) => {
    const rows = dataset.social.filter((row) => row.platform === platform);
    const now = aggregateRows(rows, current);
    const prev = aggregateRows(rows, previous);
    return {
      platform,
      views: now.views,
      viewsPrev: prev.views,
      reach: now.reach,
      reachPrev: prev.reach,
      likes: now.likes,
      comments: now.comments,
      shares: now.shares,
      saves: now.saves,
      interactions: now.likes + now.comments + now.shares + now.saves,
      interactionsPrev: prev.likes + prev.comments + prev.shares + prev.saves,
      followersGained: now.followersGained,
      followersGainedPrev: prev.followersGained,
      profileVisits: now.profileVisits,
      linkClicks: now.linkClicks,
      linkClicksPrev: prev.linkClicks,
      engagementRate: engagementRateOf(now),
      engagementRatePrev: engagementRateOf(prev),
      linkCtr: safeDiv(now.linkClicks, now.views) * 100,
      linkCtrPrev: safeDiv(prev.linkClicks, prev.views) * 100,
    };
  }).sort((a, b) => b.views - a.views);
}

export function kpiSummary(dataset: Dataset): KpiSummary {
  const platformTotals = platformAggregates(dataset);
  const totals = platformTotals.reduce(
    (acc, row) => ({
      views: acc.views + row.views,
      viewsPrev: acc.viewsPrev + row.viewsPrev,
      interactions: acc.interactions + row.interactions,
      interactionsPrev: acc.interactionsPrev + row.interactionsPrev,
      linkClicks: acc.linkClicks + row.linkClicks,
      linkClicksPrev: acc.linkClicksPrev + row.linkClicksPrev,
      followersGained: acc.followersGained + row.followersGained,
    }),
    {
      views: 0,
      viewsPrev: 0,
      interactions: 0,
      interactionsPrev: 0,
      linkClicks: 0,
      linkClicksPrev: 0,
      followersGained: 0,
    },
  );

  const web = webTotals(dataset);
  const followersNow = sum(dataset.accounts.map((account) => account.followers));

  return {
    totalViews: totals.views,
    totalViewsPrev: totals.viewsPrev,
    engagementRate: safeDiv(totals.interactions, totals.views) * 100,
    engagementRatePrev: safeDiv(totals.interactionsPrev, totals.viewsPrev) * 100,
    followers: followersNow,
    followersPrev: followersNow - totals.followersGained,
    sessions: web.sessions,
    sessionsPrev: web.sessionsPrev,
    conversions: web.conversions,
    conversionsPrev: web.conversionsPrev,
    linkClicks: totals.linkClicks,
    linkClicksPrev: totals.linkClicksPrev,
  };
}

/* ------------------------------------------------------------------ */
/* Deret waktu                                                         */
/* ------------------------------------------------------------------ */

export function trendPoints(dataset: Dataset, days = RANGE_DAYS): TrendPoint[] {
  const window = trailingWindows(dataset.range.end, days).current;
  const dates = dataset.social
    .filter((row) => inWindow(row.date, window))
    .map((row) => row.date)
    .filter((date, index, list) => list.indexOf(date) === index)
    .sort();
  return dates.map((date) => {
    const socialViews = dataset.social
      .filter((row) => row.date === date)
      .reduce((total, row) => total + row.views, 0);
    const linkClicks = dataset.social
      .filter((row) => row.date === date)
      .reduce((total, row) => total + row.linkClicks, 0);
    const webRow = dataset.web.find((row) => row.date === date);
    return {
      date,
      label: date.slice(5),
      socialViews,
      linkClicks,
      webSessions: webRow?.sessions ?? 0,
    };
  });
}

/** Deret waktu satu kanal saja, agar tren per platform tidak tercampur kanal lain. */
export function platformTrendPoints(
  dataset: Dataset,
  platform: Platform,
  days = RANGE_DAYS,
): TrendPoint[] {
  const window = trailingWindows(dataset.range.end, days).current;
  const rows = dataset.social.filter(
    (row) => row.platform === platform && inWindow(row.date, window),
  );
  return rows.map((row) => {
    const webRow = dataset.web.find((item) => item.date === row.date);
    return {
      date: row.date,
      label: row.date.slice(5),
      socialViews: row.views,
      linkClicks: row.linkClicks,
      webSessions: webRow?.sessions ?? 0,
    };
  });
}

/** Korelasi Pearson, mengembalikan nilai -1..1. */
export function correlate(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (length < 3) return 0;
  const xs = a.slice(-length);
  const ys = b.slice(-length);
  const meanX = sum(xs) / length;
  const meanY = sum(ys) / length;
  let numerator = 0;
  let denominatorX = 0;
  let denominatorY = 0;
  for (let i = 0; i < length; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    numerator += dx * dy;
    denominatorX += dx * dx;
    denominatorY += dy * dy;
  }
  const denominator = Math.sqrt(denominatorX * denominatorY);
  return denominator === 0 ? 0 : numerator / denominator;
}

/** Cari jeda hari (0-4) yang paling kuat menghubungkan aktivitas sosial ke sesi website. */
export function bestLag(socialViews: number[], webSessions: number[]): { lag: number; r: number } {
  let best = { lag: 0, r: 0 };
  for (let lag = 0; lag <= 4; lag += 1) {
    const shiftedSocial = socialViews.slice(0, socialViews.length - lag);
    const shiftedWeb = webSessions.slice(lag);
    const r = correlate(shiftedSocial, shiftedWeb);
    if (Math.abs(r) > Math.abs(best.r)) best = { lag, r };
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Konten                                                              */
/* ------------------------------------------------------------------ */

export function windowContent(dataset: Dataset, platform?: Platform): ContentItem[] {
  const start = dataset.range.start;
  return dataset.content.filter(
    (item) =>
      item.publishedAt.slice(0, 10) >= start && (!platform || item.platform === platform),
  );
}

export function topContent(
  dataset: Dataset,
  limit = 6,
  platform?: Platform,
): ContentItem[] {
  return [...windowContent(dataset, platform)]
    .sort((a, b) => b.views - a.views)
    .slice(0, limit);
}

export function topContentByEngagement(
  dataset: Dataset,
  limit = 6,
  platform?: Platform,
): ContentItem[] {
  return [...windowContent(dataset, platform)]
    .sort((a, b) => engagementRateOf(b) - engagementRateOf(a))
    .slice(0, limit);
}

export interface PerformanceBucket {
  key: string;
  label: string;
  posts: number;
  avgViews: number;
  avgEngagement: number;
  totalShares: number;
}

function bucketize(items: ContentItem[], keyOf: (item: ContentItem) => string): PerformanceBucket[] {
  const groups = new Map<string, ContentItem[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].map(([key, group]) => ({
    key,
    label: key,
    posts: group.length,
    avgViews: sum(group.map((item) => item.views)) / group.length,
    avgEngagement: sum(group.map(engagementRateOf)) / group.length,
    totalShares: sum(group.map((item) => item.shares)),
  }));
}

const WEEKDAY_LABEL = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

function hourOf(iso: string): number {
  return Number(iso.slice(11, 13));
}

function weekdayOf(iso: string): number {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay();
}

export function performanceByHour(dataset: Dataset, platform?: Platform): PerformanceBucket[] {
  return bucketize(
    windowContent(dataset, platform),
    (item) => `${String(hourOf(item.publishedAt)).padStart(2, "0")}:00`,
  ).sort((a, b) => b.avgEngagement - a.avgEngagement);
}

export function performanceByWeekday(dataset: Dataset, platform?: Platform): PerformanceBucket[] {
  return bucketize(
    windowContent(dataset, platform),
    (item) => WEEKDAY_LABEL[weekdayOf(item.publishedAt)],
  ).sort((a, b) => b.avgEngagement - a.avgEngagement);
}

export function performanceByFormat(dataset: Dataset, platform?: Platform): PerformanceBucket[] {
  return bucketize(windowContent(dataset, platform), (item) => item.format).sort(
    (a, b) => b.avgEngagement - a.avgEngagement,
  );
}

export function performanceByTopic(dataset: Dataset, platform?: Platform): PerformanceBucket[] {
  return bucketize(windowContent(dataset, platform), (item) => item.topic).sort(
    (a, b) => b.avgEngagement - a.avgEngagement,
  );
}

/**
 * Bucket durasi konten.
 *
 * Batasnya dalam detik; `null` berarti tanpa batas atas. Rentangnya sengaja
 * disejajarkan dengan definisi Shorts agar hasilnya dapat dibaca langsung
 * sebagai "video pendek" vs "video panjang".
 */
const DURATION_BUCKETS: { key: string; label: string; maxSeconds: number | null }[] = [
  { key: "0-30", label: "≤ 30 detik", maxSeconds: 30 },
  { key: "31-60", label: "31–60 detik", maxSeconds: 60 },
  { key: "61-180", label: "1–3 menit", maxSeconds: 180 },
  { key: "181+", label: "> 3 menit", maxSeconds: null },
];

const DURATION_LABEL: Record<string, string> = Object.fromEntries(
  DURATION_BUCKETS.map((bucket) => [bucket.key, bucket.label]),
);

function durationBucketOf(seconds: number): string {
  for (const bucket of DURATION_BUCKETS) {
    if (bucket.maxSeconds === null || seconds <= bucket.maxSeconds) return bucket.key;
  }
  return DURATION_BUCKETS[DURATION_BUCKETS.length - 1].key;
}

/**
 * Performa konten per rentang durasi.
 *
 * Hanya konten yang durasinya benar-benar dilaporkan platform yang ikut
 * dihitung; `null` berarti durasi tidak diketahui dan tidak boleh diperlakukan
 * sebagai nol detik, karena itu akan memasukkan konten bergambar ke bucket
 * "≤ 30 detik" secara keliru. Berapa banyak yang tersisih dilaporkan
 * `durationCoverage`.
 */
export function performanceByDuration(
  dataset: Dataset,
  platform?: Platform,
): PerformanceBucket[] {
  const items = windowContent(dataset, platform).filter(
    (item) => item.durationSeconds !== null,
  );
  return bucketize(items, (item) => durationBucketOf(item.durationSeconds as number))
    .map((bucket) => ({ ...bucket, label: DURATION_LABEL[bucket.key] ?? bucket.key }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement);
}

export interface DurationCoverage {
  withDuration: number;
  withoutDuration: number;
  total: number;
}

/** Berapa banyak konten yang durasinya tersedia, agar angkanya dibaca dengan sadar. */
export function durationCoverage(dataset: Dataset, platform?: Platform): DurationCoverage {
  const items = windowContent(dataset, platform);
  const withDuration = items.filter((item) => item.durationSeconds !== null).length;
  return { withDuration, withoutDuration: items.length - withDuration, total: items.length };
}

/* ------------------------------------------------------------------ */
/* Kesehatan kanal (modul A)                                           */
/* ------------------------------------------------------------------ */

/** Selisih hari antara dua tanggal ISO (`b - a`). */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  );
}

export interface PostingConsistency {
  posts: number;
  /** Jumlah hari unik yang memiliki minimal satu unggahan. */
  activeDays: number;
  /** Rentang hari dari unggahan pertama sampai terakhir, inklusif. */
  spanDays: number;
  /** Rata-rata jeda antar-unggahan, dalam hari. */
  avgGapDays: number;
  /** Jeda terpanjang tanpa unggahan, dalam hari. */
  longestGapDays: number;
  /** Tanggal unggahan sebelum jeda terpanjang; `null` bila tidak ada jeda. */
  longestGapStart: string | null;
  /** Persentase hari dalam rentang konten yang memiliki unggahan, 0-100. */
  consistencyRate: number;
}

/**
 * Konsistensi posting, dihitung dari tanggal publikasi yang sebenarnya.
 *
 * Jeda diukur antar tanggal unggahan yang berbeda, bukan dari posisi baris di
 * dalam tabel, sehingga menyalin ulang dataset tidak mengubah hasilnya.
 */
export function postingConsistency(
  dataset: Dataset,
  platform?: Platform,
): PostingConsistency {
  const items = windowContent(dataset, platform);
  const dates = [...new Set(items.map((item) => item.publishedAt.slice(0, 10)))].sort();
  if (dates.length === 0) {
    return {
      posts: 0,
      activeDays: 0,
      spanDays: 0,
      avgGapDays: 0,
      longestGapDays: 0,
      longestGapStart: null,
      consistencyRate: 0,
    };
  }

  let longestGapDays = 0;
  let longestGapStart: string | null = null;
  for (let i = 1; i < dates.length; i += 1) {
    const gap = daysBetween(dates[i - 1], dates[i]);
    if (gap > longestGapDays) {
      longestGapDays = gap;
      longestGapStart = dates[i - 1];
    }
  }

  const spanDays = daysBetween(dates[0], dates[dates.length - 1]) + 1;
  return {
    posts: items.length,
    activeDays: dates.length,
    spanDays,
    avgGapDays: dates.length > 1 ? daysBetween(dates[0], dates[dates.length - 1]) / (dates.length - 1) : 0,
    longestGapDays,
    longestGapStart,
    consistencyRate: safeDiv(dates.length, spanDays) * 100,
  };
}

/** Bobot komponen skor kesehatan kanal. Jumlahnya 1. */
export const HEALTH_WEIGHTS = { growth: 0.4, consistency: 0.35, engagement: 0.25 } as const;

/** Rasio interaksi yang dianggap sehat; dipakai sebagai acuan skor komponen. */
export const HEALTH_ENGAGEMENT_BENCHMARK = 5;

/** Perubahan pengikut (%) yang memetakan skor komponen ke 0 atau 100. */
export const HEALTH_GROWTH_BOUND = 20;

export type HealthBand = "sangat-baik" | "baik" | "cukup" | "perlu-perhatian";

export const HEALTH_BAND_LABEL: Record<HealthBand, string> = {
  "sangat-baik": "Sangat baik",
  baik: "Baik",
  cukup: "Cukup",
  "perlu-perhatian": "Perlu perhatian",
};

export interface HealthComponent {
  key: "growth" | "consistency" | "engagement";
  label: string;
  /** Skor komponen 0-100; `null` bila datanya belum ada. */
  score: number | null;
  weight: number;
  detail: string;
}

export interface ChannelHealthScore {
  platform: Platform;
  /** Skor gabungan 0-100 dari komponen yang datanya tersedia. */
  score: number;
  band: HealthBand;
  components: HealthComponent[];
  /** Jumlah bobot yang benar-benar terpakai; 0 berarti belum ada data apa pun. */
  weightUsed: number;
}

function clampToScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function healthBand(score: number): HealthBand {
  if (score >= 80) return "sangat-baik";
  if (score >= 65) return "baik";
  if (score >= 50) return "cukup";
  return "perlu-perhatian";
}

/**
 * Skor kesehatan kanal: gabungan pertumbuhan, konsistensi, dan interaksi.
 *
 * Ketiga komponen dipetakan ke skala 0-100 lebih dulu, lalu dirata-ratakan
 * menurut bobotnya. Komponen yang datanya belum ada dikeluarkan dari
 * perhitungan — bobotnya tidak digantikan nilai netral, supaya kanal yang
 * datanya sedikit tidak tampak lebih sehat daripada kenyataannya. Metode ini
 * ditampilkan di UI lewat `components` agar angkanya dapat diperiksa.
 */
export function channelHealthScore(dataset: Dataset, platform: Platform): ChannelHealthScore {
  const window = trailingWindows(dataset.range.end, RANGE_DAYS).current;
  const hasMetrics = dataset.social.some(
    (row) => row.platform === platform && inWindow(row.date, window),
  );
  const aggregate = platformAggregates(dataset).find((row) => row.platform === platform);
  const consistency = postingConsistency(dataset, platform);

  const growthChange =
    aggregate && (aggregate.followersGained !== 0 || aggregate.followersGainedPrev !== 0)
      ? pctChange(aggregate.followersGained, aggregate.followersGainedPrev)
      : 0;
  const growthScore =
    aggregate && hasMetrics && (aggregate.followersGained !== 0 || aggregate.followersGainedPrev !== 0)
      ? clampToScore(50 + growthChange * (50 / HEALTH_GROWTH_BOUND))
      : null;

  const consistencyScore = consistency.posts === 0 ? null : consistency.consistencyRate;

  const engagementScore =
    aggregate && hasMetrics
      ? clampToScore(safeDiv(aggregate.engagementRate, HEALTH_ENGAGEMENT_BENCHMARK) * 100)
      : null;

  const components: HealthComponent[] = [
    {
      key: "growth",
      label: "Pertumbuhan pengikut",
      score: growthScore,
      weight: HEALTH_WEIGHTS.growth,
      detail: hasMetrics
        ? `Pengikut baru ${growthChange.toFixed(1)}% terhadap periode pembanding.`
        : "Belum ada metrik kanal yang tersinkron.",
    },
    {
      key: "consistency",
      label: "Konsistensi posting",
      score: consistencyScore,
      weight: HEALTH_WEIGHTS.consistency,
      detail:
        consistency.posts === 0
          ? "Belum ada konten pada periode ini."
          : `${consistency.activeDays} hari berisi unggahan dari ${consistency.spanDays} hari rentang konten.`,
    },
    {
      key: "engagement",
      label: "Rasio interaksi",
      score: engagementScore,
      weight: HEALTH_WEIGHTS.engagement,
      detail: hasMetrics && aggregate
        ? `Rasio interaksi ${aggregate.engagementRate.toFixed(2)}%; acuan sehat ${HEALTH_ENGAGEMENT_BENCHMARK}%.`
        : "Belum ada metrik kanal yang tersinkron.",
    },
  ];

  const available = components.filter((item) => item.score !== null);
  const weightUsed = available.reduce((total, item) => total + item.weight, 0);
  const score =
    weightUsed === 0
      ? 0
      : available.reduce((total, item) => total + (item.score as number) * item.weight, 0) / weightUsed;

  return { platform, score, band: healthBand(score), components, weightUsed };
}

/** Skor kesehatan seluruh kanal, terurut dari yang paling rendah. */
export function channelHealthScores(dataset: Dataset): ChannelHealthScore[] {
  return PLATFORMS.map((platform) => channelHealthScore(dataset, platform)).sort(
    (a, b) => a.score - b.score,
  );
}

/* ------------------------------------------------------------------ */
/* Demografi audiens (modul B)                                         */
/* ------------------------------------------------------------------ */

export const AUDIENCE_DIMENSION_LABEL: Record<AudienceDimension, string> = {
  age: "Kelompok usia",
  gender: "Jenis kelamin",
  country: "Negara",
  city: "Kota",
};

export interface AudienceBucket {
  bucket: string;
  value: number;
  share: number;
}

export interface AudienceDimensionSummary {
  dimension: AudienceDimension;
  label: string;
  total: number;
  buckets: AudienceBucket[];
  sourceKind: DataProvenance;
}

export interface AudienceSummary {
  /** Akun yang dianalisis; `null` berarti seluruh akun yang datanya tersedia. */
  accountId: string | null;
  /** `false` berarti tidak ada satu pun dimensi yang tersedia dari API. */
  available: boolean;
  dimensions: AudienceDimensionSummary[];
}

/**
 * Baris demografi yang boleh ikut dihitung.
 *
 * Demografi hasil API disimpan pada periode `lifetime`, sedangkan data
 * ilustratif disimpan pada periode contoh — keduanya bisa hidup berdampingan
 * untuk akun yang sama. Menjumlahkannya akan menggandakan angka yang tampak
 * berasal dari satu sumber. Karena itu, untuk setiap pasangan akun dan dimensi,
 * baris `platform-api` menang: begitu ada demografi nyata, baris ilustratif pada
 * dimensi yang sama tidak lagi ditampilkan. Prioritasnya per dimensi, bukan per
 * akun, supaya dimensi yang belum pernah diambil API tetap menampilkan apa
 * adanya — dan itu dilaporkan sebagai `mixed` oleh `provenanceOf`.
 */
function audienceRowsFor(dataset: Dataset, accountId?: string): AudienceInsight[] {
  const rows = accountId
    ? dataset.audience.filter((row) => row.accountId === accountId)
    : dataset.audience;
  const apiKeys = new Set(
    rows
      .filter((row) => row.sourceKind === "platform-api")
      .map((row) => `${row.accountId}:${row.dimension}`),
  );
  return rows.filter(
    (row) => row.sourceKind === "platform-api" || !apiKeys.has(`${row.accountId}:${row.dimension}`),
  );
}

/**
 * Ringkasan demografi audiens dari data yang benar-benar dilaporkan platform.
 *
 * Bila `dataset.audience` kosong, hasilnya `available: false` dengan daftar
 * dimensi kosong — UI wajib menampilkan "belum tersedia" dan dilarang mengisi
 * angka apa pun, karena jam aktif audiens dan retensi tidak disediakan API
 * untuk semua platform.
 */
export function audienceSummary(dataset: Dataset, accountId?: string): AudienceSummary {
  const rows = audienceRowsFor(dataset, accountId);

  const dimensions = (Object.keys(AUDIENCE_DIMENSION_LABEL) as AudienceDimension[])
    .map((dimension) => {
      const group = rows.filter((row) => row.dimension === dimension);
      const total = sum(group.map((row) => row.value));
      return {
        dimension,
        label: AUDIENCE_DIMENSION_LABEL[dimension],
        total,
        buckets: group
          .map((row) => ({
            bucket: row.bucket,
            value: row.value,
            share: safeDiv(row.value, total) * 100,
          }))
          .sort((a, b) => b.value - a.value),
        sourceKind: provenanceOf(group),
      };
    })
    .filter((item) => item.buckets.length > 0);

  return { accountId: accountId ?? null, available: dimensions.length > 0, dimensions };
}

/* ------------------------------------------------------------------ */
/* Analisis komentar                                                   */
/* ------------------------------------------------------------------ */

export const INTENT_LABEL: Record<CommentIntent, string> = {
  question: "Pertanyaan",
  complaint: "Keluhan",
  praise: "Apresiasi",
  idea: "Usulan",
  other: "Lainnya",
};

export const SENTIMENT_LABEL: Record<Sentiment, string> = {
  positive: "Positif",
  neutral: "Netral",
  negative: "Negatif",
};

export interface CommentAnalysis {
  total: number;
  sentiments: { key: Sentiment; count: number; share: number }[];
  intents: { key: CommentIntent; label: string; count: number }[];
  topics: { topic: string; count: number; share: number; sentimentScore: number }[];
  sentimentTrend: {
    label: string;
    positive: number;
    neutral: number;
    negative: number;
    total: number;
  }[];
  unanswered: CommentItem[];
  complaints: CommentItem[];
  positiveShare: number;
  negativeShare: number;
  positiveSharePrev: number;
  negativeSharePrev: number;
}

function sentimentShares(items: CommentItem[]) {
  const positive = items.filter((item) => item.sentiment === "positive").length;
  const negative = items.filter((item) => item.sentiment === "negative").length;
  return {
    positiveShare: safeDiv(positive, items.length) * 100,
    negativeShare: safeDiv(negative, items.length) * 100,
  };
}

export function commentAnalysis(dataset: Dataset): CommentAnalysis {
  const { current, previous } = trailingWindows(dataset.range.end, RANGE_DAYS);
  const createdOn = (item: CommentItem) => item.createdAt.slice(0, 10);
  const items = dataset.comments.filter((item) => inWindow(createdOn(item), current));
  const prevItems = dataset.comments.filter((item) => inWindow(createdOn(item), previous));

  const sentiments = (["positive", "neutral", "negative"] as Sentiment[]).map((key) => {
    const count = items.filter((item) => item.sentiment === key).length;
    return { key, count, share: safeDiv(count, items.length) * 100 };
  });

  const intents = (Object.keys(INTENT_LABEL) as CommentIntent[]).map((key) => ({
    key,
    label: INTENT_LABEL[key],
    count: items.filter((item) => item.intent === key).length,
  }));

  const topicNames = [...new Set(items.map((item) => item.topic))];
  const topics = topicNames
    .map((topic) => {
      const group = items.filter((item) => item.topic === topic);
      const positive = group.filter((item) => item.sentiment === "positive").length;
      const negative = group.filter((item) => item.sentiment === "negative").length;
      return {
        topic,
        count: group.length,
        share: safeDiv(group.length, items.length) * 100,
        sentimentScore: safeDiv(positive - negative, group.length) * 100,
      };
    })
    .sort((a, b) => b.count - a.count);

  const buckets = [3, 2, 1, 0].map((weeksAgo) => {
    const windowEnd = shiftDate(dataset.range.end, -weeksAgo * WINDOW);
    const windowStart = shiftDate(windowEnd, -(WINDOW - 1));
    const group = dataset.comments.filter((item) => {
      const date = item.createdAt.slice(0, 10);
      return date >= windowStart && date <= windowEnd;
    });
    const label = weeksAgo === 0 ? "Minggu ini" : `Minggu −${weeksAgo}`;
    return {
      label,
      positive: group.filter((item) => item.sentiment === "positive").length,
      neutral: group.filter((item) => item.sentiment === "neutral").length,
      negative: group.filter((item) => item.sentiment === "negative").length,
      total: group.length,
    };
  });

  const shares = sentimentShares(items);
  const sharesPrev = sentimentShares(prevItems);

  return {
    total: items.length,
    sentiments,
    intents,
    topics,
    sentimentTrend: buckets,
    unanswered: items
      .filter((item) => item.intent === "question")
      .sort((a, b) => b.likes - a.likes)
      .slice(0, 6),
    complaints: items
      .filter((item) => item.intent === "complaint")
      .sort((a, b) => b.likes - a.likes)
      .slice(0, 6),
    positiveShare: shares.positiveShare,
    negativeShare: shares.negativeShare,
    positiveSharePrev: sharesPrev.positiveShare,
    negativeSharePrev: sharesPrev.negativeShare,
  };
}

/* ------------------------------------------------------------------ */
/* Website                                                             */
/* ------------------------------------------------------------------ */

export interface WebTotals {
  sessions: number;
  sessionsPrev: number;
  users: number;
  newUsers: number;
  pageViews: number;
  bounceRate: number;
  avgSessionSeconds: number;
  conversions: number;
  conversionsPrev: number;
  conversionRate: number;
  conversionRatePrev: number;
}

/**
 * Total metrik website pada `days` hari terakhir beserta jendela pembandingnya.
 *
 * Jendelanya ditetapkan lewat tanggal, jadi jumlah baris yang tersimpan di D1
 * tidak ikut menentukan periode yang dihitung.
 */
export function webTotals(dataset: Dataset, days = RANGE_DAYS): WebTotals {
  const { current, previous } = trailingWindows(dataset.range.end, days);
  const rows = dataset.web.filter((row) => inWindow(row.date, current));
  const prevRows = dataset.web.filter((row) => inWindow(row.date, previous));
  const conversions = sum(rows.map((row) => row.conversions));
  const conversionsPrev = sum(prevRows.map((row) => row.conversions));
  const sessions = sum(rows.map((row) => row.sessions));
  const sessionsPrev = sum(prevRows.map((row) => row.sessions));
  return {
    sessions,
    sessionsPrev,
    users: sum(rows.map((row) => row.users)),
    newUsers: sum(rows.map((row) => row.newUsers)),
    pageViews: sum(rows.map((row) => row.pageViews)),
    bounceRate: safeDiv(
      sum(rows.map((row) => row.bounceRate)),
      rows.length,
    ),
    avgSessionSeconds: safeDiv(
      sum(rows.map((row) => row.avgSessionSeconds)),
      rows.length,
    ),
    conversions,
    conversionsPrev,
    conversionRate: safeDiv(conversions, sessions) * 100,
    conversionRatePrev: safeDiv(conversionsPrev, sessionsPrev) * 100,
  };
}

export interface FunnelStep {
  key: string;
  label: string;
  value: number;
  /** Rasio terhadap langkah sebelumnya, dalam persen. */
  stepRate: number | null;
  /** Rasio terhadap langkah pertama, dalam persen. */
  totalRate: number;
}

/**
 * Corong lintas kanal: dari tayangan sosial sampai konversi website.
 * Setiap langkah hanya masuk akal bila dibaca sebagai penyempitan, bukan
 * atribusi transaksi bisnis.
 */
export function conversionFunnel(dataset: Dataset): FunnelStep[] {
  const platformTotals = platformAggregates(dataset);
  const views = sum(platformTotals.map((row) => row.views));
  const profileVisits = sum(platformTotals.map((row) => row.profileVisits));
  const linkClicks = sum(platformTotals.map((row) => row.linkClicks));
  const socialSessions = sum(
    dataset.sources.filter((row) => row.channel === "social").map((row) => row.sessions),
  );
  const totals = webTotals(dataset);

  const raw = [
    { key: "views", label: "Tayangan konten sosial", value: views },
    { key: "profile", label: "Kunjungan profil", value: profileVisits },
    { key: "clicks", label: "Klik tautan keluar", value: linkClicks },
    { key: "sessions", label: "Sesi website dari sosial", value: socialSessions },
    { key: "conversions", label: "Konversi website", value: totals.conversions },
  ];
  const first = raw[0].value;
  return raw.map((step, index) => ({
    ...step,
    stepRate: index === 0 ? null : safeDiv(step.value, raw[index - 1].value) * 100,
    totalRate: safeDiv(step.value, first) * 100,
  }));
}

/* ------------------------------------------------------------------ */
/* Ekspor dataset lengkap untuk API                                    */
/* ------------------------------------------------------------------ */

export function periodLabel(dataset: Dataset): string {
  return `${dataset.range.days} hari terakhir`;
}

export { RANGE_DAYS, RANGE_TOTAL, WINDOW };
