import { getDataset, RANGE_DAYS, RANGE_TOTAL, WINDOW } from "./data";
import type {
  CommentIntent,
  CommentItem,
  ContentItem,
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

/** Jumlahkan `size` nilai terakhir, dengan `offset` elemen dilewati dari akhir. */
export function windowSum(values: number[], size: number, offset = 0): number {
  const end = values.length - offset;
  const start = Math.max(0, end - size);
  return sum(values.slice(start, end));
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

function aggregatePlatform(
  dataset: Dataset,
  platform: Platform,
  size: number,
  offset: number,
): ReturnType<typeof emptyMetric> {
  const rows = dataset.social.filter((row) => row.platform === platform);
  const total = emptyMetric();
  const slice = rows.slice(Math.max(0, rows.length - offset - size), rows.length - offset);
  for (const row of slice) {
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
  dataset: Dataset = getDataset(),
  size = RANGE_DAYS,
): PlatformAggregate[] {
  return PLATFORMS.map((platform) => {
    const now = aggregatePlatform(dataset, platform, size, 0);
    const prev = aggregatePlatform(dataset, platform, size, size);
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

export function kpiSummary(dataset: Dataset = getDataset()): KpiSummary {
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

  const sessions = windowSum(
    dataset.web.map((row) => row.sessions),
    RANGE_DAYS,
  );
  const sessionsPrev = windowSum(
    dataset.web.map((row) => row.sessions),
    RANGE_DAYS,
    RANGE_DAYS,
  );
  const conversions = windowSum(
    dataset.web.map((row) => row.conversions),
    RANGE_DAYS,
  );
  const conversionsPrev = windowSum(
    dataset.web.map((row) => row.conversions),
    RANGE_DAYS,
    RANGE_DAYS,
  );

  const followersNow = sum(dataset.accounts.map((account) => account.followers));

  return {
    totalViews: totals.views,
    totalViewsPrev: totals.viewsPrev,
    engagementRate: safeDiv(totals.interactions, totals.views) * 100,
    engagementRatePrev: safeDiv(totals.interactionsPrev, totals.viewsPrev) * 100,
    followers: followersNow,
    followersPrev: followersNow - totals.followersGained,
    sessions,
    sessionsPrev,
    conversions,
    conversionsPrev,
    linkClicks: totals.linkClicks,
    linkClicksPrev: totals.linkClicksPrev,
  };
}

/* ------------------------------------------------------------------ */
/* Deret waktu                                                         */
/* ------------------------------------------------------------------ */

export function trendPoints(dataset: Dataset = getDataset(), size = RANGE_DAYS): TrendPoint[] {
  const dates = dataset.social
    .filter((row) => row.platform === "instagram")
    .map((row) => row.date)
    .slice(-size);
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

export function windowContent(dataset: Dataset = getDataset()): ContentItem[] {
  const start = dataset.range.start;
  return dataset.content.filter((item) => item.publishedAt.slice(0, 10) >= start);
}

export function topContent(
  dataset: Dataset = getDataset(),
  limit = 6,
): ContentItem[] {
  return [...windowContent(dataset)]
    .sort((a, b) => b.views - a.views)
    .slice(0, limit);
}

export function topContentByEngagement(
  dataset: Dataset = getDataset(),
  limit = 6,
): ContentItem[] {
  return [...windowContent(dataset)]
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

export function performanceByHour(dataset: Dataset = getDataset()): PerformanceBucket[] {
  return bucketize(
    windowContent(dataset),
    (item) => `${String(hourOf(item.publishedAt)).padStart(2, "0")}:00`,
  ).sort((a, b) => b.avgEngagement - a.avgEngagement);
}

export function performanceByWeekday(dataset: Dataset = getDataset()): PerformanceBucket[] {
  return bucketize(windowContent(dataset), (item) => WEEKDAY_LABEL[weekdayOf(item.publishedAt)]).sort(
    (a, b) => b.avgEngagement - a.avgEngagement,
  );
}

export function performanceByFormat(dataset: Dataset = getDataset()): PerformanceBucket[] {
  return bucketize(windowContent(dataset), (item) => item.format).sort(
    (a, b) => b.avgEngagement - a.avgEngagement,
  );
}

export function performanceByTopic(dataset: Dataset = getDataset()): PerformanceBucket[] {
  return bucketize(windowContent(dataset), (item) => item.topic).sort(
    (a, b) => b.avgEngagement - a.avgEngagement,
  );
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

export function commentAnalysis(dataset: Dataset = getDataset()): CommentAnalysis {
  const items = dataset.comments.filter(
    (item) => item.createdAt.slice(0, 10) >= dataset.range.start,
  );
  const prevStart = dataset.social[dataset.social.length - RANGE_DAYS * 2]?.date ?? dataset.history.start;
  const prevItems = dataset.comments.filter(
    (item) =>
      item.createdAt.slice(0, 10) >= prevStart &&
      item.createdAt.slice(0, 10) < dataset.range.start,
  );

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
    const end = dataset.social.length - weeksAgo * WINDOW;
    const start = end - WINDOW;
    const dates = dataset.social
      .slice(start, end)
      .map((row) => row.date)
      .filter((date, index, list) => list.indexOf(date) === index);
    const group = dataset.comments.filter((item) => dates.includes(item.createdAt.slice(0, 10)));
    const label =
      weeksAgo === 0 ? "Minggu ini" : `Minggu −${weeksAgo}`;
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

export function webTotals(dataset: Dataset = getDataset()): WebTotals {
  const rows = dataset.web.slice(-RANGE_DAYS);
  const prevRows = dataset.web.slice(-RANGE_DAYS * 2, -RANGE_DAYS);
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
export function conversionFunnel(dataset: Dataset = getDataset()): FunnelStep[] {
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

export function periodLabel(dataset: Dataset = getDataset()): string {
  return `${dataset.range.days} hari terakhir`;
}

export { RANGE_DAYS, RANGE_TOTAL, WINDOW };
