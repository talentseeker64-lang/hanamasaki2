# EXISTING_SYSTEM_AUDIT

Audit kondisi aktual repositori `d:\hanamasak` sebagai deliverable **Phase 0**.
Disusun dari pembacaan langsung kode dan migrasi, bukan dari asumsi desain.

Tanggal audit: 2026-10-31
Commit acuan: `255eb0b`

---

## 1. Ringkasan eksekutif

Aplikasi ini sudah berjalan di Cloudflare Workers dengan Next.js 16 App Router dan
D1 sebagai database. Yang ada hari ini adalah **dashboard analytics lintas kanal
yang berfungsi**, bukan kerangka kosong.

Tiga hal yang perlu dipahami sebelum melanjutkan:

1. **Analytics-nya nyata, tapi mesin "AI"-nya bukan AI.** Seluruh narasi di halaman
   Insights, Reports, dan Copilot dihasilkan oleh mesin statistik deterministik
   (`lib/ai.ts`) dengan aturan kata kunci, bukan LLM. Ini justru modal, bukan
   utang — sesuai keputusan Hybrid AI, lapisan ini dipertahankan sebagai Layer 1.

2. **Ada masalah provenance yang harus diselesaikan lebih dulu.** Halaman dashboard
   membaca `social_daily`, `content`, `comments`, `web_daily`, `sources`, `pages`,
   dan `search` lewat `SELECT *` tanpa penyaring sumber. Sebagian baris berasal dari
   API platform sungguhan (ditulis `lib/sync.ts`), sebagian besar lainnya berasal
   dari seed ilustratif (`lib/demo-dataset.ts` → `seed/seed.sql`). Keduanya duduk di
   tabel yang sama **tanpa kolom penanda asal data**, sehingga secara teknis tidak
   mungkin membedakan "angka nyata" dari "angka contoh" saat dirender.

   Ini bertabrakan langsung dengan prinsip yang sudah ditetapkan: *setiap angka
   harus punya sumber data dan status validasi, dan data yang belum tersedia harus
   ditampilkan sebagai "not connected", bukan estimasi.* Lihat
   [DATABASE_MIGRATION_PLAN.md](./DATABASE_MIGRATION_PLAN.md) bagian 4.

3. **Belum ada multi-tenancy dan belum ada autentikasi pengguna.** Satu-satunya
   penjagaan adalah token admin bersama (`x-admin-token`). Tidak ada konsep pemilik
   data, sehingga "relasi dengan tenant yang tepat" belum bisa dijamin.

---

## 2. Stack dan runtime

| Aspek | Nilai | Bukti |
| --- | --- | --- |
| Framework | Next.js 16.4.3 (App Router, Turbopack) | `package.json` |
| UI | React 19.3.0, Tailwind v4 | `package.json`, `next.config.ts` |
| Bahasa | TypeScript 5 | `tsconfig.json` |
| Runtime produksi | Cloudflare Workers | `wrangler.jsonc` |
| Adapter | `@opennextjs/cloudflare` `^1.20.13` | `package.json` |
| Database | Cloudflare D1 (SQLite), binding `DB`, nama `karambit` | `wrangler.jsonc` baris 18-27 |
| Entry point | `worker.ts` kustom (`fetch` + `scheduled`) | `wrangler.jsonc` baris 5 |
| Penjadwalan | Cron `0 */6 * * *` | `wrangler.jsonc` baris 39 |
| ORM | **Tidak ada** — prepared statement D1 langsung | `lib/db.ts`, `lib/data.ts` |
| Rendering | Dinamis penuh per request (`connection()`) | `lib/data.ts` baris 243-245 |

Catatan penting yang membatasi pilihan teknis:

- **Cache Components / PPR tidak boleh diaktifkan.** Terdokumentasi di
  `next.config.ts` baris 4-8: PPR menuntut runtime Node.js, sedangkan workerd bukan
  Node.js. Riwayatnya pernah menyebabkan error 1101.
- **D1 lokal tidak dapat dipakai di lingkungan pengembang ini.** `workerd.exe`
  crash (access violation) di Windows, sehingga migrasi dan seed dijalankan ke
  database remote.
