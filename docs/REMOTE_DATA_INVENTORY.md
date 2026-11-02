# Inventaris Data D1 Remote (Baca-saja) — Prasyarat Migrasi 0003

Tanggal inventaris: 2026-10-31
Database: `karambit` (`865475e1-00a0-4abc-baef-6feaec3da107`, region APAC/SIN)
Worker: `hanamasaki2`
Metode: seluruhnya `SELECT` melalui `wrangler d1 execute --remote`. **Tidak ada** operasi tulis.

> Dokumen ini tidak memuat access token, refresh token, client secret, maupun isi kolom `secrets`.
> Nilai kredensial hanya dilaporkan sebagai metadata (ada/tidak, panjang, waktu perubahan).

---

## 1. Ringkasan keputusan

| Pertanyaan | Jawaban berdasarkan bukti |
|---|---|
| Ada data hasil sinkronisasi API pada 7 tabel metrik yang akan dilabeli seed oleh 0003? | **Tidak ada.** Seluruh baris identik dengan dataset seed. |
| Ada data hasil sinkronisasi API di database ini? | **Ada**, tetapi hanya di tabel `accounts` (1 baris) dan `account_credentials` (1 baris). |
| Apakah backfill 0003 akan salah melabeli baris? | **Tidak.** Label `seed` untuk 7 tabel metrik dapat dibuktikan benar. |
| Apakah ada risiko kehilangan data nyata? | **Ada**, tetapi bukan dari 0003 — melainkan dari penjalanan ulang seed pada tabel `accounts`. |

**Kesimpulan:** migrasi `0003` sendiri aman, tetapi **strategi preservasi untuk `accounts` wajib diselesaikan lebih dulu** sebelum seed dijalankan ulang.

---

## 2. Jumlah baris seluruh tabel (remote vs seed lokal)

Seed lokal dihitung dengan memuat `migrations/0001-0003` + `seed/seed.sql` ke SQLite in-memory.

| Tabel | Remote | Seed lokal | Selisih | Terkena 0003 |
|---|---:|---:|---:|---|
| social_daily | 240 | 240 | 0 | source_kind + source_ref + tenant_id |
| content | 99 | 99 | 0 | source_kind + source_ref + tenant_id |
| comments | 230 | 230 | 0 | source_kind + source_ref + tenant_id |
| web_daily | 60 | 60 | 0 | source_kind + source_ref + tenant_id |
| sources | 9 | 9 | 0 | source_kind + tenant_id |
| pages | 8 | 8 | 0 | source_kind + tenant_id |
| search | 10 | 10 | 0 | source_kind + tenant_id |
| accounts | 4 | 4 | 0 | tenant_id |
| organization | 1 | 1 | 0 | — |
| dataset_meta | 1 | 1 | 0 | — |
| team_members | 5 | 5 | 0 | — |
| notifications | 5 | 5 | 0 | — |
| **account_credentials** | **1** | **0** | **+1** | — |

Tabel `account_credentials` sengaja tidak diisi seed. Satu baris di sana berarti kredensial OAuth
pernah disimpan lewat aplikasi.

Migrasi yang sudah tercatat di `d1_migrations`: `0001_init.sql`, `0002_settings_and_credentials.sql`.
`0003_provenance.sql` **belum** diterapkan — sesuai kesepakatan.

---

## 3. Akun dan kredensial (tanpa menampilkan rahasia)

`accounts` — 4 baris:

| id | platform | handle | followers | followers_start | connection | last_sync_at |
|---|---|---:|---:|---|---|---|
| acc-ig | instagram | @hanamasak.studio | 45592 | 45110 | not_connected | — |
| acc-tt | tiktok | @hanamasak | 59758 | 58900 | not_connected | — |
| **acc-yt** | **youtube** | **@@AIForceTask** | **6** | 20750 | **connected** | **2026-10-31T00:00:15.672Z** |
| acc-fb | facebook | Hanamasak | 15040 | 14980 | needs_review | — |

`account_credentials` — 1 baris:

| account_id | key_version | updated_at | panjang `secrets` | panjang `client_id` |
|---|---:|---|---:|---:|
| acc-yt | 1 | 2026-10-31T00:05:46.697Z | 684 byte | 72 |

Kredensial terenkripsi (AES-256-GCM, `CREDENTIALS_KEY`). Isi tidak dibaca dan tidak dicatat.

---

## 4. Distribusi berdasarkan tanggal dan platform

`social_daily` — 60 hari per platform, tanpa celah:

