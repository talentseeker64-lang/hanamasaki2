/**
 * Unit test untuk jalur tulis `lib/sync.ts` (Phase 1.3 item 13).
 *
 * Aturan yang diuji adalah aturan provenance yang paling penting: baris yang
 * sudah ada dan bukan berasal dari API platform **tidak boleh** ditimpa, karena
 * itu akan mengubah angka ilustratif menjadi angka yang seolah-olah terukur.
 *
 * D1 lokal tidak dapat dijalankan di Windows (`workerd.exe` crash), jadi D1
 * diganti objek tiruan yang mencatat setiap perintah tulis. Yang diuji tetap kode
 * produksi: `upsertDailySocial`, `recordAudience`, dan `currentTenantId`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { currentTenantId, recordAudience, upsertDailySocial } from "../lib/sync";
import type { AudiencePoint } from "../lib/types";
import { withCloudflareEnv } from "./fake-cloudflare";

interface Run {
  sql: string;
  params: unknown[];
}

interface AudienceRowFixture {
  dimension: string;
  bucket: string;
  source_kind: string | null;
}

class FakeStatement {
  db: FakeDb;
  sql: string;
  params: unknown[] = [];

  constructor(db: FakeDb, sql: string) {
    this.db = db;
    this.sql = sql;
  }

  bind(...params: unknown[]): FakeStatement {
    this.params = params;
    return this;
  }

  async first<T>(): Promise<T | null> {
    if (this.sql.includes("FROM organization")) {
      return (this.db.organization as T | null) ?? null;
    }
    if (this.sql.includes("FROM social_daily")) {
      return (this.db.socialRow as T | null) ?? null;
    }
    return null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    if (this.sql.includes("FROM audience_insights")) {
      return { results: this.db.audienceRows as unknown as T[] };
    }
    return { results: [] };
  }

  async run(): Promise<{ success: boolean }> {
    this.db.runs.push({ sql: this.sql, params: this.params });
    return { success: true };
  }
}

class FakeDb {
  organization: { id: string } | null;
  socialRow: { source_kind: string | null } | null;
  audienceRows: AudienceRowFixture[];
  runs: Run[] = [];

  constructor(
    options: {
      organization?: { id: string } | null;
      socialRow?: { source_kind: string | null } | null;
      audienceRows?: AudienceRowFixture[];
    } = {},
  ) {
    this.organization = options.organization === undefined ? { id: "org-1" } : options.organization;
    this.socialRow = options.socialRow ?? null;
    this.audienceRows = options.audienceRows ?? [];
  }

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this, sql);
  }

  async batch(statements: FakeStatement[]): Promise<Array<{ success: boolean }>> {
    for (const statement of statements) {
      this.runs.push({ sql: statement.sql, params: statement.params });
    }
    return statements.map(() => ({ success: true }));
  }
}

function asD1(db: FakeDb): D1Database {
  return db as unknown as D1Database;
}

/* ------------------------------------------------------------------ */
/* Kepemilikan data                                                    */
/* ------------------------------------------------------------------ */

test("currentTenantId gagal cepat bila tabel organization masih kosong", async () => {
  const db = new FakeDb({ organization: null });
  await withCloudflareEnv({ DB: asD1(db) }, async () => {
    await assert.rejects(() => currentTenantId(asD1(db)), /organization masih kosong/);
  });
});

test("currentTenantId mengembalikan pemilik data bila tersedia", async () => {
  const db = new FakeDb({ organization: { id: "org-7" } });
  await withCloudflareEnv({ DB: asD1(db) }, async () => {
    assert.equal(await currentTenantId(asD1(db)), "org-7");
  });
});

/* ------------------------------------------------------------------ */
/* Metrik harian: proteksi provenance                                  */
/* ------------------------------------------------------------------ */

test("upsertDailySocial memblokir penulisan bila baris berlabel seed", async () => {
  const db = new FakeDb({ socialRow: { source_kind: "seed" } });
  const result = await withCloudflareEnv({ DB: asD1(db) }, () =>
    upsertDailySocial("instagram", "2026-10-15", "ig:1", { views: 10 }),
  );

  assert.equal(result.status, "blocked");
  assert.equal(result.existingKind, "seed");
  assert.equal(db.runs.length, 0, "tidak boleh ada perintah tulis saat baris dilindungi");
});

test("upsertDailySocial memblokir penulisan bila baris lama belum berlabel asal data", async () => {
  const db = new FakeDb({ socialRow: { source_kind: null } });
  const result = await withCloudflareEnv({ DB: asD1(db) }, () =>
    upsertDailySocial("instagram", "2026-10-15", "ig:1", { views: 10 }),
  );

  assert.equal(result.status, "blocked");
  assert.equal(result.existingKind, null);
  assert.equal(db.runs.length, 0);
});

