# DATABASE_MIGRATION_PLAN

Rencana perubahan skema D1 dari kondisi saat ini menuju arsitektur target.

Tanggal: 2026-10-31 · Commit acuan: `255eb0b` · Database: `karambit`

> **Status: rencana. Belum ada migrasi yang dijalankan.**

---

## 1. Prinsip yang dipegang

1. **Audit before migration.** Skema yang ada sudah diperiksa seluruhnya
   (13 tabel, 2 migrasi) sebelum dokumen ini disusun.
2. **Additive only.** Tidak ada `DROP TABLE`, tidak ada `DROP COLUMN`, tidak ada
   `RENAME` pada tabel atau kolom yang sudah dipakai aplikasi.
3. **Tidak mengganti nama tabel.** Nama konseptual pada brief dipetakan ke nama
   yang sudah ada (bagian 3), bukan sebaliknya.
4. **Kolom baru selalu nullable lebih dulu**, lalu di-backfill, baru dipakai.
   SQLite tidak dapat menambah kolom `NOT NULL` tanpa nilai bawaan, dan tidak dapat
   menambah batasan (`CHECK`, `FOREIGN KEY`) pada tabel yang sudah ada tanpa
   membangun ulang tabel. Batasan ditegakkan di lapisan aplikasi.
5. **Setiap migrasi dapat dijalankan pada data yang sudah ada** tanpa kehilangan
   data. Data lama tidak ditimpa, hanya dilengkapi.
6. **Pencocokan jumlah baris sebelum dan sesudah** setiap migrasi dijalankan.

### 1.1 Alur kerja (dipaksa oleh keterbatasan lingkungan)

D1 lokal **tidak dapat dipakai** di lingkungan pengembang ini — `workerd.exe`
mengalami crash (access violation) di Windows. Karena itu seluruh migrasi
dijalankan ke database remote:

```powershell
npx wrangler d1 migrations apply karambit --remote
```

Sebelum menjalankan, periksa daftar migrasi yang belum diterapkan:

```powershell
npx wrangler d1 migrations list karambit --remote
```

Dan hitung baris tabel terdampak sebelum/sesudah:

```powershell
npx wrangler d1 execute karambit --remote --command "SELECT COUNT(*) FROM social_daily"
```

---

## 2. Skema saat ini (13 tabel)

| Migrasi | Tabel |
| --- | --- |
| `0001_init.sql` | `dataset_meta`, `accounts`, `social_daily`, `content`, `comments`, `web_daily`, `sources`, `pages`, `search` |
| `0002_settings_and_credentials.sql` | `organization`, `team_members`, `notifications`, `account_credentials` |

Ciri yang perlu diperhatikan:

- Tidak ada satu pun `FOREIGN KEY`.
- Tidak ada kolom pemilik (tenant) di tabel data.
- Tidak ada kolom penanda asal data.
- `social_daily` berisi campuran baris hasil sinkronisasi API dan baris seed
  ilustratif, tanpa cara membedakannya.

---

## 3. Pemetaan nama konseptual → nama yang ada

Sesuai *preserve before replace*, nama pada brief **tidak** dipakai untuk mengganti
tabel yang sudah ada.

| Nama di brief | Nama aktual | Keputusan |
| --- | --- | --- |
| `social_accounts` | `accounts` | **Pertahankan** `accounts` |
| `channel_metrics` | `social_daily` | **Pertahankan** `social_daily` |
| `social_posts` | `content` | **Pertahankan** `content` |
| `post_metrics` | *(kolom di `content`)* | **Pertahankan** sebagai kolom, bukan tabel baru |
| `integrations` | — | **Baru** (migrasi 0004) |
| `sync_jobs` | — | **Baru** (migrasi 0004) |
| `audience_insights` | — | **Baru** (migrasi 0005) |
| `tracking_links` | — | **Baru** (migrasi 0006) |
| `leads`, `orders`, `order_items`, `revenue_events`, `conversion_touchpoints` | — | **Baru** (migrasi 0007) |
| `ai_recommendations`, `recommendation_evidence` | — | **Baru** (migrasi 0008) |
| `experiments`, `experiment_results` | — | **Baru** (migrasi 0009) |
| `competitor_accounts`, `competitor_posts` | — | **Baru** (migrasi 0010) |

---

## 4. Migrasi 0003 — Provenance, tenant, dan rentang waktu

**Prioritas: pemblokir. Harus dikerjakan pertama.**

Menjawab temuan T-1 (tidak ada provenance), T-3 (jendela berbasis posisi), dan T-4
(multi-tenancy).

### 4.1 Kolom yang ditambahkan