- **Aturan Next.js versi ini berbeda dari versi sebelumnya.** `node_modules/next/AGENTS.md`
  mewajibkan pembacaan `node_modules/next/dist/docs/` sebelum menulis kode.

---

## 3. Struktur repository

```
d:\hanamasak
├── app/                     9 halaman + 10 grup endpoint API
├── components/              8 komponen UI
├── lib/                    19 modul (data, analitik, konektor, keamanan)
├── migrations/              2 migrasi SQL
├── scripts/generate-seed.ts Generator seed.sql dari demo-dataset.ts
├── seed/seed.sql            Data awal (ilustratif)
├── worker.ts                Entry point Worker kustom
├── wrangler.jsonc           Konfigurasi Cloudflare
└── next.config.ts           Konfigurasi Next.js
```

### 3.1 Modul `lib/` dan tanggung jawabnya

| Modul | Tanggung jawab |
| --- | --- |
| `db.ts` | Akses binding Cloudflare (`getEnv`, `getDb`, `rowsOf`) |
| `data.ts` | `getDataset()` — satu-satunya pintu baca dataset |
| `types.ts` | Kontrak tipe bersama (Dataset, Platform, ChannelAccount, dll.) |
| `metrics.ts` | Perhitungan KPI, agregat platform, tren, bucket performa |
| `ai.ts` | Forecast, deteksi anomali, diagnosis, insight, laporan, copilot |
| `format.ts` | Pemformatan angka/tanggal/label |
| `demo-dataset.ts` | Generator dataset ilustratif |
| `accounts.ts` | Pemetaan baris akun + validasi masukan akun |
| `settings.ts`, `default-settings.ts` | Pengaturan organisasi, tim, notifikasi |
| `validation.ts` | `ValidationError`, pemeriksaan bentuk data |
| `api.ts` | `requireAdmin`, `errorResponse`, `readJsonBody` |
| `admin-client.ts` | Pembacaan token admin di sisi klien |
| `crypto.ts` | AES-256-GCM (Web Crypto API) |
| `credentials.ts` | Simpan/baca/hapus ringkasan kredensial OAuth |
| `oauth-state.ts` | Pembuatan dan pemeriksaan `state` OAuth |
| `meta.ts` | Konektor Instagram dan Facebook (Graph API) |
| `youtube.ts` | Konektor YouTube (Data API v3, Analytics API) |
| `sync.ts` | Orkestrasi sinkronisasi metrik ke D1 |

---

## 4. Routing

### 4.1 Halaman (9)

| Rute | Berkas | Isi |
| --- | --- | --- |
| `/` | `app/page.tsx` | Overview lintas kanal |
| `/social` | `app/social/page.tsx` | Perbandingan seluruh kanal |
| `/social/[platform]` | `app/social/[platform]/page.tsx` | Detail satu kanal (instagram/tiktok/youtube/facebook) |
| `/comments` | `app/comments/page.tsx` | Analisis komentar dan sentimen |
| `/website` | `app/website/page.tsx` | Sesi, sumber trafik, halaman, pencarian |
| `/insights` | `app/insights/page.tsx` | Temuan terprioritas + forecast |
| `/reports` | `app/reports/page.tsx` | Laporan otomatis |
| `/integrations` | `app/integrations/page.tsx` | Pengelolaan akun dan koneksi OAuth |
| `/settings` | `app/settings/page.tsx` | Organisasi, tim, notifikasi |

### 4.2 Endpoint API (20 handler dalam 10 grup)