test("upsertDailySocial menulis hanya kolom yang diukur dan menandainya platform-api", async () => {
  const db = new FakeDb({ socialRow: { source_kind: "platform-api" } });
  const result = await withCloudflareEnv({ DB: asD1(db) }, () =>
    upsertDailySocial("instagram", "2026-10-15", "ig:1", { views: 10, likes: 2 }),
  );

  assert.equal(result.status, "written");
  assert.equal(db.runs.length, 1);

  const { sql, params } = db.runs[0];
  // Nilai jenis lain pada tanggal yang sama tidak boleh direset ke nol.
  assert.match(sql, /views = excluded\.views/);
  assert.match(sql, /likes = excluded\.likes/);
  assert.ok(!sql.includes("reach = excluded.reach"));
  // Penjaga provenance tetap ada di klausa WHERE, bukan hanya di kode aplikasi.
  assert.match(sql, /WHERE social_daily\.source_kind = 'platform-api'/);

  assert.equal(params[2], 10, "views");
  assert.equal(params[5], 2, "likes");
  assert.ok(params.includes("platform-api"));
  assert.ok(params.includes("ig:1"), "source_ref harus menyimpan identitas sistem asal");
  assert.ok(params.includes("org-1"), "tenant_id harus diisi pemilik data");
});

test("upsertDailySocial tidak menulis apa pun bila tidak ada angka terukur", async () => {
  const db = new FakeDb({ socialRow: { source_kind: "platform-api" } });
  const result = await withCloudflareEnv({ DB: asD1(db) }, () =>
    upsertDailySocial("instagram", "2026-10-15", "ig:1", {}),
  );

  assert.equal(result.status, "nothing-to-write");
  assert.equal(db.runs.length, 0);
});

/* ------------------------------------------------------------------ */
/* Demografi audiens: proteksi provenance                              */
/* ------------------------------------------------------------------ */

test("recordAudience melaporkan tidak tersedia bila platform tidak mengirim demografi", async () => {
  const db = new FakeDb();
  const result = await withCloudflareEnv({ DB: asD1(db) }, () =>
    recordAudience("acc-ig", "ig:demografi", null),
  );

  assert.deepEqual(result, { written: 0, blocked: 0, unavailable: true });
  assert.equal(db.runs.length, 0);
});

test("recordAudience tidak menimpa baris yang bukan platform-api", async () => {
  const db = new FakeDb({
    audienceRows: [{ dimension: "age", bucket: "25-34", source_kind: "seed" }],
  });
  const points: AudiencePoint[] = [{ dimension: "age", bucket: "25-34", value: 12 }];
  const result = await withCloudflareEnv({ DB: asD1(db) }, () =>
    recordAudience("acc-ig", "ig:demografi", points),
  );

  assert.equal(result.written, 0);
  assert.equal(result.blocked, 1);
  assert.equal(result.unavailable, false);
  assert.equal(db.runs.length, 0);
});

test("recordAudience menulis potongan baru dengan bucket yang diseragamkan", async () => {
  const db = new FakeDb();
  const points: AudiencePoint[] = [
    { dimension: "gender", bucket: "F", value: 55 },
    { dimension: "gender", bucket: "F", value: 55 },
  ];
  const result = await withCloudflareEnv({ DB: asD1(db) }, () =>
    recordAudience("acc-ig", "ig:demografi", points),
  );

  assert.equal(result.written, 1, "potongan kembar hanya ditulis sekali");
  assert.equal(db.runs.length, 1);
  const { sql, params } = db.runs[0];
  assert.match(sql, /'platform-api'/);
  assert.ok(params.includes("Perempuan"), "kode F dari platform diseragamkan ke label basis data");
  assert.ok(params.includes("acc-ig"));
  assert.ok(params.includes("org-1"), "tenant_id harus diisi pemilik data");
});

test("recordAudience membuang potongan tanpa bucket atau tanpa nilai terukur", async () => {
  const db = new FakeDb();
  const points = [
    { dimension: "age", bucket: "  ", value: 10 },
    { dimension: "age", bucket: "25-34", value: Number.NaN },
  ] as AudiencePoint[];
  const result = await withCloudflareEnv({ DB: asD1(db) }, () =>
    recordAudience("acc-ig", "ig:demografi", points),
  );

  assert.deepEqual(result, { written: 0, blocked: 0, unavailable: true });
  assert.equal(db.runs.length, 0);
});
