import { getDb } from "./db";
import type { ProviderSyncResult } from "./providers";
import type {
  DataStatus,
  Integration,
  IntegrationKind,
  SyncJob,
  SyncJobStatus,
} from "./types";

/**
 * Registri integrasi dan riwayat sinkronisasi (migrasi 0004).
 *
 * Registri menjawab "sumber apa saja yang terhubung dan bagaimana statusnya";
 * riwayat menjawab "kapan terakhir berhasil, berapa baris yang tertulis, dan apa
 * pesan kegagalannya". Sebelum keduanya ada, kedua pertanyaan itu hanya bisa
 * ditebak dari isi tabel metrik.
 */

export interface IntegrationRow {
  id: string;
  kind: string;
  provider: string;
  account_id: string | null;
  tenant_id: string | null;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface SyncJobRow {
  id: string;
  integration_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  rows_written: number;
  message: string;
}

const INTEGRATION_COLUMNS =
  "id, kind, provider, account_id, tenant_id, status, last_sync_at, last_error, created_at";

const SYNC_JOB_COLUMNS =
  "id, integration_id, started_at, finished_at, status, rows_written, message";

const KINDS = new Set<IntegrationKind>([
  "social",
  "website",
  "utm",
  "whatsapp",
  "crm",
  "marketplace",
]);

const STATUSES = new Set<DataStatus>([
  "connected",
  "syncing",
  "synced",
  "stale",
  "error",
  "not_connected",
  "unavailable",
]);

const JOB_STATUSES = new Set<SyncJobStatus>(["running", "ok", "partial", "error"]);

/* ------------------------------------------------------------------ */
/* Pemetaan baris -> kontrak (murni, dapat diuji tanpa D1)             */
/* ------------------------------------------------------------------ */

/**
 * Membaca status integrasi dari basis data.
 *
 * Nilai yang tidak dikenal jatuh ke `error`, bukan `synced`: status yang tidak
 * dapat dibaca bukan alasan untuk menampilkan sumber sebagai sehat.
 */
export function toIntegration(row: IntegrationRow): Integration {
  const kind: IntegrationKind = KINDS.has(row.kind as IntegrationKind)
    ? (row.kind as IntegrationKind)
    : "social";
  const status: DataStatus = STATUSES.has(row.status as DataStatus)
    ? (row.status as DataStatus)
    : "error";
  return {
    id: row.id,
    kind,
    provider: row.provider,
    accountId: row.account_id,
    status,
    lastSyncAt: row.last_sync_at,
    lastError: row.last_error,
    createdAt: row.created_at,
  };
}

export function toSyncJob(row: SyncJobRow): SyncJob {
  const status: SyncJobStatus = JOB_STATUSES.has(row.status as SyncJobStatus)
    ? (row.status as SyncJobStatus)
    : "error";
  return {
    id: row.id,
    integrationId: row.integration_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status,
    rowsWritten: row.rows_written,
    message: row.message,
  };
}

/** Identitas integrasi sosial untuk satu akun. */
export function integrationIdForAccount(accountId: string): string {
  return `account:${accountId}`;
}

/**
 * Status integrasi setelah sinkronisasi berhasil.
 *
 * `written > 0` berarti ada angka baru yang benar-benar tertulis, sehingga
 * sumbernya layak disebut `synced`. Bila tidak ada yang tertulis (mis. analitik
 * YouTube belum tersedia), sumbernya tetap `connected` — bukan `synced`, karena
 * tidak ada data baru yang bisa ditunjukkan.
 */
export function integrationStatusAfterSync(result: ProviderSyncResult): DataStatus {
  if (result.status === "error") return "error";
  return result.written > 0 ? "synced" : "connected";
}

/** Status riwayat (sync_jobs) untuk hasil penyedia. */
export function syncJobStatusOf(status: ProviderSyncResult["status"]): SyncJobStatus {
  if (status === "error") return "error";
  return status === "skipped" ? "partial" : "ok";
}

/* ------------------------------------------------------------------ */
/* Akses basis data                                                    */
/* ------------------------------------------------------------------ */

/**
 * Tenant aktif bila organisasi sudah ada, atau `null` bila belum.
 *
 * Berbeda dari `currentTenantId` di `lib/sync.ts` yang gagal cepat untuk
 * penulisan, pembacaan registri hanya perlu tahu tenant mana yang boleh dilihat.
 */
export async function tenantScope(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare("SELECT id FROM organization ORDER BY id LIMIT 1")
    .first<{ id: string }>();
  return row?.id ?? null;
}

/**
 * Mendaftarkan integrasi sosial untuk sebuah akun, atau menyegarkan
 * penyedia/kepemiliknya bila sudah terdaftar.
 *
 * Status tidak ikut ditimpa di sini: pendaftaran ulang tidak boleh menghapus
 * jejak `error` atau `synced` yang sudah tercatat.
 */
export async function ensureAccountIntegration(
  db: D1Database,
  input: { accountId: string; provider: string; tenantId: string | null },
): Promise<string> {
  const id = integrationIdForAccount(input.accountId);
  await db
    .prepare(
      `INSERT INTO integrations (id, kind, provider, account_id, tenant_id, status, last_sync_at, last_error, created_at)
       VALUES (?, 'social', ?, ?, ?, 'not_connected', NULL, NULL, ?)
       ON CONFLICT (id) DO UPDATE SET
         provider = excluded.provider,
         tenant_id = COALESCE(integrations.tenant_id, excluded.tenant_id)`,
    )
    .bind(id, input.provider, input.accountId, input.tenantId, new Date().toISOString())
    .run();
  return id;
}

/**
 * Memperbarui status satu integrasi.
 *
 * `lastSyncAt` hanya diperbarui bila diberikan (`undefined` mempertahankan nilai
 * lama), sedangkan `lastError` selalu ditulis agar pesan lama tidak tertinggal
 * setelah sinkronisasi berikutnya berhasil.
 */
export async function markIntegration(
  db: D1Database,
  integrationId: string,
  patch: { status: DataStatus; lastSyncAt?: string | null; lastError?: string | null },
): Promise<void> {
  await db
    .prepare(
      `UPDATE integrations
          SET status = ?,
              last_sync_at = CASE WHEN ? IS NULL THEN last_sync_at ELSE ? END,
              last_error = ?
        WHERE id = ?`,
    )
    .bind(
      patch.status,
      patch.lastSyncAt ?? null,
      patch.lastSyncAt ?? null,
      patch.lastError ?? null,
      integrationId,
    )
    .run();
}

/** Mencatat awal satu tugas sinkronisasi dan mengembalikan id-nya. */
export async function startSyncJob(db: D1Database, integrationId: string): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO sync_jobs (id, integration_id, started_at, finished_at, status, rows_written, message)
       VALUES (?, ?, ?, NULL, 'running', 0, '')`,
    )
    .bind(id, integrationId, new Date().toISOString())
    .run();
  return id;
}

/** Menutup satu tugas sinkronisasi dengan hasil akhirnya. */
export async function finishSyncJob(
  db: D1Database,
  jobId: string,
  outcome: { status: SyncJobStatus; rowsWritten: number; message: string },
): Promise<void> {
  await db
    .prepare(
      `UPDATE sync_jobs
          SET finished_at = ?, status = ?, rows_written = ?, message = ?
        WHERE id = ?`,
    )
    .bind(new Date().toISOString(), outcome.status, outcome.rowsWritten, outcome.message, jobId)
    .run();
}

/** Daftar integrasi, tersaring per tenant. */
export async function listIntegrations(tenantId: string | null): Promise<Integration[]> {
  const db = await getDb();
  const where = tenantId ? " WHERE (tenant_id = ? OR tenant_id IS NULL)" : "";
  const statement = db.prepare(
    `SELECT ${INTEGRATION_COLUMNS} FROM integrations${where} ORDER BY kind, provider, id`,
  );
  const result = tenantId
    ? await statement.bind(tenantId).all<IntegrationRow>()
    : await statement.all<IntegrationRow>();
  return (result.results ?? []).map(toIntegration);
}

/** Beberapa tugas sinkronisasi terakhir, untuk ditampilkan sebagai riwayat. */
export async function latestSyncJobs(limit = 10): Promise<SyncJob[]> {
  const db = await getDb();
  const result = await db
    .prepare(`SELECT ${SYNC_JOB_COLUMNS} FROM sync_jobs ORDER BY started_at DESC LIMIT ?`)
    .bind(Math.max(1, limit))
    .all<SyncJobRow>();
  return (result.results ?? []).map(toSyncJob);
}
