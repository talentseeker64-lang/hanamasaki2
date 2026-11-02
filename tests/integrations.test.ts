/**
 * Unit test untuk `lib/integrations.ts` (Phase 2 item 1 dan 2).
 *
 * Dua kelompok diuji: pemetaan baris ke kontrak — murni, tanpa basis data — dan
 * jalur tulis/registri memakai D1 tiruan. D1 lokal tidak dapat dijalankan di
 * Windows (`workerd.exe` crash), jadi perintah SQL ditangkap dan diperiksa
 * bentuknya, bukan dieksekusi.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type IntegrationRow,
  type SyncJobRow,
  ensureAccountIntegration,
  finishSyncJob,
  integrationIdForAccount,
  integrationStatusAfterSync,
  latestSyncJobs,
  listIntegrations,
  markIntegration,
  startSyncJob,
  syncJobStatusOf,
  tenantScope,
  toIntegration,
  toSyncJob,
} from "../lib/integrations";
import { withCloudflareEnv } from "./fake-cloudflare";

/* ------------------------------------------------------------------ */
/* Pemetaan baris -> kontrak                                           */
/* ------------------------------------------------------------------ */

const integrationRow: IntegrationRow = {
  id: "account:acc-ig",
  kind: "social",
  provider: "meta",
  account_id: "acc-ig",
  tenant_id: "org-1",
  status: "synced",
  last_sync_at: "2026-10-15T00:00:00.000Z",
  last_error: null,
  created_at: "2026-10-01T00:00:00.000Z",
};

test("toIntegration memetakan baris ke kontrak baca", () => {
  assert.deepEqual(toIntegration(integrationRow), {
    id: "account:acc-ig",
    kind: "social",
    provider: "meta",
    accountId: "acc-ig",
    status: "synced",
    lastSyncAt: "2026-10-15T00:00:00.000Z",
    lastError: null,
    createdAt: "2026-10-01T00:00:00.000Z",
  });
});

test("toIntegration tidak menampilkan status tak dikenal sebagai sukses", () => {
  assert.equal(toIntegration({ ...integrationRow, status: "entah" }).status, "error");
  assert.equal(toIntegration({ ...integrationRow, kind: "entah" }).kind, "social");
});

test("toSyncJob jatuh ke error hanya untuk status yang tak dikenal", () => {
  const row: SyncJobRow = {
    id: "job-1",
    integration_id: "account:acc-ig",
    started_at: "2026-10-15T00:00:00.000Z",
    finished_at: null,
    status: "running",
    rows_written: 0,
    message: "",
  };

  assert.equal(toSyncJob(row).status, "running");
  assert.equal(toSyncJob({ ...row, status: "entah" }).status, "error");
});

test("integrationIdForAccount memakai awalan yang stabil", () => {
  assert.equal(integrationIdForAccount("acc-ig-hanamasak"), "account:acc-ig-hanamasak");
});

test("integrationStatusAfterSync hanya menandai synced bila ada baris tertulis", () => {
  const base = { sourceKind: "platform-api", message: "" } as const;

  assert.equal(integrationStatusAfterSync({ ...base, status: "ok", written: 3 }), "synced");
  assert.equal(integrationStatusAfterSync({ ...base, status: "ok", written: 0 }), "connected");
  assert.equal(integrationStatusAfterSync({ ...base, status: "skipped", written: 0 }), "connected");
  assert.equal(integrationStatusAfterSync({ ...base, status: "error", written: 0 }), "error");
});

test("syncJobStatusOf menerjemahkan hasil penyedia ke status riwayat", () => {
  assert.equal(syncJobStatusOf("ok"), "ok");
  assert.equal(syncJobStatusOf("skipped"), "partial");
  assert.equal(syncJobStatusOf("error"), "error");
});

/* ------------------------------------------------------------------ */
/* D1 tiruan                                                           */
/* ------------------------------------------------------------------ */

interface Executed {
  sql: string;
  params: unknown[];
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
    return null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    this.db.reads.push({ sql: this.sql, params: this.params });
    if (this.sql.includes("FROM integrations")) {
      return { results: this.db.integrationRows as unknown as T[] };
    }
    if (this.sql.includes("FROM sync_jobs")) {
      return { results: this.db.syncJobRows as unknown as T[] };
    }
    return { results: [] };
  }

  async run(): Promise<{ success: boolean }> {
    this.db.writes.push({ sql: this.sql, params: this.params });
    return { success: true };
  }
}

class FakeDb {
  organization: { id: string } | null;
  integrationRows: IntegrationRow[];
  syncJobRows: SyncJobRow[];
  reads: Executed[] = [];
  writes: Executed[] = [];

  constructor(
    options: {
      organization?: { id: string } | null;
      integrationRows?: IntegrationRow[];
      syncJobRows?: SyncJobRow[];
    } = {},
  ) {
    this.organization = options.organization === undefined ? { id: "org-1" } : options.organization;
    this.integrationRows = options.integrationRows ?? [];
    this.syncJobRows = options.syncJobRows ?? [];
  }

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this, sql);
  }
}

