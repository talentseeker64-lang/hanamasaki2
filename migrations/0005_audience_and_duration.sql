-- Migrasi 0005: insight demografi audiens dan durasi konten.
--
-- Menjawab dua kebutuhan Phase 1.2:
--   * item 8 — sumber demografi audiens. Sebelum ini modul B tidak punya tempat
--     menyimpan demografi sama sekali, sehingga tiap kali ditampilkan angkanya
--     harus dikarang.
--   * item 9 — durasi konten masuk analitik. Durasi YouTube sebenarnya sudah
--     diambil `lib/youtube.ts` tetapi dibuang sebelum sampai ke tabel.
--
-- Additive only: satu tabel baru dan satu kolom baru. Tidak ada tabel atau kolom
-- yang dihapus, diganti nama, atau diisi ulang secara paksa.
--
-- Batasan yang disengaja dan perlu diketahui:
--   * `audience_insights.dimension` HANYA berisi `age` / `gender` / `country` /
--     `city`. `hour_of_day` (jam aktif audiens) tidak disediakan API mana pun,
--     dan `retention` hanya milik YouTube. Menyediakan kolomnya akan mengundang
--     pengisian dengan angka karangan, jadi keduanya sengaja tidak ada.
--   * Batasan nilai `dimension` dan `source_kind` ditegakkan di lapisan aplikasi,
--     bukan lewat CHECK, karena SQLite tidak dapat menambahkan CHECK pada tabel
--     yang sudah ada maupun yang baru dibuat dengan cara ini tanpa mengunci
--     daftar nilainya di skema.
--   * `content.duration_seconds` NULL berarti durasi TIDAK DIKETAHUI — bukan nol.
--     Konten bergambar (carousel/post/story) memang tidak punya durasi, dan
--     sebagian platform tidak melaporkannya. Memperlakukannya sebagai nol akan
--     memasukkan konten itu ke bucket "≤ 30 detik" secara keliru.
--   * `source_kind` mengikuti kosakata migrasi 0003:
--     'platform-api' / 'import' / 'seed' / 'legacy-unknown'.
--   * Tidak ada backfill massal di sini. Pada saat migrasi ini dibuat, belum ada
--     satu pun baris demografi yang tersimpan — datanya memang belum pernah
--     diambil. Baris pertama datang dari `lib/sync.ts` setelah panggilan API
--     berhasil, sehingga labelnya ditulis apa adanya oleh jalur tulis itu.

-- 1. Tabel demografi audiens ----------------------------------------------------

CREATE TABLE IF NOT EXISTS audience_insights (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  account_id TEXT NOT NULL,
  dimension TEXT NOT NULL,
  bucket TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 0,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  source_kind TEXT,
  source_ref TEXT
);

-- Satu potongan demografi per akun, dimensi, dan periode. Kunci ini membuat
-- penulisan ulang sinkronisasi bersifat idempoten: periode yang sama tidak
-- menghasilkan baris ganda. Dimensi nilai tunggal (mis. jenis kelamin) tetap
-- aman karena bucket-nya berbeda.
CREATE UNIQUE INDEX IF NOT EXISTS idx_audience_insights_key
  ON audience_insights (account_id, dimension, bucket, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_audience_insights_account
  ON audience_insights (account_id);

-- 2. Durasi konten ---------------------------------------------------------------

ALTER TABLE content ADD COLUMN duration_seconds INTEGER;

-- 3. Pemeriksaan setelah migrasi -------------------------------------------------
--
-- Tabel baru harus ada dan kosong (belum ada pengambilan demografi yang berhasil):
--
--   SELECT COUNT(*) FROM audience_insights;
--
-- Jumlah baris `content` tidak boleh berubah dan seluruh durasi masih NULL sampai
-- sinkronisasi YouTube berikutnya berjalan:
--
--   SELECT COUNT(*) FROM content;
--   SELECT COUNT(*) FROM content WHERE duration_seconds IS NOT NULL;
