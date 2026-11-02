/**
 * Unit test untuk jalur baca dataset (Phase 1.3 item 14).
 *
 * `getDataset()` sendiri tidak dapat diuji tanpa D1, jadi kontrak bacanya
 * dipisahkan ke `assembleDataset`, dan di situlah penyaringan rentang serta
 * provenance diverifikasi. Yang dijaga di sini adalah janji bahwa data yang
 * asalnya tidak diketahui tidak pernah tampil sebagai data terukur.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { AccountRow } from "../lib/accounts";
import { assembleDataset, toSourceKind } from "../lib/data";
import type {
  AudienceRow,
  ContentRow,
  DatasetRows,
  MetaRow,
  SocialRow,
} from "../lib/data";

const META: MetaRow = {
  range_start: "2026-10-01",
  range_end: "2026-10-30",
  range_days: 30,
  history_start: "2026-09-01",
  history_end: "2026-10-30",
  history_days: 60,
  generated_at: "2026-10-30T06:15:00+07:00",
};

function rows(overrides: Partial<DatasetRows> = {}): DatasetRows {
  return {
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

function socialRow(date: string, sourceKind: string | null): SocialRow {
  return {
    date,
    platform: "instagram",
    views: 1,
    reach: 1,
    impressions: 1,
    likes: 1,
    comments: 1,
    shares: 1,
    saves: 1,
    followers_gained: 1,
    profile_visits: 1,
    link_clicks: 1,
    source_kind: sourceKind,
  };
}

function contentRow(id: string, durationSeconds: number | null, sourceKind: string | null): ContentRow {
  return {
    id,
    platform: "youtube",
    title: id,
    format: "video",
    topic: "umum",
    published_at: "2026-10-05T09:00:00+07:00",
    views: 1,
    likes: 1,
    comments: 1,
    shares: 1,
    saves: 1,
    link_clicks: 1,
    duration_seconds: durationSeconds,
    source_kind: sourceKind,
  };
}

function audienceRow(id: string, dimension: string, sourceKind: string | null): AudienceRow {
  return {
    id,
    account_id: "acc-ig-uji",
    dimension,
    bucket: "25-34",
    value: 10,
    period_start: "lifetime",
    period_end: "lifetime",
    source_kind: sourceKind,
  };
}

function accountRow(): AccountRow {
  return {
    id: "acc-ig-uji",
    platform: "instagram",
    handle: "@uji",
    display_name: "Akun Uji",
    followers: 10,
    followers_start: 5,
    connection: "connected",
    scopes: JSON.stringify(["instagram_basic"]),
    last_sync_at: null,
    limitation: "",
  };
}

test("toSourceKind menjaga kosakata yang dikenal dan tidak menebak sisanya", () => {
  assert.equal(toSourceKind("platform-api"), "platform-api");
  assert.equal(toSourceKind("import"), "import");
  assert.equal(toSourceKind("seed"), "seed");
  assert.equal(toSourceKind("legacy-unknown"), "legacy-unknown");
  // NULL dari versi aplikasi lama dan label asing tidak dianggap data terukur.
  assert.equal(toSourceKind(null), "legacy-unknown");
  assert.equal(toSourceKind("website-tracker"), "legacy-unknown");
  assert.equal(toSourceKind(""), "legacy-unknown");
});

test("assembleDataset mengambil rentang, jendela pembanding, dan waktu bangkit dari meta", () => {
  const dataset = assembleDataset(META, rows());
  assert.deepEqual(dataset.range, { start: "2026-10-01", end: "2026-10-30", days: 30 });
  assert.deepEqual(dataset.history, { start: "2026-09-01", end: "2026-10-30", days: 60 });
  assert.equal(dataset.generatedAt, META.generated_at);
});

test("assembleDataset menyaring metrik sosial berdasarkan tanggal, bukan jumlah baris", () => {
  const dataset = assembleDataset(
    META,
    rows({
      social: [
        socialRow("2026-08-31", "seed"), // sebelum jendela pembanding
        socialRow("2026-09-01", "seed"), // batas awal, inklusif
        socialRow("2026-10-15", "seed"),
        socialRow("2026-10-30", "seed"), // batas akhir, inklusif
        socialRow("2026-10-31", "seed"), // setelah jendela pembanding
      ],
    }),
  );

  assert.deepEqual(
    dataset.social.map((row) => row.date),
    ["2026-09-01", "2026-10-15", "2026-10-30"],
  );
});

test("assembleDataset mempertahankan label provenance baris apa adanya", () => {
  const dataset = assembleDataset(
    META,
    rows({
      social: [
        socialRow("2026-10-01", "seed"),
        socialRow("2026-10-02", "platform-api"),
        socialRow("2026-10-03", "website-tracker"),
        socialRow("2026-10-04", null),
      ],
    }),
  );

  assert.deepEqual(
    dataset.social.map((row) => row.sourceKind),
    ["seed", "platform-api", "legacy-unknown", "legacy-unknown"],
  );
});

test("assembleDataset tidak mengubah durasi yang tidak dilaporkan menjadi nol", () => {
  const dataset = assembleDataset(
    META,
    rows({
      content: [contentRow("tanpa-durasi", null, "seed"), contentRow("dengan-durasi", 42, "platform-api")],
    }),
  );

  assert.equal(dataset.content[0].durationSeconds, null);
  assert.equal(dataset.content[1].durationSeconds, 42);
  assert.equal(dataset.content[1].sourceKind, "platform-api");
});

test("assembleDataset membuang dimensi demografi yang tidak dikenal, bukan menebaknya", () => {
  const dataset = assembleDataset(
    META,
    rows({
      audience: [
        audienceRow("1", "age", "seed"),
        audienceRow("2", "gender", "platform-api"),
        audienceRow("3", "hour_of_day", "seed"),
        audienceRow("4", "retention", null),
      ],
    }),
  );

  assert.deepEqual(
    dataset.audience.map((row) => row.dimension),
    ["age", "gender"],
  );
});

test("assembleDataset memetakan akun beserta izin izinnya", () => {
  const dataset = assembleDataset(META, rows({ accounts: [accountRow()] }));
  assert.equal(dataset.accounts[0].id, "acc-ig-uji");
  assert.deepEqual(dataset.accounts[0].scopes, ["instagram_basic"]);
  assert.equal(dataset.accounts[0].lastSyncAt, null);
});