function asD1(db: FakeDb): D1Database {
  return db as unknown as D1Database;
}

test("tenantScope mengembalikan organisasi aktif bila ada", async () => {
  const db = new FakeDb({ organization: { id: "org-9" } });
  assert.equal(await tenantScope(asD1(db)), "org-9");
});

test("tenantScope mengembalikan null tanpa gagal bila organisasi belum ada", async () => {
  const db = new FakeDb({ organization: null });
  assert.equal(await tenantScope(asD1(db)), null);
});

test("ensureAccountIntegration tidak menimpa status yang sudah tercatat", async () => {
  const db = new FakeDb();
  const id = await ensureAccountIntegration(asD1(db), {
    accountId: "acc-ig",
    provider: "meta",
    tenantId: "org-1",
  });

  assert.equal(id, "account:acc-ig");
  assert.equal(db.writes.length, 1);

  const { sql, params } = db.writes[0];
  assert.match(sql, /ON CONFLICT \(id\) DO UPDATE/);
  assert.ok(!/status = excluded\.status/.test(sql), "pendaftaran ulang tidak boleh menghapus jejak status");
  assert.ok(params.includes("acc-ig"));
  assert.ok(params.includes("meta"));
  assert.ok(params.includes("org-1"));
});

test("markIntegration menulis waktu sinkronisasi bila diberikan", async () => {
  const db = new FakeDb();
  await markIntegration(asD1(db), "account:acc-ig", {
    status: "synced",
    lastSyncAt: "2026-10-15T00:00:00.000Z",
    lastError: null,
  });

  const { sql, params } = db.writes[0];
  assert.match(sql, /last_sync_at = CASE WHEN \? IS NULL THEN last_sync_at ELSE \? END/);
  assert.deepEqual(params, [
    "synced",
    "2026-10-15T00:00:00.000Z",
    "2026-10-15T00:00:00.000Z",
    null,
    "account:acc-ig",
  ]);
});

test("markIntegration mempertahankan waktu lama bila tidak diberi waktu baru", async () => {
  const db = new FakeDb();
  await markIntegration(asD1(db), "account:acc-ig", { status: "error", lastError: "kuota habis" });

  assert.deepEqual(db.writes[0].params, ["error", null, null, "kuota habis", "account:acc-ig"]);
});

test("startSyncJob mencatat tugas baru berstatus running", async () => {
  const db = new FakeDb();
  const jobId = await startSyncJob(asD1(db), "account:acc-ig");

  assert.ok(jobId.length > 0);
  const { sql, params } = db.writes[0];
  assert.match(sql, /'running'/);
  assert.equal(params[0], jobId);
  assert.equal(params[1], "account:acc-ig");
});

test("finishSyncJob menutup tugas dengan hasil dan pesannya", async () => {
  const db = new FakeDb();
  await finishSyncJob(asD1(db), "job-1", {
    status: "partial",
    rowsWritten: 2,
    message: "analitik belum tersedia",
  });

  const { sql, params } = db.writes[0];
  assert.match(sql, /SET finished_at = \?/);
  assert.equal(params[1], "partial");
  assert.equal(params[2], 2);
  assert.equal(params[3], "analitik belum tersedia");
  assert.equal(params[4], "job-1");
});

test("listIntegrations menyaring per tenant dan memetakan hasilnya", async () => {
  const db = new FakeDb({ integrationRows: [integrationRow] });
  const rows = await withCloudflareEnv({ DB: asD1(db) }, () => listIntegrations("org-1"));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].provider, "meta");
  assert.match(db.reads[0].sql, /WHERE \(tenant_id = \? OR tenant_id IS NULL\)/);
  assert.deepEqual(db.reads[0].params, ["org-1"]);
});

test("listIntegrations tidak menyaring bila tenant belum ditetapkan", async () => {
  const db = new FakeDb();
  await withCloudflareEnv({ DB: asD1(db) }, () => listIntegrations(null));

  assert.ok(!db.reads[0].sql.includes("WHERE"));
  assert.deepEqual(db.reads[0].params, []);
});

test("latestSyncJobs membatasi jumlah baris dan memetakannya", async () => {
  const db = new FakeDb({
    syncJobRows: [
      {
        id: "job-1",
        integration_id: "account:acc-ig",
        started_at: "2026-10-15T01:00:00.000Z",
        finished_at: "2026-10-15T01:00:05.000Z",
        status: "ok",
        rows_written: 4,
        message: "selesai",
      },
    ],
  });

  const jobs = await withCloudflareEnv({ DB: asD1(db) }, () => latestSyncJobs(5));
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].rowsWritten, 4);
  assert.deepEqual(db.reads[0].params, [5]);
});

test("latestSyncJobs memaksa batas minimal satu baris", async () => {
  const db = new FakeDb();
  await withCloudflareEnv({ DB: asD1(db) }, () => latestSyncJobs(0));
  assert.deepEqual(db.reads[0].params, [1]);
});