| Endpoint | Metode | Penjagaan | Berkas |
| --- | --- | --- | --- |
| `/api/overview` | GET | publik | `app/api/overview/route.ts` |
| `/api/copilot` | POST | publik | `app/api/copilot/route.ts` |
| `/api/youtube/videos` | GET | publik | `app/api/youtube/videos/route.ts` |
| `/api/accounts` | GET, POST | POST: admin | `app/api/accounts/route.ts` |
| `/api/accounts/[id]` | PATCH, DELETE | admin | `app/api/accounts/[id]/route.ts` |
| `/api/accounts/[id]/credentials` | PUT, DELETE | admin | `app/api/accounts/[id]/credentials/route.ts` |
| `/api/settings` | GET, PATCH | PATCH: admin | `app/api/settings/route.ts` |
| `/api/settings/team` | POST, PATCH, DELETE | admin | `app/api/settings/team/route.ts` |
| `/api/settings/notifications` | PATCH | admin | `app/api/settings/notifications/route.ts` |
| `/api/sync/run` | POST | admin | `app/api/sync/run/route.ts` |
| `/api/oauth/meta/start` | POST | admin | `app/api/oauth/meta/start/route.ts` |
| `/api/oauth/meta/callback` | GET | state cookie | `app/api/oauth/meta/callback/route.ts` |
| `/api/oauth/google/start` | POST | admin | `app/api/oauth/google/start/route.ts` |
| `/api/oauth/google/callback` | GET | state cookie | `app/api/oauth/google/callback/route.ts` |

**Tidak ada endpoint tulis data bisnis.** Komentar, konten, konversi, dan transaksi
tidak memiliki jalur masuk sama sekali — hanya bisa diisi lewat seed. Ini penting
untuk Phase 4: jalur masuk data penjualan harus dibangun dari nol.

---

## 5. Lapisan data (D1)

13 tabel dalam 2 migrasi. Tidak ada ORM, tidak ada foreign key.

### 5.1 `migrations/0001_init.sql` — tabel dataset

| Tabel | Kunci | Keterangan |
| --- | --- | --- |
| `dataset_meta` | `id` ('current') | Rentang tanggal tampilan dan riwayat |
| `accounts` | `id` | Akun kanal sosial; menyimpan `followers`, `connection`, `last_sync_at` |
| `social_daily` | (`date`, `platform`) | Metrik harian per kanal |
| `content` | `id` | Daftar konten beserta performanya |
| `comments` | `id` | Komentar dengan `sentiment` dan `intent` |
| `web_daily` | `date` | Metrik website harian |
| `sources` | `source` | Sumber trafik (30 hari + pembanding) |
| `pages` | `path` | Halaman pendaratan |
| `search` | `query` | Kueri pencarian organik |

### 5.2 `migrations/0002_settings_and_credentials.sql`

| Tabel | Kunci | Keterangan |
| --- | --- | --- |
| `organization` | `id` | Konfigurasi organisasi (nama, paket, zona waktu) |
| `team_members` | `email` | Daftar anggota tim (peran + cakupan) |
| `notifications` | `id` | Preferensi notifikasi |
| `account_credentials` | `account_id` | Kredensial OAuth terenkripsi AES-256-GCM |

Catatan desain yang sudah benar dan harus dipertahankan:

- `account_credentials.secrets` berisi `base64(iv 12 byte || ciphertext)` — rahasia
  tidak pernah disimpan sebagai teks biasa (`lib/crypto.ts`).
- Sengaja **tanpa** `FOREIGN KEY` ke `accounts` agar seed dataset tidak menghapus
  kredensial (komentar migrasi baris 35-37).
- `key_version` sudah disiapkan untuk rotasi kunci.

### 5.3 Jalur baca

Satu pintu: `getDataset()` di `lib/data.ts` baris 243-288. Sembilan kueri dijalankan
sekaligus lewat `db.batch([...])`. Kueri metrik memakai `SELECT *` **tanpa klausa
rentang tanggal dan tanpa penyaring asal data**:

```sql
SELECT * FROM social_daily ORDER BY platform, date
```

Konsekuensi: seluruh baris ikut terbaca, dan `lib/metrics.ts` memotong jendela
berdasarkan posisi baris (`slice`), bukan berdasarkan tanggal. Ini bekerja selama
setiap kanal memiliki baris harian yang lengkap dan berurutan.

---

## 6. Lapisan analitik

### 6.1 `lib/metrics.ts` — mesin hitung