| platform | baris | hari | min | max | total views | total likes | total saves |
|---|---:|---:|---|---|---:|---:|---:|
| facebook | 60 | 60 | 2026-08-28 | 2026-10-26 | 334 278 | 9 323 | 405 |
| instagram | 60 | 60 | 2026-08-28 | 2026-10-26 | 1 155 979 | 60 117 | 7 857 |
| tiktok | 60 | 60 | 2026-08-28 | 2026-10-26 | 1 674 703 | 119 139 | 8 683 |
| youtube | 60 | 60 | 2026-08-28 | 2026-10-26 | 568 722 | 23 343 | 1 771 |

Rentang lain:

- `content.published_at`: 2026-08-28T20:00:00+07:00 → 2026-10-26T12:00:00+07:00 (99 baris)
- `comments.created_at`: 2026-08-28T06:11:00+07:00 → 2026-10-25T22:31:00+07:00 (230 baris)
- `web_daily.date`: 2026-08-28 → 2026-10-26 (60 baris)

Baris di luar rentang seed (2026-08-28 s.d. 2026-10-26): **0** pada keempat tabel.
Seluruh rentang cocok persis dengan `dataset_meta` (`history_start` 2026-08-28, `history_end` 2026-10-26,
`generated_at` 2026-10-26T06:15:00+07:00).

---

## 5. Indikator data hasil sinkronisasi API sebelumnya

Tiga indikator, semuanya menunjuk ke satu akun YouTube:

1. **`accounts.acc-yt` berbeda dari seed.** Perbandingan langsung dengan seed lokal:

   | kolom | seed | remote |
   |---|---|---|
   | handle | `@HanamasakStudio` | `@@AIForceTask` |
   | followers | 21108 | 6 |
   | connection | `not_connected` | `connected` |
   | last_sync_at | NULL | `2026-10-31T00:00:15.672Z` |

   Tiga akun lain identik dengan seed.

2. **Kredensial OAuth tersimpan** untuk `acc-yt` (`account_credentials`, 1 baris, diperbarui 2026-10-31).

3. **Rekam jejak Cron Trigger** — `last_sync_at` terisi pada 2026-10-31T00:00, sesuai jadwal
   `0 */6 * * *` (00:00 UTC). Sinkronisasi benar-benar berjalan, bukan sekadar kredensial tersimpan.

**Penting:** sinkronisasi tersebut **belum menulis satu pun baris ke `social_daily`.** Alasannya:

- Penulisan sosial hanya terjadi bila YouTube Analytics mengembalikan data untuk hari itu
  (`lib/sync.ts` — bila `insight` kosong, tulis dilewati dan dilaporkan sebagai "ditunda 48 jam").
- Pelanggan channel tersimpan (`recordFollowers`) tetapi tayangan harian tidak.

Dengan demikian tidak ada satu pun baris API yang tersimpan pada 7 tabel metrik.

---

## 6. Baris yang berisiko salah dilabeli `seed` oleh backfill 0003

**Hasil: tidak ada.** Diuji dengan sidik jari, bukan asumsi.

Agregat remote dibandingkan dengan seed lokal — identik seluruhnya:

| ukuran | remote | seed lokal | cocok |
|---|---:|---:|---|
| content: SUM(views) | 1 133 959 | 1 133 959 | ya |
| content: SUM(likes) | 65 962 | 65 962 | ya |
| content: SUM(link_clicks) | 7 373 | 7 373 | ya |
| comments: SUM(likes) | 13 732 | 13 732 | ya |
| web_daily: SUM(sessions) | 83 116 | 83 116 | ya |
| web_daily: SUM(users) | 71 721 | 71 721 | ya |
| web_daily: SUM(conversions) | 2 577 | 2 577 | ya |
| sources: SUM(sessions) | 43 226 | 43 226 | ya |
| pages: SUM(views30) | 118 671 | 118 671 | ya |
| search: SUM(impressions) | 75 400 | 75 400 | ya |

Ditambah `social_daily` yang cocok pada seluruh agregat per platform (§4), jumlah baris (§2), dan
rentang tanggal (§4). Bila sync pernah menimpa satu baris seed di tempat, agregatnya akan berbeda.
Tidak ada yang berbeda.

