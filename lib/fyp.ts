/**
 * Skor potensi distribusi ("FYP") — Phase 3, modul D.
 *
 * Modul ini TIDAK memprediksi algoritma platform. Tidak ada satu pun dokumentasi
 * publik yang memetakan indikator mana ke keputusan distribusi, sehingga klaim
 * semacam itu tidak dapat dipertanggungjawabkan. Yang dihitung di sini adalah
 * **posisi sebuah konten relatif terhadap konten lain di kanal yang sama**:
 * seberapa jauh indikatornya di atas atau di bawah kebiasaan kanal itu sendiri.
 *
 * Karena itu seluruh pembanding berasal dari kanal yang sama. Membandingkan
 * Instagram dengan TikTok akan membandingkan definisi tayangan yang berbeda.
 *
 * Semua fungsi di sini murni dan menerima `Dataset`, sehingga dapat diuji tanpa
 * D1 — sama seperti `lib/metrics.ts`.
 */
import { engagementRateOf, mean, shiftDate, windowContent } from "./metrics";
import type { ContentItem, Dataset, Platform } from "./types";

export type FypIndicatorId =
  | "distribution"
  | "engagement"
  | "shareability"
  | "saveability"
  | "trend"
  | "hook";

/**
 * Bobot indikator. Satu-satunya dasar pemilihan bobotnya adalah indikator yang
 * lebih langsung mencerminkan penyebaran (jangkauan dan interaksi) diberi bobot
 * lebih besar daripada sinyal sekunder (tren topik). Ini pilihan yang dinyatakan
 * terbuka, bukan hasil kalibrasi terhadap data FYP nyata — data itu tidak ada.
 *
 * `hook` berbobot 0 karena belum pernah dapat dihitung (lihat `FYP_HOOK_REASON`).
 */
export const FYP_WEIGHTS: Record<FypIndicatorId, number> = {
  distribution: 0.25,
  engagement: 0.25,
  shareability: 0.2,
  saveability: 0.2,
  trend: 0.1,
  hook: 0,
};

export type FypBand = "atas" | "setara" | "bawah";

export const FYP_BAND_LABEL: Record<FypBand, string> = {
  atas: "Di atas kebiasaan kanal sendiri",
  setara: "Setara kebiasaan kanal sendiri",
  bawah: "Di bawah kebiasaan kanal sendiri",
};

/** Ambang batas skor 0–100 untuk tiap pita. */
export const FYP_BAND_THRESHOLD = { atas: 60, setara: 40 } as const;

/** Jendela yang dipakai untuk memisahkan "belakangan ini" dari "sebelumnya". */
export const FYP_TREND_WINDOW_DAYS = 7;

/**
 * Alasan indikator hook selalu ditandai belum tersedia.
 *
 * Kalimat ini dipakai apa adanya di antarmuka supaya tidak ada tempat bagi angka
 * pengganti: kurva retensi per detik hanya disediakan YouTube Analytics, dan
 * belum pernah ditarik ke basis data — jadi belum tersedia untuk platform mana pun.
 */
export const FYP_HOOK_REASON =
  "Memerlukan kurva retensi per detik. Hanya YouTube Analytics yang menyediakannya, dan data itu belum pernah ditarik ke basis data, sehingga indikator ini belum tersedia untuk semua platform — bukan diisi angka pengganti.";

/** Peringatan yang wajib ikut ditampilkan bersama skor mana pun. */
export const FYP_CAVEAT =
  "Skor ini adalah perbandingan terhadap konten lain di kanal yang sama, bukan prediksi algoritma. Tidak ada bukti bahwa skor ini menentukan masuk atau tidaknya sebuah konten ke FYP.";

export type FypUnit = "count" | "percent" | "perThousand" | "ratio";

export interface FypIndicator {
  id: FypIndicatorId;
  label: string;
  /** Nilai konten ini, pada satuan `unit`. */
  value: number;
  /** Nilai pembanding dari kanal yang sama, pada satuan yang sama. */
  benchmark: number;
  /** Skor relatif 0..1 terhadap pembanding. */
  score: number;
  unit: FypUnit;
}

export interface FypUnavailableIndicator {
  id: FypIndicatorId;
  label: string;
  reason: string;
}

export interface FypAssessment {
  item: ContentItem;
  /** Skor 0–100 dari indikator yang tersedia saja. */
  score: number;
  band: FypBand;
  indicators: FypIndicator[];
  unavailable: FypUnavailableIndicator[];
  /** Jumlah konten sekanal yang dipakai sebagai pembanding. */
  peerCount: number;
}

export interface FypBenchmark {
  distribution: number;
  engagement: number;
  shareability: number;
  saveability: number;
}

export interface TopicMomentum {
  topic: string;
  recentAvg: number;
  earlierAvg: number;
  recentPosts: number;
  earlierPosts: number;
  ratio: number;
}

/** Rasio per seribu tayangan, dipakai untuk bagikan dan simpan. */
export function perThousand(value: number, views: number): number {
  return views === 0 ? 0 : (value / views) * 1000;
}

/**
 * Skor relatif terhadap pembanding.
 *
 * Bernilai 1 begitu nilai konten mencapai dua kali kebiasaan kanal, 0 bila nol,
 * dan 0,5 bila persis setara. Pembanding nol tidak dianggap "tak terhingga":
 * konten dengan nilai positif mendapat 1, konten bernilai nol mendapat 0.
 */
export function relativeScore(value: number, benchmark: number): number {
  if (benchmark <= 0) return value > 0 ? 1 : 0;
  return Math.min(1, Math.max(0, value / (benchmark * 2)));
}

