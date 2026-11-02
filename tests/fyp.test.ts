/**
 * Unit test untuk `lib/fyp.ts` (Phase 3, modul D).
 *
 * Sama seperti `tests/metrics.test.ts`, seluruh fungsi diuji sebagai fungsi
 * murni: masukannya `Dataset`, keluarannya angka. Tidak ada akses D1, sehingga
 * pengujian dapat berjalan di Windows tanpa runtime `workerd`.
 *
 * Beberapa pengujian di sini sengaja mengunci prinsip yang menjadi batas modul:
 * skor adalah perbandingan relatif, indikator hook tidak pernah diisi angka
 * pengganti, dan topik yang hanya muncul di satu sisi jendela tren tidak
 * menghasilkan arah tren.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDemoDataset } from "../lib/demo-dataset";
import {
  FYP_BAND_THRESHOLD,
  FYP_TREND_WINDOW_DAYS,
  FYP_WEIGHTS,
  assessContent,
  fypAssessments,
  fypBand,
  fypBenchmark,
  perThousand,
  relativeScore,
  topicMomentum,
} from "../lib/fyp";
import { engagementRateOf, mean, shiftDate } from "../lib/metrics";
import type { ContentItem, Dataset, Platform } from "../lib/types";

const RANGE_END = "2026-10-30";

/** Perbandingan bilangan pecahan; rata-rata tidak pernah benar-benar eksak. */
function close(actual: number, expected: number, message: string, epsilon = 1e-9): void {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message}: ${actual} ≠ ${expected}`);
}

function contentItem(
  id: string,
  publishedAt: string,
  overrides: Partial<ContentItem> = {},
): ContentItem {
  return {
    id,
    platform: "instagram",
    title: id,
    format: "reels",
    topic: "umum",
    publishedAt,
    views: 1000,
    likes: 50,
    comments: 0,
    shares: 0,
    saves: 0,
    linkClicks: 0,
    durationSeconds: null,
    sourceKind: "seed",
    ...overrides,
  };
}

function datasetWith(content: ContentItem[], platform: Platform = "instagram"): Dataset {
  return {
    range: { start: "2026-10-01", end: RANGE_END, days: 30 },
    history: { start: "2026-09-01", end: RANGE_END, days: 60 },
    generatedAt: "2026-10-30T06:15:00+07:00",
    accounts: [],
    social: [],
    content: content.map((item) => ({ ...item, platform })),
    comments: [],
    web: [],
    sources: [],
    pages: [],
    search: [],
    audience: [],
    events: [],
  };
}

/* ------------------------------------------------------------------ */
/* Utilitas angka                                                      */
/* ------------------------------------------------------------------ */

test("perThousand menghitung rasio per seribu tayangan", () => {
  close(perThousand(50, 1000), 50, "50 dari 1000 tayangan");
  close(perThousand(1, 250), 4, "1 dari 250 tayangan");
});

test("perThousand mengembalikan 0 saat tayangan nol, bukan Infinity", () => {
  assert.equal(perThousand(10, 0), 0);
});

test("mean himpunan kosong bernilai 0, bukan NaN", () => {
  assert.equal(mean([]), 0);
});

test("relativeScore bernilai 0,5 saat setara pembanding dan 1 saat dua kali", () => {
  close(relativeScore(100, 100), 0.5, "setara pembanding");
  close(relativeScore(200, 100), 1, "dua kali pembanding");
});

test("relativeScore dibatasi pada rentang 0..1", () => {
  close(relativeScore(0, 100), 0, "nilai nol");
  close(relativeScore(1000, 100), 1, "jauh di atas pembanding tetap 1");
});

test("relativeScore menangani pembanding nol tanpa membagi nol", () => {
  assert.equal(relativeScore(0, 0), 0, "keduanya nol");
  assert.equal(relativeScore(5, 0), 1, "nilai positif dengan pembanding nol");
});

/* ------------------------------------------------------------------ */
/* Pita skor                                                           */
/* ------------------------------------------------------------------ */

test("fypBand memetakan skor ke pita sesuai ambang", () => {
  assert.equal(fypBand(FYP_BAND_THRESHOLD.atas), "atas");
  assert.equal(fypBand(100), "atas");
  assert.equal(fypBand(FYP_BAND_THRESHOLD.setara), "setara");
  assert.equal(fypBand(FYP_BAND_THRESHOLD.atas - 1), "setara");
  assert.equal(fypBand(FYP_BAND_THRESHOLD.setara - 1), "bawah");
  assert.equal(fypBand(0), "bawah");
});

/* ------------------------------------------------------------------ */
/* Pembanding kanal                                                    */
/* ------------------------------------------------------------------ */

test("fypBenchmark merata-ratakan indikator konten sekumpulan", () => {
  const items = [
    contentItem("a", "2026-10-20", { views: 1000, likes: 50, comments: 0, shares: 10, saves: 20 }),
    contentItem("b", "2026-10-21", { views: 3000, likes: 150, comments: 30, shares: 30, saves: 40 }),
  ];
  const benchmark = fypBenchmark(items);

  close(benchmark.distribution, 2000, "rata-rata tayangan");
  close(benchmark.engagement, (8 + (250 / 3000) * 100) / 2, "rata-rata rasio interaksi");
  close(benchmark.shareability, 10, "rata-rata bagikan per seribu");
  close(benchmark.saveability, (20 + (40 / 3000) * 1000) / 2, "rata-rata simpan per seribu");
});

test("fypBenchmark himpunan kosong menghasilkan nol, bukan NaN", () => {
  const benchmark = fypBenchmark([]);
  assert.equal(benchmark.distribution, 0);
  assert.equal(benchmark.engagement, 0);
  assert.equal(benchmark.shareability, 0);
  assert.equal(benchmark.saveability, 0);
});

/* ------------------------------------------------------------------ */
/* Tren topik                                                          */
/* ------------------------------------------------------------------ */

test("topicMomentum menghitung arah tren topik yang muncul di kedua sisi jendela", () => {
  const items = [
    contentItem("baru", "2026-10-28", { topic: "tren", likes: 100 }),
    contentItem("lama", "2026-10-10", { topic: "tren", likes: 50 }),
  ];
  const momentum = topicMomentum(items, RANGE_END);

  const tren = momentum.get("tren");
  assert.ok(tren, "topik dua sisi harus terhitung");
  close(tren.recentAvg, 10, "rata-rata rasio jendela terakhir");
  close(tren.earlierAvg, 5, "rata-rata rasio jendela sebelumnya");
  close(tren.ratio, 2, "rasio tren");
  assert.equal(tren.recentPosts, 1);
  assert.equal(tren.earlierPosts, 1);
});

test("topicMomentum melewati topik yang hanya muncul di satu sisi jendela", () => {
  const items = [
    contentItem("baru", "2026-10-29", { topic: "baru" }),
    contentItem("lama", "2026-10-05", { topic: "lama" }),
  ];
  const momentum = topicMomentum(items, RANGE_END);

  assert.equal(momentum.has("baru"), false, "topik hanya di sisi terakhir tidak ditebak");
  assert.equal(momentum.has("lama"), false, "topik hanya di sisi sebelumnya tidak ditebak");
  assert.equal(momentum.size, 0);
});

test("topicMomentum memakai batas jendela, bukan posisi baris", () => {
  // Semua konten berada di jendela sebelumnya; tidak ada yang terhitung.
  const items = [
    contentItem("a", "2026-10-10", { topic: "sama" }),
    contentItem("b", "2026-10-11", { topic: "sama" }),
  ];
  const momentum = topicMomentum(items, RANGE_END);
  assert.equal(momentum.has("sama"), false);
});

/* ------------------------------------------------------------------ */
/* Penilaian konten                                                    */
/* ------------------------------------------------------------------ */

test("assessContent menyertakan indikator inti dan jumlah pembanding", () => {
  const items = [
    contentItem("a", "2026-10-28", { topic: "tren", views: 2000, likes: 100 }),
    contentItem("b", "2026-10-10", { topic: "tren", views: 1000, likes: 40 }),
  ];
  const benchmark = fypBenchmark(items);
  const momentum = topicMomentum(items, RANGE_END);
  const assessment = assessContent(items[0], benchmark, momentum, items.length);

  const ids = assessment.indicators.map((indicator) => indicator.id);
  assert.deepEqual(ids.sort(), ["distribution", "engagement", "saveability", "shareability", "trend"]);
  assert.equal(assessment.peerCount, 2);
  assert.ok(assessment.score >= 0 && assessment.score <= 100, "skor dalam rentang 0..100");
  assert.equal(assessment.band, fypBand(assessment.score));
});

test("assessContent tidak pernah mengisi indikator hook dengan angka", () => {
  const items = [contentItem("a", "2026-10-28")];
  const assessment = assessContent(
    items[0],
    fypBenchmark(items),
    topicMomentum(items, RANGE_END),
    1,
  );

  assert.equal(
    assessment.indicators.some((indicator) => indicator.id === "hook"),
    false,
    "hook tidak boleh muncul sebagai indikator terhitung",
  );
  const hook = assessment.unavailable.find((indicator) => indicator.id === "hook");
  assert.ok(hook, "hook harus tercatat sebagai indikator belum tersedia");
  assert.equal(FYP_WEIGHTS.hook, 0);
});

test("assessContent menandai tren belum tersedia bila topik tidak muncul di kedua sisi", () => {
  const items = [contentItem("a", "2026-10-28", { topic: "sekali" })];
  const assessment = assessContent(
    items[0],
    fypBenchmark(items),
    topicMomentum(items, RANGE_END),
    1,
  );

  assert.equal(
    assessment.indicators.some((indicator) => indicator.id === "trend"),
    false,
    "tren tidak dihitung dari satu titik",
  );
  assert.ok(assessment.unavailable.some((indicator) => indicator.id === "trend"));
});

test("assessContent memberi skor lebih tinggi pada konten yang lebih unggul", () => {
  const items = [
    contentItem("unggul", "2026-10-28", { views: 5000, likes: 400, shares: 100, saves: 200 }),
    contentItem("lemah", "2026-10-27", { views: 500, likes: 5, shares: 0, saves: 0 }),
  ];
  const benchmark = fypBenchmark(items);
  const momentum = topicMomentum(items, RANGE_END);

  const unggul = assessContent(items[0], benchmark, momentum, items.length);
  const lemah = assessContent(items[1], benchmark, momentum, items.length);

  assert.ok(unggul.score > lemah.score, "konten unggul berskor lebih tinggi");
  assert.equal(unggul.band, "atas");
  assert.equal(lemah.band, "bawah");
});

/* ------------------------------------------------------------------ */
/* Penilaian satu kanal                                                */
/* ------------------------------------------------------------------ */

test("fypAssessments mengembalikan konten kanal terpilih, terurut menurun", () => {
  const dataset = buildDemoDataset();
  const assessments = fypAssessments(dataset, "instagram", 4);

  assert.ok(assessments.length > 0, "dataset demo memiliki konten Instagram");
  assert.ok(assessments.length <= 4, "batas limit dipatuhi");
  assert.ok(
    assessments.every((item) => item.item.platform === "instagram"),
    "hanya konten kanal yang diminta",
  );
  for (let i = 1; i < assessments.length; i += 1) {
    assert.ok(
      assessments[i - 1].score >= assessments[i].score,
      "diurutkan dari skor tertinggi",
    );
  }
  assert.ok(
    assessments.every((item) =>
      item.unavailable.some((indicator) => indicator.id === "hook"),
    ),
    "hook selalu belum tersedia pada semua penilaian",
  );
});

test("fypAssessments menilai seluruh konten di dalam rentang tampilan", () => {
  const earlier = shiftDate(RANGE_END, -(FYP_TREND_WINDOW_DAYS - 1));
  const dataset = datasetWith([
    contentItem("terbaru", RANGE_END, { views: 1000 }),
    contentItem("sebelumnya", earlier, { views: 2000 }),
  ]);

  const assessments = fypAssessments(dataset, "instagram", 10);
  assert.deepEqual(
    assessments.map((item) => item.item.id).sort(),
    ["sebelumnya", "terbaru"],
    "kedua konten berada di dalam rentang dan keduanya dinilai",
  );
});

test("fypAssessments mengembalikan daftar kosong saat kanal tidak punya konten", () => {
  const dataset = datasetWith([]);
  assert.deepEqual(fypAssessments(dataset, "instagram"), []);
});

test("engagementRateOf dipakai konsisten sebagai dasar pembanding interaksi", () => {
  const item = contentItem("a", "2026-10-28", { views: 1000, likes: 50, shares: 30, saves: 20 });
  const benchmark = fypBenchmark([item]);
  close(benchmark.engagement, engagementRateOf(item), "pembanding interaksi sama dengan rasio konten tunggal");
});
