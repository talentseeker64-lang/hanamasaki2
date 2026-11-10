/**
 * Unit test untuk `lib/tracking.ts` (Phase 4, item 1 dan 2).
 *
 * Seluruh fungsi yang diuji murni: masukan JSON mentah, luaran bentuk yang boleh
 * disimpan. Tidak ada akses D1, sehingga berjalan di Windows tanpa runtime
 * `workerd`.
 *
 * Beberapa pengujian sengaja mengunci aturan yang menjadi batas modul: jenis
 * peristiwa yang tidak dikenal ditolak (bukan ditebak), `value` hanya boleh
 * menyertai pesanan, dan `currency` wajib menyertai `value`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  TRACK_BATCH_LIMIT,
  TRACK_SOURCE_KIND,
  parseTrackBatch,
  parseTrackEvent,
  trackingCoverage,
} from "../lib/tracking";
import { ValidationError } from "../lib/validation";
import type { SiteEvent } from "../lib/types";

function pageview(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "evt-1",
    type: "pageview",
    path: "/produk/kemeja",
    occurredAt: "2026-11-02T04:15:00.000Z",
    ...overrides,
  };
}

test("parseTrackEvent menerima kunjungan yang sah dan menormalkan waktunya", () => {
  const event = parseTrackEvent(
    pageview({
      occurredAt: "2026-11-02T11:15:00+07:00",
      referrer: "https://instagram.com/",
      sessionId: "sesi-1",
      utm: { source: "instagram", campaign: "promo-november" },
    }),
  );

  assert.equal(event.sourceRef, "evt-1");
  assert.equal(event.eventType, "pageview");
  assert.equal(event.path, "/produk/kemeja");
  // Jam browser disimpan sebagai ISO UTC, bukan disamakan dengan jam server.
  assert.equal(event.occurredAt, "2026-11-02T04:15:00.000Z");
  assert.equal(event.utm.source, "instagram");
  assert.equal(event.utm.campaign, "promo-november");
  // Parameter yang tidak dikirim tetap null, bukan string kosong.
  assert.equal(event.utm.medium, null);
  assert.equal(event.value, null);
  assert.equal(event.currency, null);
});

test("parseTrackEvent menolak jenis peristiwa yang tidak dikenal alih-alih menebaknya", () => {
  assert.throws(
    () => parseTrackEvent(pageview({ type: "minat" })),
    (error: unknown) => error instanceof ValidationError,
  );
  assert.throws(() => parseTrackEvent(pageview({ type: "pageview2" })), ValidationError);
});

test("parseTrackEvent menolak waktu yang tidak dapat dibaca", () => {
  assert.throws(() => parseTrackEvent(pageview({ occurredAt: "kemarin" })), ValidationError);
});

test("parseTrackEvent hanya mengizinkan value pada peristiwa pesanan", () => {
  assert.throws(
    () => parseTrackEvent(pageview({ value: 1000, currency: "IDR" })),
    ValidationError,
  );

  const order = parseTrackEvent(
    pageview({ id: "evt-order", type: "order", value: 249000, currency: "idr" }),
  );
  assert.equal(order.value, 249000);
  // Kode mata uang diseragamkan menjadi huruf besar.
  assert.equal(order.currency, "IDR");
});

test("parseTrackEvent mewajibkan currency yang menyertai value", () => {
  assert.throws(
    () => parseTrackEvent(pageview({ id: "evt-order", type: "order", value: 249000 })),
    ValidationError,
  );
  assert.throws(
    () => parseTrackEvent(pageview({ id: "evt-order", type: "order", value: 249000, currency: "" })),
    ValidationError,
  );
  assert.throws(
    () => parseTrackEvent(pageview({ id: "evt-order", type: "order", value: 249000, currency: "rupiah" })),
    ValidationError,
  );
});

test("parseTrackEvent menolak currency tanpa value karena tidak punya arti", () => {
  assert.throws(
    () => parseTrackEvent(pageview({ currency: "IDR" })),
    ValidationError,
  );
});

test("parseTrackEvent menolak nilai negatif dan nilai yang bukan angka", () => {
  assert.throws(
    () => parseTrackEvent(pageview({ id: "evt-order", type: "order", value: -1, currency: "IDR" })),
    ValidationError,
  );
  assert.throws(
    () => parseTrackEvent(pageview({ id: "evt-order", type: "order", value: "249000", currency: "IDR" })),
    ValidationError,
  );
});

test("parseTrackBatch menolak daftar kosong, daftar terlalu panjang, dan id ganda", () => {
  assert.throws(() => parseTrackBatch({ events: [] }), ValidationError);
  assert.throws(() => parseTrackBatch({}), ValidationError);
  assert.throws(
    () =>
      parseTrackBatch({
        events: Array.from({ length: TRACK_BATCH_LIMIT + 1 }, (_, index) =>
          pageview({ id: `evt-${index}` }),
        ),
      }),
    ValidationError,
  );
  // Dua peristiwa dengan id sama akan dianggap satu baris oleh server, jadi
  // permintaannya dibatalkan seluruhnya.
  assert.throws(
    () => parseTrackBatch({ events: [pageview({ id: "sama" }), pageview({ id: "sama", path: "/lain" })] }),
    ValidationError,
  );
});

test("parseTrackBatch memvalidasi seluruh peristiwa sebelum satu pun disimpan", () => {
  assert.throws(
    () => parseTrackBatch({ events: [pageview({ id: "evt-1" }), pageview({ id: "evt-2", type: "salah" })] }),
    ValidationError,
  );

  const events = parseTrackBatch({
    events: [
      pageview({ id: "evt-1" }),
      pageview({ id: "evt-2", type: "product_view", path: "/produk/b" }),
    ],
  });
  assert.equal(events.length, 2);
  assert.equal(events[1].eventType, "product_view");
});

test("label asal peristiwa pelacak adalah first-party, bukan platform-api", () => {
  // Peristiwa ini diukur sistem sendiri; menyamakannya dengan platform-api
  // akan membuat status koneksi kanal sosial tampak terverifikasi oleh data
  // yang bukan berasal dari platform.
  assert.equal(TRACK_SOURCE_KIND, "first-party");
}); 

function siteEvent(overrides: Partial<SiteEvent> = {}): SiteEvent {
  return {
    id: "e",
    occurredAt: "2026-11-01T00:00:00.000Z",
    receivedAt: "2026-11-01T00:00:01.000Z",
    eventType: "pageview",
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

test("trackingCoverage menghitung sesi, cakupan UTM, dan rentang waktu", () => {
  const coverage = trackingCoverage([
    siteEvent({ id: "1", sessionId: "a", occurredAt: "2026-11-01T00:00:00.000Z" }),
    siteEvent({
      id: "2",
      sessionId: "a",
      occurredAt: "2026-11-03T00:00:00.000Z",
      utm: { source: "instagram", medium: null, campaign: null, content: null, term: null },
    }),
    siteEvent({ id: "3", sessionId: "b", occurredAt: "2026-11-02T00:00:00.000Z" }),
  ]);

  assert.equal(coverage.events, 3);
  assert.equal(coverage.sessions, 2);
  assert.equal(coverage.withUtm, 1);
  assert.equal(coverage.firstSeen, "2026-11-01T00:00:00.000Z");
  assert.equal(coverage.lastSeen, "2026-11-03T00:00:00.000Z");
});

test("trackingCoverage pada daftar kosong tidak memalsukan rentang waktu", () => {
  const coverage = trackingCoverage([]);
  assert.equal(coverage.events, 0);
  assert.equal(coverage.firstSeen, null);
  assert.equal(coverage.lastSeen, null);
});

// ---------------------------------------------------------------------------
// Cuplikan pemasangan dan perilaku skrip `public/track.js` (A1)
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import vm from "node:vm";
import { trackerSnippet } from "../lib/tracking";

test("trackerSnippet memakai origin Worker dan jalur /track.js", () => {
  assert.equal(
    trackerSnippet("https://hanamasaki2.example.workers.dev/"),
    '<script defer src="https://hanamasaki2.example.workers.dev/track.js" data-track-key="<TRACK_KEY>"></script>',
  );
  assert.match(trackerSnippet(null), /src="https:\/\/<worker>\/track\.js"/);
});

/** Jalankan track.js di sandbox browser palsu; kembalikan permintaan yang dikirim. */
function runTracker(scriptAttrs: Record<string, string>, scriptSrc: string, pageUrl: string) {
  const calls: { url: string; init: Record<string, unknown> }[] = [];
  const page = new URL(pageUrl);
  const window: Record<string, unknown> = {
    location: { pathname: page.pathname, search: page.search, href: page.href },
    sessionStorage: { getItem: () => null, setItem: () => undefined },
    crypto: { randomUUID: () => "uuid-test" },
  };
  const sandbox = {
    window,
    document: {
      referrer: "",
      currentScript: {
        src: scriptSrc,
        getAttribute: (name: string) => scriptAttrs[name] ?? null,
      },
    },
    URL,
    URLSearchParams,
    JSON,
    Date,
    Math,
    fetch: (url: string, init: Record<string, unknown>) => {
      calls.push({ url, init });
      return Promise.resolve();
    },
  };
  vm.runInNewContext(readFileSync("public/track.js", "utf8"), sandbox);
  return calls;
}

test("track.js mengirim ke origin src skrip, bukan ke domain situs pemasang", () => {
  const calls = runTracker(
    { "data-track-key": "k" },
    "https://worker.example.dev/track.js",
    "https://toko-orang.example/produk/a?utm_source=tiktok",
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://worker.example.dev/api/track");
  assert.deepEqual((calls[0].init.headers as Record<string, string>)["x-track-key"], "k");
});

test("track.js menyelesaikan data-endpoint relatif terhadap src, dan menghormati yang absolut", () => {
  const relative = runTracker(
    { "data-track-key": "k", "data-endpoint": "/collect" },
    "https://worker.example.dev/track.js",
    "https://toko-orang.example/",
  );
  assert.equal(relative[0].url, "https://worker.example.dev/collect");

  const absolute = runTracker(
    { "data-track-key": "k", "data-endpoint": "https://lain.example/api/track" },
    "https://worker.example.dev/track.js",
    "https://toko-orang.example/",
  );
  assert.equal(absolute[0].url, "https://lain.example/api/track");
});

test("track.js tidak mengirim apa pun tanpa data-track-key", () => {
  const calls = runTracker({}, "https://worker.example.dev/track.js", "https://toko-orang.example/");
  assert.equal(calls.length, 0);
});