- `kpiSummary`, `platformAggregates` (kini menerima filter platform), `platformTrendPoints`
- `trendPoints`, `windowSum`, `pctChange`, `safeDiv`, `engagementRateOf`
- `performanceByFormat` / `ByHour` / `ByWeekday` / `ByTopic` (menerima filter platform)
- `commentAnalysis` — sentimen, niat, topik, pertanyaan belum dijawab
- `webTotals`, `bestLag` (korelasi dengan jeda)

Semua fungsi murni: masukan `Dataset`, keluaran angka. Tidak menyentuh D1.

### 6.2 `lib/ai.ts` — yang sering disalahartikan sebagai AI

Kemampuan nyata yang sudah ada:

| Fungsi | Metode | Catatan |
| --- | --- | --- |
| `forecastSeries` | Regresi linear (least squares) | Tanpa musiman. `confidence` selalu `"rendah"` |
| `detectAnomalies` | Z-score terhadap jendela sebelumnya | Ambang 2σ; maksimum 6 anomali |
| `diagnoseTrafficGap` | Analisis multi-faktor + `bestLag` | **Khusus satu skenario** (lihat temuan) |
| `buildInsights` | 6 aturan tetap | Keluaran bergantung ambang yang di-hardcode |
| `buildReport` | Rangkuman dari insight + KPI | — |
| `answerCopilot` | **Pencocokan kata kunci**, 5 aturan + fallback | Bukan LLM |

---

## 7. Konektor eksternal

| Penyedia | Berkas | Cakupan saat ini |
| --- | --- | --- |
| Instagram | `lib/meta.ts` | Profil (pengikut), insight harian (jangkauan, kunjungan profil) |
| Facebook | `lib/meta.ts` | Profil Halaman (pengikut) saja |
| YouTube | `lib/youtube.ts` | Profil channel, tayangan harian (Analytics), daftar video + durasi + statistik |
| TikTok | — | **Belum ada** |

Platform yang punya alur izin: `META_PLATFORMS = ["instagram", "facebook"]`,
`GOOGLE_PLATFORMS = ["youtube"]` (`lib/sync.ts` baris 47-48). Akun TikTok akan
berstatus `skipped` dengan pesan "Alur izin platform ini belum diimplementasikan".

### 7.1 Prinsip yang sudah dipegang dan harus dilanjutkan

Terdokumentasi di `lib/sync.ts` baris 27-29:

> Bila panggilan gagal, baris D1 dibiarkan apa adanya dan kegagalan dilaporkan —
> bukan diisi angka nol yang menyesatkan.

`upsertDailySocial` (baris 336-357) hanya menimpa kolom yang benar-benar terukur,
sehingga data lain pada tanggal yang sama tidak rusak.

### 7.2 Celah pada prinsip tersebut

`recordFollowers` (baris 281-291) menulis `connection = 'connected'` dan
`last_sync_at` berdasarkan keberhasilan satu panggilan API. Untuk Facebook, itu
hanya panggilan **jumlah pengikut** — belum tentu berarti seluruh metrik kanal
tersedia. Status "terhubung" bisa lebih optimistis daripada kenyataan datanya.

---

## 8. Keamanan dan otorisasi

| Aspek | Kondisi |
| --- | --- |
| Autentikasi pengguna | **Tidak ada** |
| Otorisasi per pengguna | **Tidak ada** |
| Penjagaan endpoint tulis | Token bersama `x-admin-token` |
| Perilaku gagal | Gagal-tertutup: 503 bila `ADMIN_TOKEN` belum diatur |
| Perbandingan token | `timingSafeEqual` (`lib/crypto.ts`) |
| Penyimpanan rahasia platform | AES-256-GCM, kunci dari secret Worker `CREDENTIALS_KEY` |
| Rahasia di frontend | Tidak ada; kredensial hanya dibaca di sisi server |
| Endpoint baca | **Terbuka untuk publik** |

Konsekuensi yang perlu disadari: **seluruh data di `/api/overview`,
`/api/youtube/videos`, dan semua halaman dapat dibaca siapa saja yang tahu URL
Worker.** Untuk dashboard internal satu pengguna ini masih dapat diterima, tetapi
begitu masuk Phase 4 (leads, transaksi, revenue), ini menjadi penghalang serius.
Multi-tenancy adalah prasyarat, bukan fitur tambahan.

