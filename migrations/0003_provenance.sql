-- Migrasi 0003: provenance (asal data) dan kepemilikan (tenant).
--
-- Menjawab temuan audit T-1 (baris hasil sinkronisasi API dan baris seed ilustratif
-- tidak dapat dibedakan sama sekali) dan T-4 (tidak ada kolom pemilik data).
--
-- Additive only: tidak ada tabel atau kolom yang dihapus, diganti nama, atau diisi
-- ulang secara paksa. Seluruh baris yang sudah ada tetap utuh; yang berubah hanya
-- kolom baru yang ditambahkan.
--
-- Batasan yang disengaja dan perlu diketahui:
--   * PRIMARY KEY social_daily tetap (date, platform). SQLite tidak dapat mengubah
--     kunci primer tanpa membangun ulang tabel, sehingga `tenant_id` di sini BELUM
--     memisahkan data antar tenant: dua tenant masih tidak dapat memiliki baris pada
--     tanggal dan platform yang sama. Pemisahan sesungguhnya menunggu migrasi
--     pembangunan ulang tabel saat multi-tenant benar-benar dipakai.
--   * Seluruh kolom baru nullable. Batasan nilai (mis. source_kind hanya boleh salah
--     satu dari 'platform-api' / 'import' / 'seed' / 'legacy-unknown') ditegakkan di
--     lapisan aplikasi, karena SQLite tidak dapat menambahkan CHECK pada tabel yang
--     sudah ada.
--   * `legacy-unknown` berarti "asal data tidak dapat dibuktikan". Nilai ini dipakai
--     alih-alih 'seed' supaya baris yang tidak dapat dipertanggungjawabkan tidak ikut
--     dihitung sebagai data bisnis maupun dihapus saat seed dijalankan.
--   * tenant_id dibiarkan NULL bila tabel organization masih kosong. NULL berarti
--     "belum ditetapkan" — bukan diisi nilai karangan.

-- 1. Kolom provenance dan tenant ------------------------------------------------

ALTER TABLE social_daily ADD COLUMN source_kind TEXT;
ALTER TABLE social_daily ADD COLUMN source_ref TEXT;
ALTER TABLE social_daily ADD COLUMN tenant_id TEXT;

ALTER TABLE content ADD COLUMN source_kind TEXT;
ALTER TABLE content ADD COLUMN source_ref TEXT;
ALTER TABLE content ADD COLUMN tenant_id TEXT;

ALTER TABLE comments ADD COLUMN source_kind TEXT;
ALTER TABLE comments ADD COLUMN source_ref TEXT;
ALTER TABLE comments ADD COLUMN tenant_id TEXT;

ALTER TABLE web_daily ADD COLUMN source_kind TEXT;
ALTER TABLE web_daily ADD COLUMN source_ref TEXT;
ALTER TABLE web_daily ADD COLUMN tenant_id TEXT;

ALTER TABLE sources ADD COLUMN source_kind TEXT;
ALTER TABLE sources ADD COLUMN tenant_id TEXT;

ALTER TABLE pages ADD COLUMN source_kind TEXT;
ALTER TABLE pages ADD COLUMN tenant_id TEXT;

ALTER TABLE search ADD COLUMN source_kind TEXT;
ALTER TABLE search ADD COLUMN tenant_id TEXT;

ALTER TABLE accounts ADD COLUMN source_kind TEXT;
ALTER TABLE accounts ADD COLUMN source_ref TEXT;
ALTER TABLE accounts ADD COLUMN tenant_id TEXT;

-- 2. Backfill -------------------------------------------------------------------
--
-- Berdasarkan inventaris baca-saja yang dijalankan sebelum migrasi ini
-- (docs/REMOTE_DATA_INVENTORY.md), seluruh baris pada TUJUH TABEL METRIK di bawah
-- berasal dari generator seed ilustratif (scripts/generate-seed.ts). Menandainya
-- 'seed' adalah pernyataan yang dapat dibuktikan dari sidik jari datanya, bukan
-- tebakan: jumlah baris, rentang tanggal, dan agregatnya identik dengan seed.sql.
--
-- Klausa `WHERE source_kind IS NULL` membuat pernyataan ini tidak akan menimpa baris
-- yang sudah pernah ditulis oleh sinkronisasi API (bila ada).

UPDATE social_daily SET source_kind = 'seed' WHERE source_kind IS NULL;
UPDATE content SET source_kind = 'seed' WHERE source_kind IS NULL;
UPDATE comments SET source_kind = 'seed' WHERE source_kind IS NULL;
UPDATE web_daily SET source_kind = 'seed' WHERE source_kind IS NULL;
UPDATE sources SET source_kind = 'seed' WHERE source_kind IS NULL;
UPDATE pages SET source_kind = 'seed' WHERE source_kind IS NULL;
UPDATE search SET source_kind = 'seed' WHERE source_kind IS NULL;

