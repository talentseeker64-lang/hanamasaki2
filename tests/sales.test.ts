/**
 * Unit test untuk `lib/sales.ts` (Phase 4, item 6).
 *
 * Fungsi diuji sebagai fungsi murni: masukan `Dataset`, luaran corong.
 *
 * Batas modul yang dikunci di sini:
 *
 * - Tahap yang belum terhubung bernilai `null`, bukan `0`.
 * - Peristiwa `lead` dan `order` dari pelacak browser tidak pernah diangkat
 *   menjadi prospek atau penjualan; tahapnya tetap `not_connected`.
 * - Rasio hanya dihitung bila tahap pembandingnya benar-benar terukur.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { campaignAttribution, mixesProvenance, salesFunnel } from "../lib/sales";
import type { DailySocialMetric, Dataset, SiteEvent, TrackingEventType } from "../lib/types";

function dataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    range: { start: "2026-10-01", end: "2026-10-30", days: 30 },
    history: { start: "2026-09-01", end: "2026-10-30", days: 60 },
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

/** Perbandingan bilangan pecahan; rasio tidak selalu eksak dalam floating point. */
function close(actual: number | null | undefined, expected: number, epsilon = 1e-9): void {
  assert.ok(
    actual !== undefined && actual !== null && Math.abs(actual - expected) <= epsilon,
    `rasio ${actual} ≠ ${expected}`,
  );
}

function socialRow(overrides: Partial<DailySocialMetric> = {}): DailySocialMetric {
  return {
    date: "2026-10-15",
    platform: "instagram",
    views: 1000,
    reach: 800,
    impressions: 1200,
    likes: 50,
    comments: 5,
    shares: 10,
    saves: 8,
    followersGained: 12,
    profileVisits: 30,
    linkClicks: 40,
    sourceKind: "seed",
    ...overrides,
  };
}

function siteEvent(
  eventType: TrackingEventType,
  overrides: Partial<SiteEvent> = {},
): SiteEvent {
  return {
    id: `${eventType}-${Math.random().toString(36).slice(2, 8)}`,
    occurredAt: "2026-10-20T02:00:00.000Z",
    receivedAt: "2026-10-20T02:00:01.000Z",
    eventType,
    path: "/",
    referrer: null,
    sessionId: null,
    utm: { source: null, medium: null, campaign: null, content: null, term: null },
    value: null,
    currency: null,
    sourceKind: "first-party",
    ...overrides,
  };
}

test("tahap yang belum terhubung bernilai null, bukan nol", () => {
  const stages = salesFunnel(dataset({ social: [socialRow()] }));
  const byKey = new Map(stages.map((stage) => [stage.key, stage]));

  assert.equal(byKey.get("views")?.value, 1000);
  assert.equal(byKey.get("views")?.state, "measured");
  assert.equal(byKey.get("clicks")?.value, 40);

  for (const key of ["visits", "product_views", "leads", "orders", "revenue"]) {
    const stage = byKey.get(key);
    assert.equal(stage?.state, "not_connected", `${key} seharusnya belum terhubung`);
    assert.equal(stage?.value, null, `${key} tidak boleh diisi angka`);
    assert.equal(stage?.provenance, null);
    assert.ok((stage?.note ?? "").length > 0, `${key} wajib punya alasan`);
  }
});

test("peristiwa pelacak mengisi tahap kunjungan dan halaman produk sebagai first-party", () => {
  const events = [
    ...Array.from({ length: 10 }, () => siteEvent("pageview")),
    ...Array.from({ length: 4 }, () => siteEvent("product_view", { path: "/produk/kemeja" })),
  ];
  const stages = salesFunnel(dataset({ social: [socialRow()], events }));
  const byKey = new Map(stages.map((stage) => [stage.key, stage]));

  assert.equal(byKey.get("visits")?.value, 10);
  assert.equal(byKey.get("visits")?.state, "measured");
  assert.equal(byKey.get("visits")?.provenance, "first-party");
  assert.equal(byKey.get("product_views")?.value, 4);
  assert.equal(byKey.get("product_views")?.state, "measured");
});

test("pelacak aktif tanpa peristiwa product_view tidak dianggap nol", () => {
  const stages = salesFunnel(
    dataset({ social: [socialRow()], events: [siteEvent("pageview")] }),
  );
  const productViews = stages.find((stage) => stage.key === "product_views");

  assert.equal(productViews?.state, "not_connected");
  assert.equal(productViews?.value, null);
  assert.match(productViews?.note ?? "", /product_view/);
});