| Tabel | Kolom baru | Tipe | Keterangan |
| --- | --- | --- | --- |
| `social_daily` | `source_kind` | TEXT | `platform-api` / `import` / `seed` |
| `social_daily` | `source_ref` | TEXT | Identitas di sistem asal, untuk deduplication |
| `social_daily` | `tenant_id` | TEXT | Pemilik data |
| `content` | `source_kind`, `source_ref`, `tenant_id` | TEXT | idem |
| `comments` | `source_kind`, `source_ref`, `tenant_id` | TEXT | idem |
| `web_daily` | `source_kind`, `source_ref`, `tenant_id` | TEXT | idem |
| `sources` | `source_kind`, `tenant_id` | TEXT | idem |
| `pages` | `source_kind`, `tenant_id` | TEXT | idem |
| `search` | `source_kind`, `tenant_id` | TEXT | idem |
| `accounts` | `tenant_id` | TEXT | idem |

### 4.2 Backfill

```sql
-- Semua baris yang ada sekarang berasal dari generator seed ilustratif.
-- Menandainya 'seed' adalah pernyataan yang benar, bukan tebakan.
UPDATE social_daily SET source_kind = 'seed' WHERE source_kind IS NULL;
UPDATE content      SET source_kind = 'seed' WHERE source_kind IS NULL;
UPDATE comments     SET source_kind = 'seed' WHERE source_kind IS NULL;
UPDATE web_daily    SET source_kind = 'seed' WHERE source_kind IS NULL;
UPDATE sources      SET source_kind = 'seed' WHERE source_kind IS NULL;
UPDATE pages        SET source_kind = 'seed' WHERE source_kind IS NULL;
UPDATE search       SET source_kind = 'seed' WHERE source_kind IS NULL;

-- Tenant tunggal untuk saat ini, diambil dari organization yang sudah ada.
UPDATE social_daily SET tenant_id = (SELECT id FROM organization LIMIT 1) WHERE tenant_id IS NULL;
```

Baris yang ditulis `lib/sync.ts` sesudah migrasi ini diisi `source_kind = 'platform-api'`
oleh kode, bukan oleh SQL.

### 4.3 Dampak ke kode

| Berkas | Perubahan |
| --- | --- |
| `lib/sync.ts` | `upsertDailySocial` dan `recordFollowers` menulis `source_kind = 'platform-api'` dan `source_ref` |
| `lib/data.ts` | `SELECT *` diganti kolom eksplisit; ditambah penyaring `tenant_id` |
| `lib/data.ts` | Ditambah penyaringan rentang tanggal untuk `social_daily` |
| `lib/metrics.ts` | `aggregatePlatform` tidak lagi memakai `slice` berbasis posisi |
| `lib/types.ts` | `DailySocialMetric`, `ContentItem`, dll. menerima `sourceKind` |
| `components/AppShell.tsx` | Badge global "Data ilustratif" diganti penanda per angka |

### 4.4 Kriteria selesai

- Setiap baris di tujuh tabel metrik memiliki `source_kind` yang terisi.
- Dashboard dapat membedakan baris `platform-api` dari `seed` dan menampilkan
  pembedaannya.
- Perbandingan periode tetap benar walau hanya satu kanal yang tersinkronisasi.

---

## 5. Migrasi 0004 — Registri integrasi dan riwayat sinkronisasi

Menjawab kebutuhan Phase 2.

### 5.1 `integrations`

| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| `id` | TEXT PRIMARY KEY | |
| `kind` | TEXT | `social` / `website` / `utm` / `whatsapp` / `crm` / `marketplace` |
| `provider` | TEXT | `meta`, `google`, `ga4`, `shopee`, … |
| `account_id` | TEXT | Nullable; kaitan ke `accounts` bila berlaku |
| `tenant_id` | TEXT | |
| `status` | TEXT | Salah satu dari 7 status data |
| `last_sync_at` | TEXT | Nullable |
| `last_error` | TEXT | Nullable |
| `created_at` | TEXT | |

### 5.2 `sync_jobs`

| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| `id` | TEXT PRIMARY KEY | |
| `integration_id` | TEXT | |
| `started_at` | TEXT | |
| `finished_at` | TEXT | Nullable |
| `status` | TEXT | `running` / `ok` / `partial` / `error` |
| `rows_written` | INTEGER | Jumlah baris yang benar-benar tertulis |
| `message` | TEXT | |

Manfaat langsung: hari ini `syncAllAccounts()` mengembalikan hasil dalam memori dan
hasilnya hilang. Tanpa riwayat, tidak ada cara mengetahui kapan sebuah kanal terakhir
berhasil disinkronkan, dan status `stale` tidak dapat dihitung.

---

## 6. Migrasi 0005 — Insight audiens

Untuk modul B, **hanya untuk metrik yang benar-benar tersedia**.

### 6.1 `audience_insights`

| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| `id` | TEXT PRIMARY KEY | |
| `tenant_id` | TEXT | |
| `account_id` | TEXT | |
| `dimension` | TEXT | `age` / `gender` / `country` / `city` |
| `bucket` | TEXT | Nilai dimensi, mis. `25-34` |
| `value` | REAL | Proporsi atau jumlah |
| `period_start` | TEXT | |
| `period_end` | TEXT | |
| `source_kind` | TEXT | |
| `source_ref` | TEXT | |

Catatan penting: tabel ini **tidak** menyediakan dimensi `hour_of_day` atau
`retention`. Keduanya tidak tersedia via API untuk platform mana pun (jam aktif) atau
hanya tersedia untuk YouTube (retensi). Menyediakan kolomnya akan mengundang
pengisian dengan angka karangan.

### 6.2 Durasi konten

```sql
ALTER TABLE content ADD COLUMN duration_seconds INTEGER;
```

Null berarti durasi tidak diketahui — bukan nol.

---

## 7. Migrasi 0006 — Pelacakan (website dan UTM)

Prasyarat Phase 4, dikerjakan lebih dulu karena tidak bergantung pihak ketiga.

### 7.1 `tracking_links`

| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| `id` | TEXT PRIMARY KEY | Token pendek yang dipakai di bio/deskripsi |
| `tenant_id` | TEXT | |
| `destination_url` | TEXT | |
| `utm_source` | TEXT | |
| `utm_medium` | TEXT | |
| `utm_campaign` | TEXT | |
| `utm_content` | TEXT | Pemisah antar konten |
| `content_id` | TEXT | Nullable; kaitan ke `content` |
| `created_at` | TEXT | |

### 7.2 `tracking_events`

| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| `id` | TEXT PRIMARY KEY | |
| `tenant_id` | TEXT | |
| `link_id` | TEXT | Nullable |
| `event_type` | TEXT | `click` / `page_view` / `product_view` |
| `occurred_at` | TEXT | |
| `session_ref` | TEXT | Anonim; untuk deduplikasi |
| `source_kind` | TEXT | `website-tracker` |
| `source_ref` | TEXT | Untuk deduplication saat pengiriman ulang |

Aturan: `tracking_events` menerima peristiwa berulang (at-least-once) dan
mendeduplikasi lewat `source_ref`. Pengiriman ulang tidak boleh menambah angka.

---

## 8. Migrasi 0007 — Penjualan

Dikerjakan **setelah** migrasi 0003 (tenant) dan hanya untuk integrasi yang sudah
terbukti berjalan.

| Tabel | Isi pokok | Catatan |
| --- | --- | --- |
| `leads` | `id`, `tenant_id`, `source_kind`, `source_ref`, `channel`, `status`, `created_at` | Sumber: WhatsApp atau CRM |
| `orders` | `id`, `tenant_id`, `source_kind`, `source_ref`, `ordered_at`, `status`, `currency`, `total` | Status wajib menyertakan batal dan refund |
| `order_items` | `id`, `order_id`, `product_ref`, `quantity`, `unit_price` | |
| `revenue_events` | `id`, `tenant_id`, `order_id`, `event_type`, `amount`, `currency`, `occurred_at` | `sale` / `refund` / `cancellation` |
| `conversion_touchpoints` | `id`, `tenant_id`, `order_id`, `content_id`, `link_id`, `touch_type`, `occurred_at`, `attribution_model` | Menyimpan model atribusi yang dipakai |

Aturan yang tidak boleh dilanggar:

- **Mata uang wajib disimpan per transaksi.** Menjumlahkan lintas mata uang tanpa
  konversi menghasilkan angka yang salah.
- **Refund dan pembatalan mengurangi pendapatan.** Tanpa itu, revenue terlihat lebih
  besar daripada kenyataan.
- **Setiap baris menyimpan `source_kind` dan `source_ref`** untuk penelusuran.
- **`attribution_model` disimpan bersama sentuhan.** Klaim atribusi tanpa metode
  yang tercatat tidak boleh disajikan sebagai fakta.

---

## 9. Migrasi 0008 — Rekomendasi AI

Hanya dijalankan setelah Phase 1 selesai.

### 9.1 `ai_recommendations`

| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| `id` | TEXT PRIMARY KEY | |
| `tenant_id` | TEXT | |
| `title`, `objective`, `recommendation` | TEXT | Isi rekomendasi |
| `actions` | TEXT | JSON array |
| `data_limitations` | TEXT | JSON array |
| `confidence` | TEXT | `low` / `medium` / `high` |
| `model_version` | TEXT | Untuk reproduksibilitas |
| `prompt_version` | TEXT | Untuk reproduksibilitas |
| `created_at` | TEXT | |

### 9.2 `recommendation_evidence`

| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| `id` | TEXT PRIMARY KEY | |
| `recommendation_id` | TEXT | |
| `metric` | TEXT | Nama metrik |
| `actual_value` | REAL | Nullable |
| `period_start`, `period_end` | TEXT | **Wajib** — periode pengukuran |
| `source_kind` | TEXT | **Wajib** — asal angka |
| `source_ref` | TEXT | Nullable |

Tabel ini adalah mekanisme penegakan aturan "tidak ada rekomendasi tanpa bukti".
Rekomendasi yang tidak punya baris di sini tidak boleh ditampilkan.

Opsional, untuk Phase 6:

| Tabel | Isi |
| --- | --- |
| `recommendation_outcomes` | Hasil terukur setelah rekomendasi dijalankan |

---

## 10. Migrasi 0009 — Eksperimen

| Tabel | Isi pokok |
| --- | --- |
| `experiments` | `id`, `tenant_id`, `hypothesis`, `metric`, `variant_a`, `variant_b`, `started_at`, `ended_at`, `status` |
| `experiment_results` | `id`, `experiment_id`, `variant`, `metric_value`, `sample_size`, `measured_at` |

Definisi hipotesis dan metrik keberhasilan wajib diisi sebelum eksperimen dijalankan.
Tanpa itu, hasilnya tidak dapat dinilai.

---

## 11. Migrasi 0010 — Kompetitor

| Tabel | Isi pokok |
| --- | --- |
| `competitor_accounts` | `id`, `tenant_id`, `platform`, `handle`, `external_id`, `tracked_since` |
| `competitor_posts` | `id`, `competitor_id`, `external_id`, `published_at`, `format`, `views`, `likes`, `comments`, `shares`, `fetched_at` |

Peringatan: untuk akun yang bukan milik pengguna, ketersediaan metrik jauh lebih
terbatas. Kolom tetap nullable, dan metrik yang tidak tersedia dibiarkan `NULL` —
bukan diisi nol.

Dedup memakai (`competitor_id`, `external_id`).

---

## 12. Ringkasan urutan migrasi

| Migrasi | Isi | Fase | Prasyarat |
| --- | --- | --- | --- |
| `0003` | Provenance, tenant, rentang | 1.1 | — |
| `0004` | Integrasi + riwayat sinkronisasi | 2 | 0003 |
| `0005` | Insight audiens + durasi konten | 1.2 / 2 | 0003 |
| `0006` | Pelacakan website dan UTM | 4 | 0003, 0004 |
| `0007` | Leads, order, revenue, atribusi | 4 | 0006 |
| `0008` | Rekomendasi AI + bukti | 5 | 0003 |
| `0009` | Eksperimen | 6 | 0008 |
| `0010` | Kompetitor | 6 | 0003 |

`0003` adalah satu-satunya yang bersifat pemblokir. Tidak ada fase lain yang boleh
dimulai sebelum migrasi ini selesai.

---

## 13. Pemeriksaan integritas setiap migrasi

Sebelum dan sesudah menjalankan setiap migrasi:

```sql
SELECT 'social_daily' AS tabel, COUNT(*) AS baris FROM social_daily
UNION ALL SELECT 'content',   COUNT(*) FROM content
UNION ALL SELECT 'comments',  COUNT(*) FROM comments
UNION ALL SELECT 'web_daily', COUNT(*) FROM web_daily
UNION ALL SELECT 'accounts',  COUNT(*) FROM accounts;
```

Jumlah baris **tidak boleh berubah** pada migrasi yang hanya menambah kolom.
Perubahannya hanya boleh berupa kolom yang terisi.

Setelah 0003, periksa juga:

```sql
SELECT source_kind, COUNT(*) FROM social_daily GROUP BY source_kind;
```

Harus mengembalikan tepat satu kelompok, yaitu `seed` — kecuali baris yang memang
sudah pernah ditulis oleh sinkronisasi API sebelum migrasi.

---

## 14. Risiko dan penanganannya

| Risiko | Penanganan |
| --- | --- |
| Migrasi dijalankan ke database yang salah | Selalu `--remote`, dan periksa nama database `karambit` lebih dulu |
| Kolom `NOT NULL` tidak dapat ditambahkan | Tambahkan nullable, backfill, tegakkan di aplikasi |
| Seed dijalankan ulang menghapus provenance | `scripts/generate-seed.ts` harus ikut menulis `source_kind = 'seed'` |
| Kredensial hilang saat dataset di-reset | `account_credentials` sengaja tidak disentuh seed — pertahankan |
| Batasan tidak dapat ditambahkan setelah tabel dibuat | Validasi di lapisan aplikasi + test regresi |
| Data lama tertimpa | Tidak ada `UPDATE` tanpa klausa `WHERE` yang sempit |
