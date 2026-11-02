-- Registri integrasi dan riwayat sinkronisasi (Phase 2).
--
-- Additive only: hanya menambah tabel baru. Tidak ada DROP, RENAME, atau
-- perubahan pada tabel dan kolom yang sudah dipakai aplikasi.
--
-- Jalankan dengan: npx wrangler d1 migrations apply karambit --remote

-- Setiap sumber data yang terhubung terdaftar di sini beserta statusnya.
-- Tanpa registri, "apakah kanal ini masih tersambung dan kapan terakhir
-- diperbarui" hanya dapat ditebak dari tabel metrik.
CREATE TABLE integrations (
  id TEXT PRIMARY KEY,
  -- Kelompok sumber: social | website | utm | whatsapp | crm | marketplace
  kind TEXT NOT NULL,
  -- Penyedia konkret: meta | google | ga4 | shopee | ...
  provider TEXT NOT NULL,
  -- Kaitan ke akun bila berlaku (mis. akun sosial); NULL untuk sumber non-akun.
  account_id TEXT,
  tenant_id TEXT,
  -- Salah satu dari kosakata DataStatus (lihat lib/integrations.ts).
  status TEXT NOT NULL,
  last_sync_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_integrations_tenant_kind ON integrations (tenant_id, kind);

-- Riwayat setiap eksekusi sinkronisasi.
--
-- Sebelum ini, hasil syncAllAccounts() hanya hidup di memori lalu hilang,
-- sehingga tidak ada cara mengetahui kapan sebuah kanal terakhir berhasil
-- disinkronkan maupun berapa baris yang benar-benar tertulis.
CREATE TABLE sync_jobs (
  id TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  -- running | ok | partial | error
  status TEXT NOT NULL,
  -- Jumlah baris metrik yang benar-benar tertulis oleh tugas ini.
  rows_written INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL
);

CREATE INDEX idx_sync_jobs_integration_started ON sync_jobs (integration_id, started_at DESC);