export function fypBand(score: number): FypBand {
  if (score >= FYP_BAND_THRESHOLD.atas) return "atas";
  if (score >= FYP_BAND_THRESHOLD.setara) return "setara";
  return "bawah";
}

/** Pembanding dari sekumpulan konten satu kanal. */
export function fypBenchmark(items: ContentItem[]): FypBenchmark {
  return {
    distribution: mean(items.map((item) => item.views)),
    engagement: mean(items.map(engagementRateOf)),
    shareability: mean(items.map((item) => perThousand(item.shares, item.views))),
    saveability: mean(items.map((item) => perThousand(item.saves, item.views))),
  };
}

/**
 * Arah tren tiap topik: rata-rata interaksi pada jendela terakhir dibanding
 * sebelumnya.
 *
 * Topik yang hanya muncul di satu sisi jendela sengaja tidak dimasukkan — arah
 * trennya tidak dapat dihitung dari satu titik, dan menebaknya akan menghasilkan
 * angka yang terlihat pasti padahal tidak.
 */
export function topicMomentum(
  items: ContentItem[],
  rangeEnd: string,
  windowDays = FYP_TREND_WINDOW_DAYS,
): Map<string, TopicMomentum> {
  const cutoff = shiftDate(rangeEnd, -(windowDays - 1));
  const groups = new Map<string, { recent: number[]; earlier: number[] }>();

  for (const item of items) {
    const bucket = groups.get(item.topic) ?? { recent: [], earlier: [] };
    const date = item.publishedAt.slice(0, 10);
    if (date >= cutoff) bucket.recent.push(engagementRateOf(item));
    else bucket.earlier.push(engagementRateOf(item));
    groups.set(item.topic, bucket);
  }

  const momentum = new Map<string, TopicMomentum>();
  for (const [topic, bucket] of groups) {
    if (bucket.recent.length === 0 || bucket.earlier.length === 0) continue;
    const recentAvg = mean(bucket.recent);
    const earlierAvg = mean(bucket.earlier);
    const ratio =
      earlierAvg === 0 ? (recentAvg > 0 ? 2 : 1) : recentAvg / earlierAvg;
    momentum.set(topic, {
      topic,
      recentAvg,
      earlierAvg,
      recentPosts: bucket.recent.length,
      earlierPosts: bucket.earlier.length,
      ratio,
    });
  }

  return momentum;
}

/** Menilai satu konten terhadap pembanding kanalnya. */
export function assessContent(
  item: ContentItem,
  benchmark: FypBenchmark,
  momentum: Map<string, TopicMomentum>,
  peerCount: number,
): FypAssessment {
  const indicators: FypIndicator[] = [
    {
      id: "distribution",
      label: "Jangkauan tayangan",
      value: item.views,
      benchmark: benchmark.distribution,
      score: relativeScore(item.views, benchmark.distribution),
      unit: "count",
    },
    {
      id: "engagement",
      label: "Rasio interaksi",
      value: engagementRateOf(item),
      benchmark: benchmark.engagement,
      score: relativeScore(engagementRateOf(item), benchmark.engagement),
      unit: "percent",
    },
    {
      id: "shareability",
      label: "Bagikan per 1.000 tayangan",
      value: perThousand(item.shares, item.views),
      benchmark: benchmark.shareability,
      score: relativeScore(
        perThousand(item.shares, item.views),
        benchmark.shareability,
      ),
      unit: "perThousand",
    },
    {
      id: "saveability",
      label: "Simpan per 1.000 tayangan",
      value: perThousand(item.saves, item.views),
      benchmark: benchmark.saveability,
      score: relativeScore(
        perThousand(item.saves, item.views),
        benchmark.saveability,
      ),
      unit: "perThousand",
    },
  ];

  const unavailable: FypUnavailableIndicator[] = [
    {
      id: "hook",
      label: "Kekuatan 3 detik pertama",
      reason: FYP_HOOK_REASON,
    },
  ];

  const topic = momentum.get(item.topic);
  if (topic) {
    indicators.push({
      id: "trend",
      label: "Relevansi tren topik",
      value: topic.ratio,
      benchmark: 1,
      score: Math.min(1, Math.max(0, topic.ratio / 2)),
      unit: "ratio",
    });
  } else {
    unavailable.push({
      id: "trend",
      label: "Relevansi tren topik",
      reason: `Topik "${item.topic}" tidak muncul di kedua sisi jendela ${FYP_TREND_WINDOW_DAYS} hari, sehingga arah trennya tidak dapat dihitung.`,
    });
  }

  let weighted = 0;
  let totalWeight = 0;
  for (const indicator of indicators) {
    const weight = FYP_WEIGHTS[indicator.id];
    weighted += indicator.score * weight;
    totalWeight += weight;
  }

  const score = totalWeight === 0 ? 0 : Math.round((weighted / totalWeight) * 100);

  return {
    item,
    score,
    band: fypBand(score),
    indicators,
    unavailable,
    peerCount,
  };
}

/**
 * Penilaian seluruh konten pada satu kanal, diurutkan dari skor tertinggi.
 *
 * `platform` wajib: pembandingnya adalah konten lain di kanal yang sama, dan
 * mencampur kanal akan membandingkan definisi tayangan yang berbeda. Karena itu
 * tidak ada bentuk pemanggilan tanpa kanal.
 */
export function fypAssessments(
  dataset: Dataset,
  platform: Platform,
  limit = 8,
): FypAssessment[] {
  const items = windowContent(dataset, platform);
  if (items.length === 0) return [];

  const benchmark = fypBenchmark(items);
  const momentum = topicMomentum(items, dataset.range.end);

  return items
    .map((item) => assessContent(item, benchmark, momentum, items.length))
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
    .slice(0, limit);
}