---

## 9. Komponen UI (8)

| Komponen | Peran |
| --- | --- |
| `AppShell.tsx` | Navigasi utama (8 menu + 4 submenu kanal), drawer mobile |
| `ui.tsx` | Primitif: Card, KpiCard, PlatformBadge, PlatformIcon, DataNotice, dll. |
| `charts.tsx` | `DualLineChart`, `BarList` (SVG buatan sendiri, tanpa pustaka grafik) |
| `form.tsx` | Kontrol formulir |
| `AccountsManager.tsx` | CRUD akun + alur koneksi OAuth |
| `SettingsManager.tsx` | Pengaturan organisasi, tim, notifikasi |
| `CopilotPanel.tsx` | Antarmuka tanya-jawab |
| `YouTubeVideoList.tsx` | Daftar video YouTube (data live) |

Tidak ada pustaka grafik pihak ketiga — chart digambar manual sebagai SVG. Ini
menguntungkan untuk batas ukuran Worker (free tier 3 MiB).

---

## 10. Temuan

Diurutkan berdasarkan dampak terhadap roadmap.

### T-1 · CRITICAL — Tidak ada provenance data

`lib/data.ts` baris 247-258 membaca semua tabel dengan `SELECT *` tanpa kolom
penanda asal. Baris hasil sinkronisasi API dan baris seed ilustratif tidak dapat
dibedakan. Badge "Data ilustratif" di header (`AppShell.tsx`) bersifat global untuk
seluruh aplikasi, bukan per-angka.

**Dampak:** menghalangi prinsip "tidak ada angka fiktif" dan memblokir Phase 4,
karena funnel penjualan tidak dapat dihitung bila pembilang dan penyebutnya berasal
dari sumber dengan tingkat kepercayaan berbeda.

### T-2 · CRITICAL — `diagnoseTrafficGap` terikat pada satu dataset contoh

`lib/ai.ts` baris 179 mencari halaman dengan path literal `/promo-oktober`, dan
baris 233 mengasumsikan keberadaan kanal `organic`. Seluruh narasi — termasuk
`headline` di baris 295 — adalah kalimat Indonesia yang sudah jadi untuk skenario
"tayangan naik, sesi turun".

**Dampak:** pada data nyata, diagnosis akan tetap menghasilkan kalimat tersebut
walaupun kondisinya berbeda. Ini bukan bug kecil; ini menghasilkan pernyataan yang
tidak benar. Harus digeneralisasi atau dihentikan sebelum data nyata ditampilkan.

### T-3 · HIGH — Pemotongan jendela berbasis posisi, bukan tanggal

`lib/metrics.ts` `aggregatePlatform` (baris 88-109) memakai `rows.slice(...)`,
dan `lib/data.ts` memakai `SELECT *` tanpa filter tanggal.

**Dampak:** begitu sinkronisasi menulis baris baru untuk sebagian kanal saja,
panjang array antar kanal menjadi tidak seragam dan jendela 30 hari bergeser
diam-diam. Perbandingan periode menjadi tidak dapat dipercaya.

### T-4 · HIGH — Tidak ada multi-tenancy

Tidak ada kolom pemilik pada satu pun tabel data. `organization` adalah
konfigurasi tunggal, dan `team_members` hanya daftar tampilan tanpa kaitan ke data.

**Dampak:** memperbesar skema setelah ada data nyata jauh lebih mahal daripada
menyiapkannya sekarang.

### T-5 · HIGH — Endpoint baca terbuka publik

Seluruh halaman dan `/api/overview` dapat diakses tanpa kredensial apa pun.

**Dampak:** menjadi kebocoran data begitu leads dan transaksi masuk.

**Status terkini:** endpoint API dijaga sejak Phase 2; halaman HTML dijaga oleh
gerbang sesi di `worker.ts` (`lib/page-gate.ts`, Phase 4 A4). Masih token bersama,
bukan akun pengguna — lihat `IMPLEMENTATION_ROADMAP.md`.

