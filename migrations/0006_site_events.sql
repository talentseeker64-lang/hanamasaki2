-- Migrasi 0006: peristiwa website (pelacakan first-party) dan atribusi UTM.
--
-- Menjawab Phase 4 item 1 dan 2:
--   * item 1 — pelacakan website. Sebelum ini tidak ada tempat sama sekali untuk
--     menerima kunjungan nyata dari website, sehingga tahap `product visits`
--     pada corong penjualan tidak dapat dihitung dari apa pun.
--   * item 2 — atribusi UTM. Parameter kampanye disimpan apa adanya bersama
--     peristiwanya supaya hubungan konten -> kunjungan dapat diperiksa, bukan
--     disimpulkan dari tebakan.
--
-- Additive only: satu tabel baru, tidak ada tabel atau kolom yang dihapus,
-- diganti nama, atau diisi ulang secara paksa.
--
-- Batasan yang disengaja dan perlu diketahui:
--   * `source_kind` diperluas dengan nilai baru `first-party`. Kosakata lama
--     ('platform-api' / 'import' / 'seed' / 'legacy-unknown') tidak punya nilai
--     yang jujur untuk peristiwa yang diukur sistem kita sendiri: 'platform-api'
--     berarti panggilan API platform yang berhasil, dan 'import' berarti berkas
--     yang dimasukkan pengguna. Meminjam salah satunya akan membuat status
--     koneksi kanal sosial tampak terbukti oleh data yang bukan dari platform.
--     Batasan nilai tetap ditegakkan di lapisan aplikasi (`lib/data.ts`), bukan
--     lewat CHECK, karena SQLite tidak dapat menambahkan CHECK pada tabel yang
--     sudah ada tanpa membangun ulang tabelnya.
--   * `source_ref` WAJIB terisi dan unik. Nilainya adalah kunci idempotensi dari
--     pengirim, sehingga pengiriman ulang peristiwa yang sama (mis. percobaan
--     ulang setelah koneksi terputus) tidak menambah baris kedua. Tanpa kolom
--     ini, satu kunjungan dapat terhitung berkali-kali.
--   * `occurred_at` (jam browser) dan `received_at` (jam server) disimpan
--     terpisah. Selisihnya adalah bukti, bukan gangguan: jam perangkat pengunjung
--     bisa salah, dan menyamakannya dengan jam server akan menyembunyikan itu.
--   * `value` NULL berarti nilainya tidak dikirim atau peristiwanya bukan
--     pesanan — bukan nol. Memperlakukannya sebagai nol akan menurunkan rata-rata
--     nilai pesanan secara keliru.
--   * `utm_*` NULL berarti parameter kampanyenya memang tidak ada, berbeda dari
--     string kosong. Kunjungan tanpa UTM tetap dicatat apa adanya.
--   * Tidak ada backfill. Tabel ini kosong setelah migrasi, dan memang harus
--     kosong: belum ada satu pun peristiwa yang benar-benar diterima. Baris
--     pertama datang dari `POST /api/track`.
--
-- 1. Tabel peristiwa website -----------------------------------------------------

CREATE TABLE IF NOT EXISTS site_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  event_type TEXT NOT NULL,
  path TEXT NOT NULL,
  referrer TEXT,
  session_id TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  value REAL,
  currency TEXT,
  source_kind TEXT,
  source_ref TEXT NOT NULL
);

-- Kunci idempotensi. Pengiriman ulang dengan `source_ref` yang sama tidak
-- menghasilkan baris kedua, sehingga jumlah kunjungan tidak dapat dinaikkan
-- hanya dengan mengulang permintaan yang sama.
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_events_source_ref
  ON site_events (source_ref);

CREATE INDEX IF NOT EXISTS idx_site_events_occurred
  ON site_events (occurred_at);

CREATE INDEX IF NOT EXISTS idx_site_events_campaign
  ON site_events (utm_campaign);

-- 2. Pemeriksaan setelah migrasi -------------------------------------------------
--
-- Tabel baru harus ada dan kosong:
--
--   SELECT COUNT(*) FROM site_events;
--
-- Jumlah baris seluruh tabel lama tidak boleh berubah (migrasi ini tidak
-- menyentuhnya):
--
--   SELECT COUNT(*) FROM web_daily;
--   SELECT COUNT(*) FROM social_daily;
