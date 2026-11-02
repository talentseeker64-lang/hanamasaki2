/**
 * Unit test untuk `lib/metrics.ts` (Phase 1.3 item 11).
 *
 * Seluruh fungsi diuji sebagai fungsi murni: masukannya `Dataset`, keluarannya
 * angka. Tidak ada akses D1, sehingga pengujian dapat berjalan di Windows tanpa
 * runtime `workerd`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HEALTH_ENGAGEMENT_BENCHMARK,
  HEALTH_WEIGHTS,
  audienceSummary,
  channelHealthScore,
  durationCoverage,
  engagementRateOf,
  inWindow,
  kpiSummary,
  pctChange,
  performanceByDuration,
  postingConsistency,
  provenanceOf,
  safeDiv,
  shiftDate,
  sum,
  trailingWindows,
  webTotals,
} from "../lib/metrics";
import type {
  AudienceInsight,
  ContentItem,
  DailySocialMetric,
  DailyWebMetric,
  DataSourceKind,
  Dataset,
} from "../lib/types";

const RANGE_END = "2026-10-30";

/** Perbandingan bilangan pecahan; hasil rata-rata berbobot tidak pernah eksak. */
function close(actual: number, expected: number, message: string, epsilon = 1e-9): void {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message}: ${actual} ≠ ${expected}`);
}

function emptyDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    range: { start: "2026-10-01", end: RANGE_END, days: 30 },
    history: { start: "2026-09-01", end: RANGE_END, days: 60 },
    generatedAt: "2026-10-30T06:15:00+07:00",
    accounts: [],
    social: [],
    content: [],
    comments: [],
    web: [],
    sources: [],
    pages: [],
    search: [],
    audience: [],
    events: [],
    ...overrides,
  };
}

function socialRow(
  overrides: Partial<DailySocialMetric> & Pick<DailySocialMetric, "date" | "platform">,
): DailySocialMetric {
  return {
    views: 0,
    reach: 0,
    impressions: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    followersGained: 0,
    profileVisits: 0,
    linkClicks: 0,
    sourceKind: "seed",
    ...overrides,
  };
}

function webRow(overrides: Partial<DailyWebMetric> & Pick<DailyWebMetric, "date">): DailyWebMetric {
  return {
    sessions: 0,
    users: 0,
    newUsers: 0,
    pageViews: 0,
    bounceRate: 0,
    avgSessionSeconds: 0,
    conversions: 0,
    sourceKind: "seed",
    ...overrides,
  };
}

function contentItem(id: string, publishedAt: string, durationSeconds: number | null): ContentItem {
  return {
    id,
    platform: "youtube",
    title: id,
    format: "video",
    topic: "umum",
    publishedAt,
    views: 1000,
    likes: 50,
    comments: 0,
    shares: 0,
    saves: 0,
    linkClicks: 0,
    durationSeconds,
    sourceKind: "seed",
  };
}

function audienceRow(
  id: string,
  accountId: string,
  dimension: AudienceInsight["dimension"],
  bucket: string,
  value: number,
  sourceKind: DataSourceKind,
): AudienceInsight {
  return {
    id,
    accountId,
    dimension,
    bucket,
    value,
    periodStart: "lifetime",
    periodEnd: "lifetime",
    sourceKind,
  };
}

/* ------------------------------------------------------------------ */
/* Utilitas angka                                                      */
/* ------------------------------------------------------------------ */

test("pctChange menghitung perubahan dan menjaga pembagian dengan nol", () => {
  assert.equal(pctChange(150, 100), 50);
  assert.equal(pctChange(50, 100), -50);
  assert.equal(pctChange(0, 0), 0);
  assert.equal(pctChange(10, 0), 100);
});

test("safeDiv mengembalikan 0 saat penyebutnya nol", () => {
  assert.equal(safeDiv(10, 0), 0);
  assert.equal(safeDiv(10, 4), 2.5);
});

test("sum menjumlahkan seluruh nilai", () => {
  assert.equal(sum([1, 2, 3]), 6);
  assert.equal(sum([]), 0);
});

test("engagementRateOf tidak menghitung interaksi pada konten tanpa tayangan", () => {
  assert.equal(engagementRateOf({ views: 0, likes: 10, comments: 0, shares: 0, saves: 0 }), 0);
  assert.equal(engagementRateOf({ views: 1000, likes: 50, comments: 0, shares: 0, saves: 0 }), 5);
});

/* ------------------------------------------------------------------ */
/* Jendela berbasis tanggal                                            */
/* ------------------------------------------------------------------ */

test("shiftDate menggeser tanggal melewati batas bulan", () => {
  assert.equal(shiftDate("2026-10-26", -29), "2026-09-27");
  assert.equal(shiftDate("2026-09-27", -30), "2026-08-28");
  assert.equal(shiftDate("2026-10-26", 0), "2026-10-26");
});

test("trailingWindows membentuk jendela berjalan dan pembandingnya tanpa celah", () => {
  const { current, previous } = trailingWindows("2026-10-26", 30);
  assert.deepEqual(current, { start: "2026-09-27", end: "2026-10-26" });
  assert.deepEqual(previous, { start: "2026-08-28", end: "2026-09-26" });
  // Hari terakhir jendela pembanding tepat satu hari sebelum hari pertama jendela berjalan.
  assert.equal(shiftDate(previous.end, 1), current.start);
});

test("inWindow bersifat inklusif pada kedua ujungnya", () => {
  const window = { start: "2026-10-01", end: "2026-10-30" };
  assert.equal(inWindow("2026-10-01", window), true);
  assert.equal(inWindow("2026-10-30", window), true);
  assert.equal(inWindow("2026-09-30", window), false);
  assert.equal(inWindow("2026-10-31", window), false);
});

/* ------------------------------------------------------------------ */
/* Provenance                                                          */
/* ------------------------------------------------------------------ */

test("provenanceOf melaporkan empty, seragam, dan mixed", () => {
  assert.equal(provenanceOf([]), "empty");
  assert.equal(provenanceOf([{ sourceKind: "seed" }, { sourceKind: "seed" }]), "seed");
  assert.equal(
    provenanceOf([{ sourceKind: "seed" }, { sourceKind: "platform-api" }]),
    "mixed",
  );
});

/* ------------------------------------------------------------------ */
/* Durasi konten                                                       */
/* ------------------------------------------------------------------ */

test("performanceByDuration memakai batas bucket yang tepat dan mengabaikan durasi null", () => {
  const dataset = emptyDataset({
    content: [
      contentItem("a", "2026-10-02T09:00:00+07:00", 30),
      contentItem("b", "2026-10-03T09:00:00+07:00", 31),
      contentItem("c", "2026-10-04T09:00:00+07:00", 60),
      contentItem("d", "2026-10-05T09:00:00+07:00", 61),
      contentItem("e", "2026-10-06T09:00:00+07:00", 180),
      contentItem("f", "2026-10-07T09:00:00+07:00", 181),
      // Konten bergambar: durasinya tidak dilaporkan, jadi bukan "0 detik".
      contentItem("g", "2026-10-08T09:00:00+07:00", null),
    ],
  });

  const buckets = new Map(performanceByDuration(dataset).map((bucket) => [bucket.key, bucket]));
  assert.equal(buckets.get("0-30")?.posts, 1);
  assert.equal(buckets.get("31-60")?.posts, 2);
  assert.equal(buckets.get("61-180")?.posts, 2);
  assert.equal(buckets.get("181+")?.posts, 1);
  assert.equal(buckets.get("0-30")?.label, "≤ 30 detik");
  assert.equal(
    sum([...buckets.values()].map((bucket) => bucket.posts)),
    6,
    "konten tanpa durasi tidak boleh masuk bucket mana pun",
  );

  const coverage = durationCoverage(dataset);
  assert.deepEqual(coverage, { withDuration: 6, withoutDuration: 1, total: 7 });
});

test("performanceByDuration dan durationCoverage hanya menyaring konten dalam rentang", () => {
  const dataset = emptyDataset({
    content: [
      contentItem("di-luar", "2026-09-10T09:00:00+07:00", 90),
      contentItem("di-dalam", "2026-10-10T09:00:00+07:00", 90),
    ],
  });
  assert.deepEqual(durationCoverage(dataset), { withDuration: 1, withoutDuration: 0, total: 1 });
});

/* ------------------------------------------------------------------ */
/* Konsistensi posting                                                 */
/* ------------------------------------------------------------------ */

test("postingConsistency mengukur jeda dari tanggal unggahan, bukan posisi baris", () => {
  const dataset = emptyDataset({
    content: [
      contentItem("a", "2026-10-01T09:00:00+07:00", null),
      contentItem("b", "2026-10-03T09:00:00+07:00", null),
      contentItem("c", "2026-10-10T09:00:00+07:00", null),
      // Unggahan kedua pada hari yang sama tidak menambah hari aktif.
      contentItem("d", "2026-10-10T20:00:00+07:00", null),
    ],
  });

  const consistency = postingConsistency(dataset);
  assert.equal(consistency.posts, 4);
  assert.equal(consistency.activeDays, 3);
  assert.equal(consistency.spanDays, 10);
  assert.equal(consistency.longestGapDays, 7);
  assert.equal(consistency.longestGapStart, "2026-10-03");
  close(consistency.avgGapDays, 4.5, "rata-rata jeda");
  close(consistency.consistencyRate, 30, "rasio konsistensi");
});

/* ------------------------------------------------------------------ */
/* Skor kesehatan kanal                                                */
/* ------------------------------------------------------------------ */

test("channelHealthScore tidak mengganti komponen tanpa data dengan nilai netral", () => {
  const health = channelHealthScore(emptyDataset(), "instagram");
  assert.equal(health.weightUsed, 0);
  assert.equal(health.score, 0);
  assert.equal(health.band, "perlu-perhatian");
  assert.deepEqual(
    health.components.map((component) => component.score),
    [null, null, null],
  );
  assert.equal(
    sum(health.components.map((component) => component.weight)),
    1,
    "bobot seluruh komponen harus berjumlah 1",
  );
});

test("channelHealthScore merata-ratakan hanya komponen yang datanya tersedia", () => {
  const dataset = emptyDataset({
    social: [
      socialRow({ date: "2026-10-15", platform: "instagram", views: 1000, likes: 50, followersGained: 20 }),
      socialRow({ date: "2026-09-15", platform: "instagram", views: 800, likes: 40, followersGained: 10 }),
    ],
  });

  const health = channelHealthScore(dataset, "instagram");
  const growth = health.components.find((component) => component.key === "growth");
  const consistency = health.components.find((component) => component.key === "consistency");
  const engagement = health.components.find((component) => component.key === "engagement");
  assert.ok(growth);
  assert.ok(consistency);
  assert.ok(engagement);

  // Pengikut baru +100% dari periode pembanding → skor pertumbuhan maksimum.
  close(growth.score ?? 0, 100, "skor pertumbuhan");
  // Rasio interaksi 5% sama dengan acuan sehat → skor interaksi maksimum.
  close(engagement.score ?? 0, 100, "skor interaksi");
  assert.equal(consistency.score, null, "tanpa konten, konsistensi belum dapat dinilai");
  close(health.weightUsed, HEALTH_WEIGHTS.growth + HEALTH_WEIGHTS.engagement, "bobot terpakai");
  close(health.score, 100, "skor gabungan");
  assert.equal(health.band, "sangat-baik");
  assert.match(engagement.detail, new RegExp(`acuan sehat ${HEALTH_ENGAGEMENT_BENCHMARK}%`));
});

/* ------------------------------------------------------------------ */
/* Demografi audiens                                                   */
/* ------------------------------------------------------------------ */

test("audienceSummary melaporkan belum tersedia bila tidak ada baris demografi", () => {
  const summary = audienceSummary(emptyDataset());
  assert.equal(summary.available, false);
  assert.deepEqual(summary.dimensions, []);
  assert.equal(summary.accountId, null);
});

test("audienceSummary menghitung proporsi per dimensi dan menandai provenance-nya", () => {
  const dataset = emptyDataset({
    audience: [
      audienceRow("1", "acc-ig", "age", "25-34", 60, "seed"),
      audienceRow("2", "acc-ig", "age", "18-24", 40, "seed"),
      audienceRow("3", "acc-ig", "gender", "Perempuan", 55, "seed"),
      audienceRow("4", "acc-ig", "gender", "Laki-laki", 45, "seed"),
    ],
  });

  const summary = audienceSummary(dataset, "acc-ig");
  assert.equal(summary.available, true);
  assert.equal(summary.dimensions.length, 2);

  const age = summary.dimensions.find((dimension) => dimension.dimension === "age");
  assert.ok(age);
  assert.equal(age.total, 100);
  assert.deepEqual(
    age.buckets.map((bucket) => bucket.bucket),
    ["25-34", "18-24"],
  );
  close(age.buckets[0].share, 60, "proporsi 25-34");
  close(age.buckets[1].share, 40, "proporsi 18-24");
  assert.equal(age.sourceKind, "seed");
});

test("audienceSummary mengutamakan baris platform-api dan menyisihkan seed pada dimensi yang sama", () => {
  const dataset = emptyDataset({
    audience: [
      audienceRow("1", "acc-ig", "age", "25-34", 60, "seed"),
      audienceRow("2", "acc-ig", "age", "18-24", 40, "seed"),
      audienceRow("3", "acc-ig", "age", "25-34", 70, "platform-api"),
      audienceRow("4", "acc-ig", "gender", "Perempuan", 55, "seed"),
    ],
  });

  const summary = audienceSummary(dataset, "acc-ig");
  const age = summary.dimensions.find((dimension) => dimension.dimension === "age");
  assert.ok(age);
  assert.equal(age.sourceKind, "platform-api");
  assert.equal(age.total, 70, "baris seed pada dimensi yang sama tidak boleh ikut dijumlahkan");
  assert.equal(age.buckets.length, 1);

  // Dimensi yang belum pernah diambil API tetap menampilkan datanya apa adanya.
  const gender = summary.dimensions.find((dimension) => dimension.dimension === "gender");
  assert.ok(gender);
  assert.equal(gender.sourceKind, "seed");
});

test("audienceSummary hanya memakai baris milik akun yang diminta", () => {
  const dataset = emptyDataset({
    audience: [
      audienceRow("1", "acc-ig", "age", "25-34", 60, "seed"),
      audienceRow("2", "acc-tt", "age", "18-24", 40, "seed"),
    ],
  });

  const instagram = audienceSummary(dataset, "acc-ig");
  const tiktok = audienceSummary(dataset, "acc-tt");
  const igAge = instagram.dimensions[0];
  const ttAge = tiktok.dimensions[0];
  assert.ok(igAge);
  assert.ok(ttAge);
  assert.equal(igAge.total, 60);
  assert.equal(ttAge.total, 40);
});

/* ------------------------------------------------------------------ */
/* Agregat dengan jendela tanggal                                      */
/* ------------------------------------------------------------------ */

test("kpiSummary mengabaikan baris di luar rentang, bukan memotong berdasarkan posisi baris", () => {
  const dalamJendela = socialRow({ date: "2026-10-15", platform: "instagram", views: 1000, likes: 50 });
  const diLuarRentang = socialRow({
    date: "2026-08-01",
    platform: "instagram",
    views: 999_999,
    likes: 999_999,
  });

  const tanpaBarisLuar = kpiSummary(emptyDataset({ social: [dalamJendela] }));
  const denganBarisLuar = kpiSummary(emptyDataset({ social: [diLuarRentang, dalamJendela] }));
  assert.equal(denganBarisLuar.totalViews, tanpaBarisLuar.totalViews);
  assert.equal(denganBarisLuar.totalViews, 1000);
});

test("kpiSummary memisahkan jendela berjalan dari jendela pembanding", () => {
  const kpi = kpiSummary(
    emptyDataset({
      social: [
        socialRow({ date: "2026-10-15", platform: "instagram", views: 1000, likes: 50 }),
        socialRow({ date: "2026-09-15", platform: "instagram", views: 500, likes: 20 }),
      ],
    }),
  );
  assert.equal(kpi.totalViews, 1000);
  assert.equal(kpi.totalViewsPrev, 500);
});

test("webTotals menjumlahkan sesi dan menghitung rasio konversi per jendela", () => {
  const totals = webTotals(
    emptyDataset({
      web: [
        webRow({ date: "2026-10-15", sessions: 100, conversions: 5 }),
        webRow({ date: "2026-10-16", sessions: 100, conversions: 5 }),
        webRow({ date: "2026-09-15", sessions: 200, conversions: 20 }),
      ],
    }),
  );
  assert.equal(totals.sessions, 200);
  assert.equal(totals.sessionsPrev, 200);
  assert.equal(totals.conversions, 10);
  assert.equal(totals.conversionsPrev, 20);
  close(totals.conversionRate, 5, "rasio konversi");
  close(totals.conversionRatePrev, 10, "rasio konversi pembanding");
});