test("peristiwa lead dan order dari browser tidak diangkat menjadi prospek atau penjualan", () => {
  const events = [
    siteEvent("pageview"),
    siteEvent("lead", { path: "/hubungi" }),
    siteEvent("lead", { path: "/hubungi" }),
    siteEvent("order", { path: "/terima-kasih", value: 249000, currency: "IDR" }),
  ];
  const stages = salesFunnel(dataset({ social: [socialRow()], events }));
  const byKey = new Map(stages.map((stage) => [stage.key, stage]));

  for (const key of ["leads", "orders", "revenue"]) {
    assert.equal(byKey.get(key)?.state, "not_connected");
    assert.equal(byKey.get(key)?.value, null);
  }
  // Jumlah sinyal tetap disebut supaya peristiwa yang diterima tidak hilang.
  assert.match(byKey.get("leads")?.note ?? "", /2 peristiwa `lead`/);
  assert.match(byKey.get("orders")?.note ?? "", /1 peristiwa `order`/);
});

test("rasio hanya dihitung antara tahap yang terukur", () => {
  const events = [siteEvent("pageview"), siteEvent("pageview")];
  const stages = salesFunnel(dataset({ social: [socialRow()], events }));
  const byKey = new Map(stages.map((stage) => [stage.key, stage]));

  // Tahap pertama tidak punya pembanding sebelumnya.
  assert.equal(byKey.get("views")?.stepRate, null);
  assert.equal(byKey.get("views")?.totalRate, 100);
  // 40 klik dari 1.000 tayangan.
  close(byKey.get("clicks")?.stepRate, 4);
  close(byKey.get("clicks")?.totalRate, 4);
  // 2 kunjungan dari 40 klik, dan 0,2% dari tahap terukur pertama.
  close(byKey.get("visits")?.stepRate, 5);
  close(byKey.get("visits")?.totalRate, 0.2);
  // Tahap yang belum terhubung tidak punya rasio.
  assert.equal(byKey.get("leads")?.stepRate, null);
  assert.equal(byKey.get("leads")?.totalRate, null);
});

test("mixesProvenance menandai corong yang mencampur ilustratif dan terukur", () => {
  const events = [siteEvent("pageview")];
  assert.equal(mixesProvenance(salesFunnel(dataset({ social: [socialRow()] }))), false);
  assert.equal(mixesProvenance(salesFunnel(dataset({ social: [socialRow()], events }))), true);
});

test("campaignAttribution mengelompokkan per kampanye dan penanda konten", () => {
  const events: SiteEvent[] = [
    siteEvent("pageview", {
      sessionId: "a",
      utm: { source: "instagram", medium: "social", campaign: "promo-nov", content: "c-1", term: null },
    }),
    siteEvent("product_view", {
      sessionId: "a",
      utm: { source: "instagram", medium: "social", campaign: "promo-nov", content: "c-1", term: null },
    }),
    siteEvent("pageview", {
      sessionId: "b",
      utm: { source: "tiktok", medium: "social", campaign: "promo-nov", content: null, term: null },
    }),
    // Tanpa UTM sama sekali: harus jadi kelompok tersendiri, bukan digabung.
    siteEvent("pageview"),
  ];

  const rows = campaignAttribution(events);
  assert.equal(rows.length, 3);

  const promo = rows.find((row) => row.campaign === "promo-nov" && row.contentRef === "c-1");
  assert.equal(promo?.visits, 1);
  assert.equal(promo?.productViews, 1);

  const noCampaign = rows.find((row) => row.campaign === null);
  assert.equal(noCampaign?.visits, 1);
  assert.equal(noCampaign?.contentRef, null);
});

test("campaignAttribution mengurutkan kunjungan terbanyak lebih dulu", () => {
  const events = [
    siteEvent("pageview", {
      utm: { source: null, medium: null, campaign: "kecil", content: null, term: null },
    }),
    siteEvent("pageview", {
      utm: { source: null, medium: null, campaign: "besar", content: null, term: null },
    }),
    siteEvent("pageview", {
      utm: { source: null, medium: null, campaign: "besar", content: null, term: null },
    }),
  ];

  assert.deepEqual(
    campaignAttribution(events).map((row) => row.campaign),
    ["besar", "kecil"],
  );
});

test("campaignAttribution pada daftar kosong mengembalikan daftar kosong", () => {
  assert.deepEqual(campaignAttribution([]), []);
});