-- `accounts` DILARANG memakai aturan di atas.
--
-- Tabel ini bukan sekadar wadah data seed: barisnya diperbarui di tempat oleh
-- sinkronisasi API (`recordFollowers` menulis followers, connection, last_sync_at).
-- Pada basis data ini, akun contoh 'acc-yt' sudah berisi data nyata — satu baris yang
-- seluruh isinya berbeda dari seed, tetapi tetap memiliki id yang sama. Melabelinya
-- 'seed' akan membuat seed berikutnya menghapusnya.
--
-- Labelnya karena itu ditentukan dari bukti yang tersisa di baris itu sendiri, dalam
-- tiga langkah yang saling meniadakan sesuai urutannya:
--
--   1. last_sync_at terisi     -> pernah ditulis panggilan API yang berhasil.
--   2. id termasuk akun contoh -> berasal dari generator seed.
--   3. sisanya                 -> asalnya tidak dapat dipastikan. Dilarang dilabeli
--                                 seed; memakai 'legacy-unknown' agar tidak ikut
--                                 terhapus dan tidak dihitung sebagai data bisnis.
--
-- Daftar id akun contoh ditulis eksplisit karena migrasi harus tetap menghasilkan
-- jawaban yang sama walau generator seed berubah di kemudian hari.

UPDATE accounts SET source_kind = 'platform-api'
  WHERE source_kind IS NULL AND last_sync_at IS NOT NULL;

UPDATE accounts SET source_kind = 'seed'
  WHERE source_kind IS NULL AND id IN ('acc-ig', 'acc-tt', 'acc-yt', 'acc-fb');

UPDATE accounts SET source_kind = 'legacy-unknown'
  WHERE source_kind IS NULL;

-- source_ref = identitas baris di sistem asalnya, dipakai untuk deduplication.
-- Pada baris seed, sistem asalnya adalah generator seed itu sendiri.

UPDATE social_daily SET source_ref = 'seed:' || platform || ':' || date WHERE source_ref IS NULL;
UPDATE content SET source_ref = 'seed:' || id WHERE source_ref IS NULL;
UPDATE comments SET source_ref = 'seed:' || id WHERE source_ref IS NULL;
UPDATE web_daily SET source_ref = 'seed:' || date WHERE source_ref IS NULL;
UPDATE accounts SET source_ref = 'seed:' || id WHERE source_kind = 'seed' AND source_ref IS NULL;

-- source_ref untuk akun berlabel 'platform-api' dan 'legacy-unknown' sengaja
-- dibiarkan NULL: penulisan lama tidak merekam ID kanal di sistem platform, sehingga
-- identitas itu tidak dapat direkonstruksi. Mengisinya dengan nilai karangan akan
-- membuat provenance tampak lengkap padahal tidak. Penulisan baru mengisinya dari
-- `channel.id` / `igUserId` / `pageId` yang sebenarnya.

-- Tenant: satu organisasi yang sudah terdaftar di tabel organization.

UPDATE social_daily SET tenant_id = (SELECT id FROM organization ORDER BY id LIMIT 1) WHERE tenant_id IS NULL;
UPDATE content SET tenant_id = (SELECT id FROM organization ORDER BY id LIMIT 1) WHERE tenant_id IS NULL;
UPDATE comments SET tenant_id = (SELECT id FROM organization ORDER BY id LIMIT 1) WHERE tenant_id IS NULL;
UPDATE web_daily SET tenant_id = (SELECT id FROM organization ORDER BY id LIMIT 1) WHERE tenant_id IS NULL;
UPDATE sources SET tenant_id = (SELECT id FROM organization ORDER BY id LIMIT 1) WHERE tenant_id IS NULL;
UPDATE pages SET tenant_id = (SELECT id FROM organization ORDER BY id LIMIT 1) WHERE tenant_id IS NULL;
UPDATE search SET tenant_id = (SELECT id FROM organization ORDER BY id LIMIT 1) WHERE tenant_id IS NULL;
UPDATE accounts SET tenant_id = (SELECT id FROM organization ORDER BY id LIMIT 1) WHERE tenant_id IS NULL;

-- 3. Pemeriksaan setelah migrasi -------------------------------------------------
--
-- Jalankan manual dan bandingkan dengan angka sebelum migrasi; jumlah baris tidak
-- boleh berubah karena migrasi ini hanya menambah kolom.
--
--   SELECT 'social_daily' AS tabel, COUNT(*) AS baris FROM social_daily
--   UNION ALL SELECT 'content',   COUNT(*) FROM content
--   UNION ALL SELECT 'comments',  COUNT(*) FROM comments
--   UNION ALL SELECT 'web_daily', COUNT(*) FROM web_daily
--   UNION ALL SELECT 'accounts',  COUNT(*) FROM accounts;
--
-- Harus mengembalikan tepat satu kelompok, yaitu 'seed' — kecuali baris yang memang
-- sudah ditulis sinkronisasi API sebelum migrasi ini dijalankan.
--
--   SELECT source_kind, COUNT(*) FROM social_daily GROUP BY source_kind;
--
-- Untuk `accounts`, akun contoh yang pernah tersinkronisasi harus berlabel
-- 'platform-api' dan tidak boleh ada yang NULL:
--
--   SELECT source_kind, COUNT(*) FROM accounts GROUP BY source_kind;
--   SELECT COUNT(*) FROM accounts WHERE source_kind IS NULL;
--
-- Harus mengembalikan nol baris (tidak ada data yang belum punya tenant):
--
--   SELECT COUNT(*) FROM social_daily WHERE tenant_id IS NULL;
