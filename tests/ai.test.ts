/**
 * Unit test untuk `lib/ai.ts` (Phase 1.3 item 12).
 *
 * Fokus utamanya adalah regresi temuan **T-2**: `diagnoseTrafficGap` dulu
 * mencari path literal `/promo-oktober` dan mengasumsikan kanal `organic`,
 * sehingga pada data lain ia tetap mengeluarkan kalimat yang sama. Uji di sini
 * membuktikan narasinya benar-benar diambil dari data: ganti path, nama sumber,
 * dan kata kuncinya, maka diagnosis ikut berubah.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { diagnoseTrafficGap } from "../lib/ai";
import { buildDemoDataset } from "../lib/demo-dataset";
import type { Dataset, LandingPage, SearchMetric, TrafficSource } from "../lib/types";

const BASE = buildDemoDataset();

function page(path: string): LandingPage {
  return {
    path,
    title: "Halaman uji",
    views30: 1200,
    views30Prev: 1500,
    conversions30: 10,
    conversions30Prev: 20,
    conversions7: 2,
    conversions7Prev: 10,
    avgSeconds: 45,
    exitRate: 60,
    sourceKind: "seed",
  };
}

function source(name: string): TrafficSource {
  return {
    source: name,
    channel: "organic",
    platform: null,
    sessions: 100,
    sessionsPrev: 200,
    conversions: 5,
    conversionsPrev: 10,
    bounceRate: 40,
    sourceKind: "seed",
  };
}

function query(term: string): SearchMetric {
  return {
    query: term,
    impressions: 1000,
    clicks: 5,
    clicksPrev: 20,
    ctr: 0.5,
    position: 8,
    positionPrev: 3,
    sourceKind: "seed",
  };
}

/** Dataset dengan satu halaman, satu sumber, dan satu kata kunci yang menurun. */
function datasetWith(path: string, sourceName: string, term: string): Dataset {
  return {
    ...BASE,
    pages: [page(path)],
    sources: [source(sourceName)],
    search: [query(term)],
  };
}

test("diagnoseTrafficGap mengambil halaman, sumber, dan kata kunci dari data (regresi T-2)", () => {
  const diagnosis = diagnoseTrafficGap(
    datasetWith("/halaman-uji-alpha", "SumberUjiAlpha", "kata-uji-alpha"),
  );
  const dump = JSON.stringify(diagnosis);

  assert.ok(!dump.includes("/promo-oktober"), "path literal lama tidak boleh muncul lagi");
  assert.ok(
    diagnosis.actions.some((action) => action.includes("/halaman-uji-alpha")),
    "rekomendasi perbaikan harus menyebut halaman yang benar-benar menurun",
  );
  assert.ok(
    diagnosis.factors.some((factor) => factor.label.includes("SumberUjiAlpha")),
    "faktor penurunan harus menyebut sumber dari data",
  );
  assert.ok(
    diagnosis.actions.some((action) => action.includes("kata-uji-alpha")),
    "tinjauan kata kunci harus menyebut kata kunci dari data",
  );
  assert.ok(
    diagnosis.headline.includes("SumberUjiAlpha"),
    "headline harus menyebut sumber yang menurun, bukan kanal tetap",
  );
});

test("diagnoseTrafficGap berubah ketika datanya berubah", () => {
  const alpha = diagnoseTrafficGap(
    datasetWith("/halaman-uji-alpha", "SumberUjiAlpha", "kata-uji-alpha"),
  );
  const beta = diagnoseTrafficGap(
    datasetWith("/halaman-uji-beta", "SumberUjiBeta", "kata-uji-beta"),
  );

  const alphaDump = JSON.stringify(alpha);
  const betaDump = JSON.stringify(beta);
  assert.notEqual(alphaDump, betaDump);
  assert.ok(betaDump.includes("/halaman-uji-beta"));
  assert.ok(!betaDump.includes("/halaman-uji-alpha"));
  assert.ok(!betaDump.includes("SumberUjiAlpha"));
});

test("diagnoseTrafficGap tetap menghasilkan narasi tanpa halaman, sumber, atau kata kunci", () => {
  const diagnosis = diagnoseTrafficGap({ ...BASE, pages: [], sources: [], search: [] });
  assert.ok(diagnosis.headline.length > 0);
  assert.ok(diagnosis.body.length > 0);
  assert.ok(
    diagnosis.factors.some((factor) => factor.label.includes("Komposisi sumber trafik")),
    "faktor komposisi selalu ada karena hanya bergantung pada sosial dan website",
  );
  assert.ok(["tinggi", "sedang", "rendah"].includes(diagnosis.confidence));
  assert.ok(!JSON.stringify(diagnosis).includes("/promo-oktober"));
});

test("diagnoseTrafficGap menyertakan jumlah baris data yang dipakai", () => {
  const dataset = datasetWith("/halaman-uji-alpha", "SumberUjiAlpha", "kata-uji-alpha");
  const diagnosis = diagnoseTrafficGap(dataset);
  assert.ok(
    diagnosis.dataPoints.some((point) =>
      point.includes(`${dataset.social.length} baris metrik sosial`),
    ),
  );
  assert.ok(
    diagnosis.dataPoints.some((point) => point.includes(`${dataset.web.length} baris metrik website`)),
  );
});