### T-6 · MEDIUM — TikTok belum ada konektornya

`lib/sync.ts` baris 47 menetapkan hanya Meta dan Google. TikTok adalah salah satu
dari empat kanal yang ditampilkan di UI, tetapi metriknya selalu dari seed.

### T-7 · MEDIUM — `getCredentialsKey` tidak memvalidasi format kunci

`lib/credentials.ts` hanya memeriksa keberadaan, bukan panjang setelah base64.
Validasi sebenarnya baru terjadi di `lib/crypto.ts` saat enkripsi dijalankan.

**Dampak:** kesalahan konfigurasi baru terdeteksi di tengah alur OAuth (kejadian
nyata pada commit sebelum `fabe03b`, di mana kunci hanya 6 byte).

### T-8 · MEDIUM — Callback Google menyembunyikan galat konfigurasi

`app/api/oauth/google/callback/route.ts` membalas pesan generik untuk galat non
`GoogleApiError`.

**Dampak:** pengguna menerima "Terjadi kesalahan tak terduga" tanpa petunjuk,
sementara penyebab sebenarnya hanya terlihat di log Worker.

### T-9 · LOW — Sinkronisasi berjalan berurutan

`syncAllAccounts` (baris 53-65) memakai `for...of` dengan `await`. Dengan 4 kanal
ini belum menjadi masalah; akan menjadi masalah bila kanal bertambah.

### T-10 · LOW — `SELECT *` di seluruh jalur baca

Setiap penambahan kolom memperbesar payload dari D1 secara otomatis, termasuk
kolom yang tidak dipakai halaman terkait.

---

## 11. Utang teknis

| Utang | Lokasi | Prioritas |
| --- | --- | --- |
| Tidak ada test otomatis sama sekali | seluruh repo | HIGH — prasyarat "test before release" |
| Tidak ada pemeriksaan lint-staged atau CI test | `.github/`, `package.json` | MEDIUM |
| Tidak ada retry/backoff saat panggilan API platform gagal | `lib/meta.ts`, `lib/youtube.ts`, `lib/sync.ts` | MEDIUM |
| Tidak ada riwayat eksekusi sinkronisasi | — | MEDIUM — diminta Phase 2 |
| Tidak ada pencatatan pemakaian dan biaya AI | — | nanti (Phase 5) |
| D1 lokal tidak dapat dipakai di lingkungan ini | lingkungan pengembang | diketahui, ada jalan pintas remote |

---

## 12. Kesimpulan audit

Yang **dipertahankan** (sesuai prinsip *preserve before replace*):

- Seluruh 9 halaman, 20 handler API, dan 13 tabel yang ada.
- `lib/metrics.ts` sebagai mesin hitung deterministik — menjadi Layer 1 Hybrid AI.
- `lib/ai.ts` sebagai kerangka insight — isinya digeneralisasi, bukan dibuang.
- Disiplin keamanan rahasia (AES-256-GCM, gagal-tertutup, `timingSafeEqual`).
- Prinsip "jangan isi data gagal dengan nol" di `lib/sync.ts`.

Yang **harus diselesaikan sebelum data nyata ditampilkan**:

1. Provenance data (T-1) — blokir untuk semua fase berikutnya.
2. Generalisasi `diagnoseTrafficGap` (T-2) — mencegah pernyataan yang salah.
3. Pemotongan jendela berbasis tanggal (T-3) — mencegah perbandingan yang menyesatkan.

Yang **harus dimulai sekarang walau implementasinya nanti**:

4. Multi-tenancy (T-4) dan penjagaan baca (T-5) — mahal bila ditunda.

Rincian celah fitur ada di [FEATURE_GAP_ANALYSIS.md](./FEATURE_GAP_ANALYSIS.md),
rancangan tujuan di [TARGET_ARCHITECTURE.md](./TARGET_ARCHITECTURE.md), urutan
pengerjaan di [IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md), dan rencana
perubahan database di [DATABASE_MIGRATION_PLAN.md](./DATABASE_MIGRATION_PLAN.md).
