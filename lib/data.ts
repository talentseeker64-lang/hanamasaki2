import type {
  ChannelAccount,
  CommentIntent,
  CommentItem,
  ContentFormat,
  ContentItem,
  DailySocialMetric,
  DailyWebMetric,
  Dataset,
  LandingPage,
  Platform,
  SearchMetric,
  Sentiment,
  TrafficChannel,
  TrafficSource,
} from "./types";

export const RANGE_END = "2026-10-26";
/** Jendela tampilan. */
export const RANGE_DAYS = 30;
/** Total hari yang dibangkitkan agar ada jendela pembanding setara. */
export const RANGE_TOTAL = RANGE_DAYS * 2;
export const WINDOW = 7;

const MS_PER_DAY = 86_400_000;
const PLATFORMS: Platform[] = ["instagram", "tiktok", "youtube", "facebook"];

/* ------------------------------------------------------------------ */
/* Utilitas deterministik                                              */
/* ------------------------------------------------------------------ */

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Angka pseudo-acak deterministik pada rentang 0..1 berdasarkan kunci. */
function random(key: string): number {
  const h = fnv1a(key);
  let t = (h + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Pengali deterministik di sekitar 1 untuk memberi variasi harian. */
function jitter(key: string, spread: number): number {
  return 1 + (random(key) - 0.5) * 2 * spread;
}

function pick<T>(items: readonly T[], key: string): T {
  return items[Math.floor(random(key) * items.length) % items.length];
}

function buildDates(): string[] {
  const end = Date.parse(`${RANGE_END}T00:00:00Z`);
  const dates: string[] = [];
  for (let i = RANGE_TOTAL - 1; i >= 0; i -= 1) {
    dates.push(new Date(end - i * MS_PER_DAY).toISOString().slice(0, 10));
  }
  return dates;
}

function weekdayIndex(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

const WEEKDAY_SOCIAL = [1.06, 0.94, 0.97, 1.0, 1.01, 1.03, 1.05];
const WEEKDAY_WEB = [0.86, 1.09, 1.12, 1.1, 1.07, 1.02, 0.9];

/** Rasio penurunan bertahap pada `WINDOW` hari terakhir (1 → floor). */
function trailingRamp(dayIndex: number, floor: number): number {
  const start = RANGE_TOTAL - WINDOW;
  if (dayIndex < start) return 1;
  const step = (dayIndex - start + 1) / WINDOW;
  return 1 - (1 - floor) * step;
}

/** Progres kemiringan pada `WINDOW` hari terakhir: 0 → 1. */
function trailingProgress(dayIndex: number): number {
  return 1 - trailingRamp(dayIndex, 0);
}

/* ------------------------------------------------------------------ */
/* Profil kanal sosial                                                 */
/* ------------------------------------------------------------------ */

interface SocialProfile {
  viewsBase: number;
  dailyGrowth: number;
  likeRate: number;
  commentRate: number;
  shareRate: number;
  saveRate: number;
  followRate: number;
  profileVisitRate: number;
  /** Click-through rate tautan keluar: awal periode → akhir periode. */
  ctrStart: number;
  ctrEnd: number;
  reachRatio: number;
  impressionRatio: number;
}

const SOCIAL_PROFILES: Record<Platform, SocialProfile> = {
  instagram: {
    viewsBase: 14_000,
    dailyGrowth: 0.012,
    likeRate: 0.052,
    commentRate: 0.0021,
    shareRate: 0.0044,
    saveRate: 0.0068,
    followRate: 0.00042,
    profileVisitRate: 0.058,
    ctrStart: 0.014,
    ctrEnd: 0.009,
    reachRatio: 0.78,
    impressionRatio: 1.18,
  },
  tiktok: {
    viewsBase: 19_000,
    dailyGrowth: 0.016,
    likeRate: 0.071,
    commentRate: 0.0014,
    shareRate: 0.0075,
    saveRate: 0.0052,
    followRate: 0.00051,
    profileVisitRate: 0.041,
    ctrStart: 0.0032,
    ctrEnd: 0.003,
    reachRatio: 0.71,
    impressionRatio: 1.24,
  },
  youtube: {
    viewsBase: 8_000,
    dailyGrowth: 0.006,
    likeRate: 0.041,
    commentRate: 0.0018,
    shareRate: 0.0022,
    saveRate: 0.0031,
    followRate: 0.00062,
    profileVisitRate: 0.026,
    ctrStart: 0.0042,
    ctrEnd: 0.004,
    reachRatio: 0.83,
    impressionRatio: 1.06,
  },
  facebook: {
    viewsBase: 5_200,
    dailyGrowth: 0.002,
    likeRate: 0.028,
    commentRate: 0.0009,
    shareRate: 0.0038,
    saveRate: 0.0012,
    followRate: 0.00021,
    profileVisitRate: 0.018,
    ctrStart: 0.0026,
    ctrEnd: 0.0022,
    reachRatio: 0.74,
    impressionRatio: 1.31,
  },
};

function linkCtr(profile: SocialProfile, dayIndex: number): number {
  return (
    profile.ctrStart + (profile.ctrEnd - profile.ctrStart) * trailingProgress(dayIndex)
  );
}

function buildSocial(dates: string[]): DailySocialMetric[] {
  const rows: DailySocialMetric[] = [];
  for (const platform of PLATFORMS) {
    const profile = SOCIAL_PROFILES[platform];
    dates.forEach((date, dayIndex) => {
      const key = `${platform}:${date}`;
      const views = Math.round(
        profile.viewsBase *
          (1 + profile.dailyGrowth * dayIndex) *
          WEEKDAY_SOCIAL[weekdayIndex(date)] *
          jitter(`${key}:views`, 0.09),
      );
      rows.push({
        date,
        platform,
        views,
        reach: Math.round(views * profile.reachRatio * jitter(`${key}:reach`, 0.04)),
        impressions: Math.round(views * profile.impressionRatio * jitter(`${key}:imp`, 0.05)),
        likes: Math.round(views * profile.likeRate * jitter(`${key}:like`, 0.07)),
        comments: Math.round(views * profile.commentRate * jitter(`${key}:cmt`, 0.12)),
        shares: Math.round(views * profile.shareRate * jitter(`${key}:share`, 0.1)),
        saves: Math.round(views * profile.saveRate * jitter(`${key}:save`, 0.1)),
        followersGained: Math.round(views * profile.followRate * jitter(`${key}:follow`, 0.15)),
        profileVisits: Math.round(
          views * profile.profileVisitRate * jitter(`${key}:profile`, 0.08),
        ),
        linkClicks: Math.round(views * linkCtr(profile, dayIndex) * jitter(`${key}:ctr`, 0.07)),
      });
    });
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Sumber trafik website                                               */
/* ------------------------------------------------------------------ */

interface DirectSourceProfile {
  source: string;
  channel: TrafficChannel;
  base: number;
  dailyGrowth: number;
  /** Pengali pada 7 hari terakhir. */
  trailingFloor: number;
  bounceRate: number;
  convIndex: number;
}

const DIRECT_SOURCES: DirectSourceProfile[] = [
  { source: "Google Organic", channel: "organic", base: 620, dailyGrowth: 0.003, trailingFloor: 0.62, bounceRate: 41.2, convIndex: 1.05 },
  { source: "Direct", channel: "direct", base: 205, dailyGrowth: 0.002, trailingFloor: 0.88, bounceRate: 36.5, convIndex: 1.15 },
  { source: "Referral", channel: "referral", base: 108, dailyGrowth: 0.001, trailingFloor: 0.9, bounceRate: 52.4, convIndex: 0.85 },
  { source: "Email", channel: "email", base: 42, dailyGrowth: 0.004, trailingFloor: 1, bounceRate: 28.7, convIndex: 1.8 },
  { source: "Paid Search", channel: "paid", base: 30, dailyGrowth: 0.001, trailingFloor: 1.05, bounceRate: 47.9, convIndex: 1.35 },
];

/** Rata-rata rasio sesi website yang dihasilkan dari satu klik tautan sosial. */
const SOCIAL_SESSION_RATE = 0.75;

function buildWeb(dates: string[], social: DailySocialMetric[]) {
  const byPlatform = new Map<string, number[]>();
  for (const platform of PLATFORMS) {
    byPlatform.set(
      platform,
      dates.map(() => 0),
    );
  }

  const socialSessions: number[] = dates.map(() => 0);
  for (const row of social) {
    const dayIndex = dates.indexOf(row.date);
    // Konversi klik → sesi website terjadi pada hari berikutnya.
    if (dayIndex + 1 < dates.length) {
      const sessions = row.linkClicks * SOCIAL_SESSION_RATE;
      socialSessions[dayIndex + 1] += sessions;
      byPlatform.get(row.platform)![dayIndex + 1] += sessions;
    }
  }

  const sourceDaily = new Map<string, number[]>(
    DIRECT_SOURCES.map((profile) => [profile.source, dates.map(() => 0)]),
  );
  DIRECT_SOURCES.forEach((profile) => {
    dates.forEach((date, dayIndex) => {
      const key = `${profile.source}:${date}`;
      sourceDaily.get(profile.source)![dayIndex] =
        profile.base *
        (1 + profile.dailyGrowth * dayIndex) *
        WEEKDAY_WEB[weekdayIndex(date)] *
        trailingRamp(dayIndex, profile.trailingFloor) *
        jitter(key, 0.11);
    });
  });

  const web: DailyWebMetric[] = dates.map((date, dayIndex) => {
    const direct = DIRECT_SOURCES.reduce(
      (sum, profile) => sum + sourceDaily.get(profile.source)![dayIndex],
      0,
    );
    const sessions = Math.round(direct + socialSessions[dayIndex]);
    const convRate = 0.031 * trailingRamp(dayIndex, 0.822);
    const users = Math.round(sessions * 0.86 * jitter(`users:${date}`, 0.04));
    return {
      date,
      sessions,
      users,
      newUsers: Math.round(users * 0.63 * jitter(`newUsers:${date}`, 0.05)),
      pageViews: Math.round(sessions * 2.74 * jitter(`pageViews:${date}`, 0.05)),
      bounceRate: 44.8 - dayIndex * 0.05 + (random(`bounce:${date}`) - 0.5) * 3,
      avgSessionSeconds: Math.round(148 + dayIndex * 0.9 + (random(`dur:${date}`) - 0.5) * 22),
      conversions: Math.round(sessions * convRate * jitter(`conv:${date}`, 0.09)),
    };
  });

  const sources: TrafficSource[] = [
    ...PLATFORMS.map((platform) => {
      const series = byPlatform.get(platform)!;
      const sessions = Math.round(sumWindow(series, RANGE_DAYS));
      const sessionsPrev = Math.round(sumWindow(series, RANGE_DAYS, RANGE_DAYS));
      const convRate = 0.031 * 0.9;
      return {
        source: platformLabel(platform),
        channel: "social" as TrafficChannel,
        platform,
        sessions,
        sessionsPrev,
        conversions: Math.round(sessions * convRate),
        conversionsPrev: Math.round(sessionsPrev * convRate),
        bounceRate: Math.round((58 - SOCIAL_PROFILES[platform].ctrStart * 900) * 10) / 10,
      };
    }),
    ...DIRECT_SOURCES.map((profile) => {
      const series = sourceDaily.get(profile.source)!;
      const sessions = Math.round(sumWindow(series, RANGE_DAYS));
      const sessionsPrev = Math.round(sumWindow(series, RANGE_DAYS, RANGE_DAYS));
      const convRate = (0.031 * profile.convIndex * 0.9) / 1.05;
      return {
        source: profile.source,
        channel: profile.channel,
        platform: null,
        sessions,
        sessionsPrev,
        conversions: Math.round(sessions * convRate),
        conversionsPrev: Math.round(sessionsPrev * convRate),
        bounceRate: profile.bounceRate,
      };
    }),
  ].sort((a, b) => b.sessions - a.sessions);

  return { web, sources };
}

function sumWindow(values: number[], size: number, offset = 0): number {
  const end = values.length - offset;
  const start = Math.max(0, end - size);
  let total = 0;
  for (let i = start; i < end; i += 1) total += values[i];
  return total;
}

function platformLabel(platform: Platform): string {
  switch (platform) {
    case "instagram":
      return "Instagram";
    case "tiktok":
      return "TikTok";
    case "youtube":
      return "YouTube";
    case "facebook":
      return "Facebook";
  }
}

/* ------------------------------------------------------------------ */
/* Halaman landing                                                     */
/* ------------------------------------------------------------------ */

interface PageProfile {
  path: string;
  title: string;
  share: number;
  convWeight: number;
  convWeightPrev: number;
  avgSeconds: number;
  exitRate: number;
}

const PAGE_PROFILES: PageProfile[] = [
  { path: "/", title: "Beranda", share: 0.34, convWeight: 0.1, convWeightPrev: 0.09, avgSeconds: 96, exitRate: 38.4 },
  { path: "/produk/katalog", title: "Katalog Produk", share: 0.22, convWeight: 0.24, convWeightPrev: 0.22, avgSeconds: 214, exitRate: 27.1 },
  { path: "/promo-oktober", title: "Promo Oktober", share: 0.14, convWeight: 0.22, convWeightPrev: 0.34, avgSeconds: 132, exitRate: 44.6 },
  { path: "/blog/cara-memilih", title: "Artikel: Cara Memilih", share: 0.11, convWeight: 0.06, convWeightPrev: 0.05, avgSeconds: 268, exitRate: 51.2 },
  { path: "/produk/detail", title: "Detail Produk", share: 0.09, convWeight: 0.27, convWeightPrev: 0.26, avgSeconds: 236, exitRate: 19.8 },
  { path: "/tentang", title: "Tentang Kami", share: 0.05, convWeight: 0.02, convWeightPrev: 0.02, avgSeconds: 74, exitRate: 58.3 },
  { path: "/kontak", title: "Kontak", share: 0.03, convWeight: 0.04, convWeightPrev: 0.01, avgSeconds: 88, exitRate: 46.7 },
  { path: "/checkout", title: "Checkout", share: 0.02, convWeight: 0.05, convWeightPrev: 0.01, avgSeconds: 164, exitRate: 12.4 },
];

function buildPages(web: DailyWebMetric[]): LandingPage[] {
  const pageViewSeries = web.map((row) => row.pageViews);
  const convSeries = web.map((row) => row.conversions);
  const views30 = sumWindow(pageViewSeries, RANGE_DAYS);
  const views30Prev = sumWindow(pageViewSeries, RANGE_DAYS, RANGE_DAYS);
  const conv30 = sumWindow(convSeries, RANGE_DAYS);
  const conv30Prev = sumWindow(convSeries, RANGE_DAYS, RANGE_DAYS);
  const conv7 = sumWindow(convSeries, WINDOW);
  const conv7Prev = sumWindow(convSeries, WINDOW, WINDOW);

  return PAGE_PROFILES.map((profile) => ({
    path: profile.path,
    title: profile.title,
    views30: Math.round(views30 * profile.share),
    views30Prev: Math.round(views30Prev * profile.share),
    conversions30: Math.round(conv30 * profile.convWeight),
    conversions30Prev: Math.round(conv30Prev * profile.convWeightPrev),
    conversions7: Math.round(conv7 * profile.convWeight),
    conversions7Prev: Math.round(conv7Prev * profile.convWeightPrev),
    avgSeconds: profile.avgSeconds,
    exitRate: profile.exitRate,
  })).sort((a, b) => b.views30 - a.views30);
}

/* ------------------------------------------------------------------ */
/* Google Search Console                                               */
/* ------------------------------------------------------------------ */

interface SearchProfile {
  query: string;
  impressions: number;
  position: number;
  positionPrev: number;
}

const SEARCH_PROFILES: SearchProfile[] = [
  { query: "hanamasak harga", impressions: 18_400, position: 2.4, positionPrev: 2.1 },
  { query: "hanamasak official store", impressions: 12_900, position: 1.6, positionPrev: 1.5 },
  { query: "promo hanamasak oktober", impressions: 9_800, position: 6.9, positionPrev: 3.4 },
  { query: "cara memilih hanamasak", impressions: 8_200, position: 7.8, positionPrev: 3.2 },
  { query: "hanamasak vs kompetitor", impressions: 6_400, position: 5.1, positionPrev: 5.4 },
  { query: "review hanamasak", impressions: 5_600, position: 4.2, positionPrev: 4.6 },
  { query: "hanamasak murah", impressions: 4_900, position: 8.1, positionPrev: 7.4 },
  { query: "reseller hanamasak", impressions: 3_700, position: 3.3, positionPrev: 3.9 },
  { query: "hanamasak terbaru", impressions: 3_100, position: 6.2, positionPrev: 5.8 },
  { query: "kirim ke seluruh indonesia", impressions: 2_400, position: 9.4, positionPrev: 9.8 },
];

function ctrFromPosition(position: number): number {
  // Kurva CTR kasar: peringkat 1 ≈ 28%, menurun tajam setelah posisi 3.
  return 0.3 * Math.exp(-0.32 * (position - 1)) + 0.006;
}

function buildSearch(): SearchMetric[] {
  return SEARCH_PROFILES.map((profile) => {
    const ctr = ctrFromPosition(profile.position);
    const ctrPrev = ctrFromPosition(profile.positionPrev);
    return {
      query: profile.query,
      impressions: profile.impressions,
      clicks: Math.round(profile.impressions * ctr),
      clicksPrev: Math.round(profile.impressions * ctrPrev),
      ctr: Math.round(ctr * 1000) / 10,
      position: profile.position,
      positionPrev: profile.positionPrev,
    };
  }).sort((a, b) => b.clicks - a.clicks);
}

/* ------------------------------------------------------------------ */
/* Konten                                                              */
/* ------------------------------------------------------------------ */

const TITLE_POOL: Record<string, string[]> = {
  "Tips Produk": [
    "3 tanda produk ini cocok untuk kamu",
    "Cara pakai yang benar biar hasilnya maksimal",
    "Kesalahan umum saat memilih ukuran",
  ],
  "Review Pelanggan": [
    "Kata pembeli setelah 30 hari pemakaian",
    "Unboxing + first impression dari pelanggan",
    "Testimoni jujur: worth it atau tidak?",
  ],
  "Behind The Scenes": [
    "Proses packing pesanan hari ini",
    "Sehari di studio kami",
    "Tim kami sedang menyiapkan koleksi baru",
  ],
  Tutorial: [
    "Tutorial lengkap dalam 60 detik",
    "Langkah demi langkah untuk pemula",
    "Setup cepat hanya 3 langkah",
  ],
  Edukasi: [
    "Kenapa bahan ini lebih tahan lama",
    "Beda varian A dan B, mana yang cocok?",
    "Hal yang jarang dibahas soal kategori ini",
  ],
  Promo: [
    "Promo terbatas minggu ini",
    "Bundle paling laris, stok terbatas",
    "Diskon khusus pengikut baru",
  ],
  "Q&A": [
    "Jawab pertanyaan paling sering ditanya",
    "Tanya jawab seputar pengiriman",
    "Mitos vs fakta tentang produk kami",
  ],
  "Trend Audio": [
    "Ikut tren audio yang sedang naik",
    "Format cepat yang sedang ramai",
    "Versi kami untuk tren minggu ini",
  ],
  Kolaborasi: [
    "Kolaborasi dengan kreator lokal",
    "Sesi bareng komunitas pengguna",
    "Takeover akun oleh tim gudang",
  ],
};

const TOPIC_WEIGHT: Record<string, number> = {
  "Review Pelanggan": 1.42,
  "Tips Produk": 1.24,
  "Trend Audio": 1.2,
  Kolaborasi: 1.12,
  "Behind The Scenes": 1.06,
  Tutorial: 1.0,
  Promo: 0.96,
  Edukasi: 0.9,
  "Q&A": 0.84,
};

const FORMAT_WEIGHT: Record<ContentFormat, number> = {
  shorts: 1.45,
  reels: 1.35,
  video: 1.0,
  carousel: 0.72,
  post: 0.55,
  story: 0.35,
};

const FORMATS_BY_PLATFORM: Record<Platform, ContentFormat[]> = {
  instagram: ["reels", "reels", "reels", "carousel", "carousel", "story"],
  tiktok: ["shorts", "shorts", "shorts", "video"],
  youtube: ["video", "video", "video", "shorts", "shorts"],
  facebook: ["post", "post", "video", "reels"],
};

const PUBLISH_HOURS = ["07", "12", "13", "17", "19", "20", "21"];
const PUBLISH_PROBABILITY: Record<Platform, number> = {
  instagram: 0.45,
  tiktok: 0.42,
  youtube: 0.3,
  facebook: 0.34,
};

function buildContent(dates: string[], social: DailySocialMetric[]): ContentItem[] {
  const dailyViews = new Map<string, number>();
  for (const row of social) dailyViews.set(`${row.platform}:${row.date}`, row.views);

  const items: ContentItem[] = [];
  const topics = Object.keys(TITLE_POOL);

  dates.forEach((date, dayIndex) => {
    for (const platform of PLATFORMS) {
      const key = `${platform}:${date}:publish`;
      if (random(key) > PUBLISH_PROBABILITY[platform]) continue;
      const format = pick(FORMATS_BY_PLATFORM[platform], `${key}:format`);
      const topic = pick(topics, `${key}:topic`);
      const title = pick(TITLE_POOL[topic], `${key}:title`);
      const profile = SOCIAL_PROFILES[platform];
      const views = Math.round(
        dailyViews.get(`${platform}:${date}`)! *
          FORMAT_WEIGHT[format] *
          TOPIC_WEIGHT[topic] *
          jitter(`${key}:views`, 0.22) *
          0.55,
      );
      const hour = pick(PUBLISH_HOURS, `${key}:hour`);
      items.push({
        id: `${platform}-${date}-${hour}`,
        platform,
        title,
        format,
        topic,
        publishedAt: `${date}T${hour}:00:00+07:00`,
        views,
        likes: Math.round(views * profile.likeRate * jitter(`${key}:like`, 0.2)),
        comments: Math.round(views * profile.commentRate * jitter(`${key}:cmt`, 0.25)),
        shares: Math.round(views * profile.shareRate * jitter(`${key}:share`, 0.25)),
        saves: Math.round(views * profile.saveRate * jitter(`${key}:save`, 0.25)),
        linkClicks: Math.round(views * linkCtr(profile, dayIndex) * jitter(`${key}:ctr`, 0.2)),
      });
    }
  });

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/* ------------------------------------------------------------------ */
/* Komentar                                                            */
/* ------------------------------------------------------------------ */

interface CommentTemplate {
  text: string;
  sentiment: Sentiment;
  intent: CommentIntent;
  topic: string;
}

const COMMENT_TEMPLATES: CommentTemplate[] = [
  { text: "Ini yang aku cari dari kemarin, akhirnya ada penjelasannya", sentiment: "positive", intent: "praise", topic: "Tips Produk" },
  { text: "Baru tahu ternyata caranya beda, makasih infonya", sentiment: "positive", intent: "praise", topic: "Edukasi" },
  { text: "Format video pendeknya enak banget ditonton sampai habis", sentiment: "positive", intent: "praise", topic: "Trend Audio" },
  { text: "Sudah aku coba dan hasilnya sesuai yang dijelaskan", sentiment: "positive", intent: "praise", topic: "Tutorial" },
  { text: "Packing rapi, sampai rumah aman. Recommended", sentiment: "positive", intent: "praise", topic: "Review Pelanggan" },
  { text: "Testimoni jujurnya ngebantu banget buat yang masih ragu", sentiment: "positive", intent: "praise", topic: "Review Pelanggan" },
  { text: "Kontennya makin rapi, kelihatan banget prosesnya", sentiment: "positive", intent: "praise", topic: "Behind The Scenes" },
  { text: "Ide konten seperti ini yang ditunggu-tunggu", sentiment: "positive", intent: "idea", topic: "Kolaborasi" },
  { text: "Btw bisa bahas versi budget-nya juga?", sentiment: "neutral", intent: "question", topic: "Edukasi" },
  { text: "Stok varian B kapan tersedia lagi ya?", sentiment: "neutral", intent: "question", topic: "Promo" },
  { text: "Untuk luar kota estimasi pengirimannya berapa hari?", sentiment: "neutral", intent: "question", topic: "Q&A" },
  { text: "Link pembeliannya di mana ya? Belum ketemu", sentiment: "neutral", intent: "question", topic: "Promo" },
  { text: "Bisa dipakai untuk ukuran besar nggak?", sentiment: "neutral", intent: "question", topic: "Tips Produk" },
  { text: "Harga di video sama di website beda ya?", sentiment: "negative", intent: "complaint", topic: "Promo" },
  { text: "Sudah chat DM tapi belum dibalas sejak kemarin", sentiment: "negative", intent: "complaint", topic: "Q&A" },
  { text: "Pesanan saya belum dikirim padahal sudah bayar", sentiment: "negative", intent: "complaint", topic: "Review Pelanggan" },
  { text: "Tautan di bio error terus, jadi susah checkout", sentiment: "negative", intent: "complaint", topic: "Promo" },
  { text: "Kok videonya jadi cuma sepotong, penjelasan akhirnya hilang", sentiment: "negative", intent: "complaint", topic: "Tutorial" },
  { text: "Kontennya agak terlalu cepat, susah diikuti", sentiment: "negative", intent: "complaint", topic: "Tutorial" },
  { text: "Menarik, tunggu kelanjutannya", sentiment: "neutral", intent: "other", topic: "Edukasi" },
  { text: "Ikut nyimak dari awal sampai akhir", sentiment: "neutral", intent: "other", topic: "Behind The Scenes" },
  { text: "Boleh minta rekomendasi untuk pemula?", sentiment: "neutral", intent: "question", topic: "Tips Produk" },
  { text: "Ini membantu banget buat yang baru mulai", sentiment: "positive", intent: "praise", topic: "Pendampingan" },
  { text: "Mantap, lanjutkan seri seperti ini", sentiment: "positive", intent: "praise", topic: "Tips Produk" },
  { text: "Bisa dibuat versi lengkap di YouTube?", sentiment: "neutral", intent: "idea", topic: "Kolaborasi" },
  { text: "Warna favorit saya, semoga restock", sentiment: "positive", intent: "praise", topic: "Review Pelanggan" },
  { text: "Pengiriman cepat, dua hari sudah sampai", sentiment: "positive", intent: "praise", topic: "Review Pelanggan" },
  { text: "Konten behind the scenes-nya bikin lebih percaya", sentiment: "positive", intent: "praise", topic: "Behind The Scenes" },
  { text: "Kapan ada sesi tanya jawab langsung?", sentiment: "neutral", intent: "question", topic: "Q&A" },
  { text: "Diskonnya bisa digabung dengan voucher lain tidak?", sentiment: "neutral", intent: "question", topic: "Promo" },
  { text: "Sudah dua kali saya pesan, keduanya bagus", sentiment: "positive", intent: "praise", topic: "Review Pelanggan" },
  { text: "Audio trending ini cocok dengan brand kalian", sentiment: "positive", intent: "idea", topic: "Trend Audio" },
  { text: "Terima kasih infonya, saya baru tahu soal ini", sentiment: "positive", intent: "praise", topic: "Edukasi" },
  { text: "Bagian yang dijelaskan tadi masih agak bingung", sentiment: "neutral", intent: "question", topic: "Tutorial" },
  { text: "Adminnya balas cepat dan ramah, terima kasih", sentiment: "positive", intent: "praise", topic: "Pendampingan" },
  { text: "Semoga ada varian ukuran lain tahun depan", sentiment: "neutral", intent: "idea", topic: "Tips Produk" },
];

const COMMENT_AUTHORS = [
  "rani",
  "dwi",
  "bela",
  "arif",
  "tama",
  "yusuf",
  "nadia",
  "eka",
  "putri",
  "fajar",
  "sinta",
  "gilang",
  "mira",
  "adit",
  "lia",
  "rendi",
  "sari",
  "bima",
];

const PLATFORM_COMMENT_WEIGHT: Platform[] = [
  "instagram",
  "instagram",
  "instagram",
  "instagram",
  "tiktok",
  "tiktok",
  "tiktok",
  "youtube",
  "youtube",
  "facebook",
];

function buildComments(dates: string[]): CommentItem[] {
  const items: CommentItem[] = [];
  const total = 230;
  for (let i = 0; i < total; i += 1) {
    const key = `comment:${i}`;
    const template = COMMENT_TEMPLATES[Math.floor(random(`${key}:t`) * COMMENT_TEMPLATES.length)];
    const dayIndex =
      RANGE_TOTAL - 1 - Math.floor(Math.pow(random(`${key}:d`), 0.7) * RANGE_TOTAL);
    const date = dates[Math.max(0, Math.min(RANGE_TOTAL - 1, dayIndex))];
    const hour = String(6 + Math.floor(random(`${key}:h`) * 17)).padStart(2, "0");
    const minute = String(Math.floor(random(`${key}:m`) * 60)).padStart(2, "0");
    const author = pick(COMMENT_AUTHORS, `${key}:a`);
    items.push({
      id: `c-${i}`,
      platform: pick(PLATFORM_COMMENT_WEIGHT, `${key}:p`),
      topic: template.topic,
      text: template.text,
      author,
      sentiment: template.sentiment,
      intent: template.intent,
      createdAt: `${date}T${hour}:${minute}:00+07:00`,
      likes: Math.floor(Math.pow(random(`${key}:l`), 2.2) * 190),
    });
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/* ------------------------------------------------------------------ */
/* Akun terhubung                                                      */
/* ------------------------------------------------------------------ */

const ACCOUNT_PROFILES: Array<
  Pick<ChannelAccount, "id" | "platform" | "handle" | "displayName" | "followersStart" | "connection" | "scopes" | "limitation">
> = [
  {
    id: "acc-ig",
    platform: "instagram",
    handle: "@hanamasak.studio",
    displayName: "Hanamasak Studio",
    followersStart: 45_110,
    connection: "connected",
    scopes: ["instagram_basic", "instagram_manage_insights", "pages_read_engagement"],
    limitation:
      "Metrik viewer unik (reach) hanya tersedia untuk akun Business/Creator yang terhubung. Likes disembunyikan pada sebagian unggahan.",
  },
  {
    id: "acc-tt",
    platform: "tiktok",
    handle: "@hanamasak",
    displayName: "Hanamasak",
    followersStart: 58_900,
    connection: "connected",
    scopes: ["user.info.basic", "user.info.stats", "video.list"],
    limitation:
      "Video views tidak dapat dibandingkan langsung dengan platform lain karena definisi penghitungan yang berbeda, dan data demografi audiens terbatas.",
  },
  {
    id: "acc-yt",
    platform: "youtube",
    handle: "@HanamasakStudio",
    displayName: "Hanamasak Studio",
    followersStart: 20_750,
    connection: "connected",
    scopes: ["youtube.readonly", "yt-analytics.readonly"],
    limitation:
      "Analytics YouTube tertunda hingga 48 jam, sehingga angka 24 jam terakhir bersifat sementara.",
  },
  {
    id: "acc-fb",
    platform: "facebook",
    handle: "Hanamasak",
    displayName: "Hanamasak Page",
    followersStart: 14_980,
    connection: "needs_review",
    scopes: ["pages_read_engagement", "read_insights"],
    limitation:
      "Izin insights belum diperbarui setelah review aplikasi; sebagian metrik Page masih belum tersinkron.",
  },
];

function buildAccounts(social: DailySocialMetric[]): ChannelAccount[] {
  return ACCOUNT_PROFILES.map((profile) => {
    const gained = social
      .filter((row) => row.platform === profile.platform)
      .reduce((sum, row) => sum + row.followersGained, 0);
    return {
      ...profile,
      followers: profile.followersStart + gained,
      lastSyncAt:
        profile.connection === "connected"
          ? `${RANGE_END}T06:${profile.platform === "youtube" ? "05" : "12"}:00+07:00`
          : null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

let cached: Dataset | null = null;

export function getDataset(): Dataset {
  if (cached) return cached;
  const dates = buildDates();
  const social = buildSocial(dates);
  const { web, sources } = buildWeb(dates, social);
  cached = {
    range: {
      start: dates[dates.length - RANGE_DAYS],
      end: dates[dates.length - 1],
      days: RANGE_DAYS,
    },
    history: { start: dates[0], end: dates[dates.length - 1], days: RANGE_TOTAL },
    generatedAt: `${RANGE_END}T06:15:00+07:00`,
    accounts: buildAccounts(social),
    social,
    content: buildContent(dates, social),
    comments: buildComments(dates),
    web,
    sources,
    pages: buildPages(web),
    search: buildSearch(),
  };
  return cached;
}