Jadi klaim pada komentar `0003_provenance.sql` baris 53-55 ("seluruh baris yang ada berasal dari
generator seed") **terbukti benar untuk database ini**, dan `UPDATE ... SET source_kind='seed'`
tidak menyesatkan.

---

## 7. Risiko yang benar-benar ditemukan (bukan dari 0003)

**R-1 — Penjalanan ulang seed menghapus data API nyata di `accounts`.**

`scripts/generate-seed.ts` menulis blok `accounts` dengan cakupan:

```
deleteWhere: `id IN ('acc-ig', 'acc-tt', 'acc-yt', 'acc-fb')`
```

tanpa `keepExisting`. Artinya seed menjalankan `DELETE` lalu `INSERT` untuk keempat id tersebut —
termasuk `acc-yt`, yang **sekarang berisi data nyata** (`followers = 6`, `handle = @@AIForceTask`,
`connection = connected`, `last_sync_at` terisi). Menjalankan seed akan mengembalikannya ke angka
ilustratif 21108 dan menghapus jejak sinkronisasi.

Validator seed saat ini tidak menangkap kasus ini: pengujiannya menyisipkan akun **baru** (id di luar
daftar seed), bukan mengubah akun seed yang sudah ada. Verifikasi lulus karena menguji skenario yang
salah.

Catatan: `seed/seed.sql` di HEAD (`DELETE FROM accounts;`) bahkan lebih buruk — menghapus seluruh
tabel. Perubahan Langkah 2 sudah mempersempitnya, tetapi belum cukup.

**R-2 — Batasan yang sudah diketahui.** PK `social_daily` masih `(date, platform)`, sehingga
`tenant_id` belum benar-benar memisahkan tenant. Sudah dinyatakan di header 0003.

**R-3 — Backfill tidak idempoten terhadap baris berlabel `legacy-unknown`/`import`.** Predikatnya
`WHERE source_kind IS NULL`, jadi aman saat ini, tetapi tidak melindungi bila nanti ada tabel yang
sudah punya label lain.

---

## 8. Rekomendasi

### P-1 (wajib, sebelum seed dijalankan ulang) — Lindungi `accounts`

Ikuti pola provenance yang sama seperti 7 tabel metrik, bukan pengecualian ad-hoc:

1. Di `0003_provenance.sql`, tambahkan juga ke `accounts`:
   `ALTER TABLE accounts ADD COLUMN source_kind TEXT;` dan `ADD COLUMN source_ref TEXT;`
   (additive, belum diterapkan ke remote sehingga masih boleh diubah).
2. Backfill `accounts` secara jujur berdasarkan bukti, bukan seragam:
   - `source_kind = 'platform-api'` untuk `acc-yt` — dapat dibuktikan dari `last_sync_at` terisi;
   - `source_kind = 'seed'` untuk baris yang `last_sync_at IS NULL AND connection = 'not_connected'`.
3. `lib/sync.ts` (`recordFollowers`) menulis `source_kind = 'platform-api'` + `source_ref` dari
   `channel.id` untuk baris akun yang disinkronkan.
4. `scripts/generate-seed.ts` mengganti cakupan `accounts` menjadi `SEED_ROWS_ONLY`
   (`DELETE ... WHERE source_kind = 'seed'` + `INSERT OR IGNORE`), sehingga akun hasil sinkronisasi
   tidak pernah dihapus.
5. Perluas validator seed dengan kasus yang benar-benar hilang saat ini: **akun seed yang sudah
   tersentuh API** (bukan hanya akun baru), lalu pastikan penerapan ulang seed tidak mengubahnya.

### P-2 (sesuai catatan arsitektur Anda) — Status `legacy-unknown`

Berdasarkan bukti §6, **tidak ada** baris yang asalnya tidak diketahui pada database ini, sehingga
`legacy-unknown` tidak diperlukan untuk `0003` kali ini. Tetapkan sebagai aturan, bukan tambalan:

- Kosakata provenance menjadi `platform-api` | `import` | `seed` | `legacy-unknown`.
- `legacy-unknown` **wajib** dipakai kapan pun suatu pre-flight check tidak dapat membuktikan asal
  data — bukan otomatis jatuh ke `seed`.
- Aplikasi memperlakukan `legacy-unknown` sebagai **bukan data bisnis**: tidak dihitung dalam KPI,
  tidak dipakai untuk prediksi, dan ditampilkan dengan penanda eksplisit.
- Backfill 0003 dipertahankan sebagai `seed` **karena** ada bukti sidik jari (§6); bila kelak
  dijalankan pada database lain, bukti itu harus diambil ulang lebih dulu.

### P-3 — Perkuat bukti sebelum apply (bukan hardcode asumsi)

Jadikan perbandingan sidik jari (§4 + §6) sebagai langkah pra-migrasi yang dijalankan dan dicatat
setiap kali `0003` akan diterapkan, sehingga klaim "semua baris adalah seed" selalu diverifikasi
ulang alih-alih dipercaya.

---

## 9. Kriteria keputusan

| Kondisi | Klasifikasi inventaris ini |
|---|---|
| Tidak ditemukan data API historis | — |
| **Ditemukan data API historis** | **Berlaku** (1 baris `accounts` + 1 kredensial) |
| Asal data tidak dapat dipastikan | Tidak berlaku — seluruh baris metrik terbukti seed |

**Tindakan yang sesuai: buat strategi preservasi sebelum migrasi (P-1), lalu `0003` dapat dipertimbangkan.**

---

## 10. Kepatuhan aturan keamanan

- Hanya `SELECT`. Tidak ada `INSERT`/`UPDATE`/`DELETE`/`ALTER`/`DROP`, tidak ada `migrations apply`.
- Tidak ada token, secret, atau `client_id` yang dibaca maupun ditampilkan.
- Seed **tidak** dijalankan terhadap D1 remote.
- Tidak ada commit, push, atau deploy.
- Migrasi `0003` belum diterapkan; persetujuan Anda masih ditunggu.

---

## 11. Pre-flight ulang dan penerapan migrasi (2026-11-02)

Sidik jari diulang sebelum menerapkan migrasi, sesuai P-3. Seluruh pemeriksaan
memakai `SELECT` melalui `wrangler d1 execute --remote`.

### 11.1 Perbandingan ulang dengan §2 dan §6

| Pemeriksaan | Hasil | Kesimpulan |
|---|---|---|
| Jumlah baris 7 tabel metrik | 240 / 99 / 230 / 60 / 9 / 8 / 10 | tidak berubah dari §2 |
| `accounts` / `organization` / `account_credentials` | 4 / 1 / 1 | tidak berubah |
| content.views | 1 133 959 | cocok dengan §6 |
| comments.likes | 13 732 | cocok |
| web_daily.sessions | 83 116 | cocok |
| sources.sessions | 43 226 | cocok |
| pages.views30 | 118 671 | cocok |
| search.impressions | 75 400 | cocok |

Klaim "seluruh baris 7 tabel metrik berasal dari generator seed" **masih terbukti
benar**, sehingga backfill `source_kind = 'seed'` pada `0003` tidak menyesatkan.

`accounts` — 4 baris, seluruhnya sama dengan §3 kecuali `acc-yt.last_sync_at` yang
maju dari `2026-10-31T00:00:15.672Z` menjadi `2026-11-02T00:00:13.173Z`. Bukti
tambahan bahwa Cron Trigger masih berjalan sesuai jadwal `0 */6 * * *`; tayangan
harian tetap belum tertulis karena jeda data YouTube Analytics.

### 11.2 Temuan: `0003` sudah diterapkan sebelum catatan ini

`d1_migrations` pada saat pre-flight sudah memuat `0001`, `0002`, dan `0003`.
Kolom `source_kind` / `source_ref` / `tenant_id` sudah ada di `social_daily`
(3 kolom) dan `accounts` (3 kolom), dan `accounts.source_kind` sudah terisi:

| source_kind | baris |
|---|---:|
| platform-api | 1 (`acc-yt`) |
| seed | 3 |

Hasil ini sama dengan yang diharapkan dari backfill `0003` (§3 dan P-1), jadi tidak
ada pelabelan yang perlu dikoreksi.

### 11.3 Penerapan `0004` dan `0005`

`npx wrangler d1 migrations apply karambit --remote`. Setelahnya `d1_migrations`
memuat `0001`–`0005` dan ukuran basis data naik 266 240 → 311 296 byte.

Verifikasi pasca-migrasi (baca-saja):

| Pemeriksaan | Hasil |
|---|---|
| Tabel `integrations`, `sync_jobs`, `audience_insights` | ada, ketiganya 0 baris |
| Indeks baru | 4 — `idx_integrations_tenant_kind`, `idx_sync_jobs_integration_started`, `idx_audience_insights_key`, `idx_audience_insights_account` |
| `content.duration_seconds` | ada; sesuai §11.1 belum ada sinkronisasi YouTube setelah migrasi, jadi seluruhnya NULL |
| Jumlah baris seluruh tabel lama | tidak berubah (240 / 99 / 230 / 60 / 9 / 8 / 10 / 4 / 1 / 1) |

### 11.4 Status R-1

P-1 butir 4 sudah diterapkan di kode: `scripts/generate-seed.ts` memakai
`SEED_ROWS_ONLY` (`DELETE ... WHERE source_kind = 'seed'` + `INSERT OR IGNORE`)
untuk tabel `accounts` maupun tabel metrik, sehingga akun hasil sinkronisasi
(`source_kind = 'platform-api'`) tidak lagi terhapus.

**Seed tetap belum dijalankan terhadap D1 remote.** Perubahan ini menghapus
risiko di tingkat kode, bukan menggantikan keputusan untuk menjalankannya.

### 11.5 Kepatuhan

Hanya `SELECT` pada seluruh pre-flight dan verifikasi. Satu-satunya operasi tulis
adalah `migrations apply` yang Anda setujui secara eksplisit. Tidak ada token,
secret, `client_id`, maupun isi `secrets` yang dibaca atau ditampilkan. Tidak ada
deploy.
