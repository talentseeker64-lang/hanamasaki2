# IMPLEMENTATION_ROADMAP

Urutan pengerjaan dari kondisi aktual menuju **Social Media Business Intelligence**
untuk UMKM & online seller.

Tanggal: 2026-10-31 · Commit acuan: `255eb0b`

Aturan yang berlaku di seluruh fase:

- **Preserve before replace** — kode dan fitur yang masih relevan dipertahankan.
- **Audit before migration** — tidak ada tabel baru sebelum skema diperiksa.
- **Integrate before simulate** — sumber data aktual lebih diutamakan daripada simulasi.
- **Evidence before recommendation** — AI wajib punya dasar data.
- **Measure before predict** — prediksi hanya bila data historis mencukupi.
- **Attribution before ROI** — tidak ada klaim ROI tanpa biaya dan pendapatan yang telusur.
- **Test before release** — setiap perubahan melewati pengujian regresi.

---

## Ringkasan progres

| Fase | Nama | Status | Bergantung pada |
| --- | --- | --- | --- |
| 0 | Existing System Audit | **Selesai** | — |
| 1 | Perbaikan Fondasi & Analytics | **Selesai** | Fase 0 |
| 2 | Unified Marketing Data Layer | **Selesai** | Fase 1 |
| 3 | FYP & Content Intelligence | **Selesai** | Fase 2 |
| 4 | Sales & Conversion Intelligence | **Sebagian** (item 1, 2, 6) | Fase 2 |
| 5 | Hybrid AI Intelligence | Belum mulai | Fase 3, 4 |
| 6 | Competitor & Experiment | Belum mulai | Fase 5 |
| 7 | Business Performance | Belum mulai | Fase 4, 6 |

---

## Phase 0 — Existing System Audit · SELESAI

**Deliverable (5 dokumen, tersedia di `docs/`):**

- [x] [EXISTING_SYSTEM_AUDIT.md](./EXISTING_SYSTEM_AUDIT.md) — peta sistem + 10 temuan
- [x] [FEATURE_GAP_ANALYSIS.md](./FEATURE_GAP_ANALYSIS.md) — celah modul A–J + ketersediaan data per platform
- [x] [TARGET_ARCHITECTURE.md](./TARGET_ARCHITECTURE.md) — arsitektur tujuan tanpa rewrite
- [x] [IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md) — dokumen ini
- [x] [DATABASE_MIGRATION_PLAN.md](./DATABASE_MIGRATION_PLAN.md) — rencana perubahan skema

**Hasil utama:**

- 9 halaman, 20 handler API, 13 tabel, 19 modul `lib/` terpetakan.
- 0 modul A–J selesai; 4 parsial, 1 kerangka, 5 belum ada.
- 3 temuan memblokir (T-1 provenance, T-2 diagnosis terikat skenario, T-3 jendela
  berbasis posisi) dan 2 temuan yang mahal bila ditunda (T-4 multi-tenancy,
  T-5 endpoint baca publik).

---

## Phase 1 — Perbaikan Fondasi & Strengthen Analytics · SELESAI

**Tujuan:** menjadikan angka di dashboard dapat dipertanggungjawabkan sebelum
menambah kemampuan baru. Ini fase paling tidak menarik dan paling menentukan.

**Kenapa harus lebih dulu:** menambahkan FYP Intelligence atau LLM di atas fondasi
yang mencampur data nyata dan data contoh hanya akan memperbesar masalah, bukan
menyelesaikannya.

### 1.1 Prasyarat yang memblokir (wajib selesai di fase ini)

| No | Pekerjaan | Temuan | Kriteria selesai |
| --- | --- | --- | --- |
| 1 | Tambah provenance pada data metrik | T-1 | Setiap baris punya `source_kind`; badge di UI diturunkan per angka, bukan global |
| 2 | Ganti pemotongan jendela ke berbasis tanggal | T-3 | Fungsi agregat menyaring `date` terhadap `dataset.range`, bukan `slice` |
| 3 | Generalisasi `diagnoseTrafficGap` | T-2 | Tidak ada lagi path literal; diagnosis bekerja untuk rentang dan kanal mana pun |
| 4 | Perbaiki label status koneksi | Audit 7.2 | "Terhubung" hanya bila metrik utama kanal benar-benar tersinkron, bukan hanya pengikut |

### 1.2 Penyelesaian modul A, B, C

| No | Pekerjaan | Modul | Kriteria selesai |
| --- | --- | --- | --- |
| 5 | Skor kesehatan kanal | A | Skor gabungan dari pertumbuhan, konsistensi, dan interaksi; metodenya didokumentasikan di UI |
| 6 | Konsistensi posting | A | Jeda antar-unggahan dihitung dari tanggal nyata |
| 7 | Perbaiki arti "jam terbaik" | B | Disebut sebagai waktu publikasi terbaik, bukan jam aktif audiens |
| 8 | Sumber demografi audiens | B | Ditarik dari API untuk platform yang menyediakannya; sisanya `unavailable` |
| 9 | Durasi konten masuk analitik | C | Durasi YouTube dipakai dalam analisis performa konten |
| 10 | Indikator kesegaran data | 1.1 | Status `stale` dihitung dari jadwal sinkronisasi |

### 1.3 Harness pengujian

Saat ini **tidak ada satu pun test**. Wajib dimulai di fase ini.

| No | Pekerjaan | Kriteria selesai |
| --- | --- | --- |
| 11 | Unit test untuk `lib/metrics.ts` | Fungsi murni; dataset contoh tetap, hasilnya diperiksa |
| 12 | Unit test untuk `lib/ai.ts` | Termasuk uji regresi untuk temuan T-2 |
| 13 | Test untuk `lib/sync.ts` dan validator kredensial | Termasuk kasus `CREDENTIALS_KEY` salah panjang (temuan T-7) |
| 14 | Test untuk jalur baca `getDataset()` | Memverifikasi penyaringan rentang dan provenance |

Catatan teknis: `lib/metrics.ts` dan `lib/ai.ts` adalah fungsi murni yang menerima
`Dataset` — keduanya dapat diuji tanpa D1. Ini penting karena **D1 lokal tidak dapat
dijalankan di lingkungan pengembang ini** (`workerd.exe` crash di Windows), sehingga
pengujian harus dirancang agar tidak bergantung pada database.

**Deliverable Phase 1:** mesin analitik yang stabil, konsisten, teruji, dan data di
dalamnya dapat dibedakan antara nyata dan contoh.

---

## Phase 2 — Unified Marketing Data Layer · SELESAI

**Tujuan:** fondasi untuk menghubungkan banyak sumber data tanpa mengubah mesin
analisis setiap kali ada integrasi baru.

| No | Pekerjaan | Kriteria selesai | Wujud di kode |
| --- | --- | --- | --- |
| 1 | Registry integrasi | Setiap sumber terdaftar dengan status dan kredensialnya | Tabel `integrations` (`migrations/0004`), [lib/integrations.ts](./../lib/integrations.ts) |
| 2 | Riwayat sinkronisasi | Setiap eksekusi tercatat: waktu, cakupan, hasil, pesan | Tabel `sync_jobs`, `startSyncJob`/`finishSyncJob` |
| 3 | Retry dan backoff | Kegagalan sementara tidak langsung menandai sumber `error` | [lib/retry.ts](./../lib/retry.ts) dipakai `lib/sync.ts` |
| 4 | Kontrak provider | `MarketingDataProvider` diterapkan pada konektor Meta dan Google yang sudah ada | [lib/providers.ts](./../lib/providers.ts); `metaProvider`/`googleProvider` di `lib/sync.ts` |
| 5 | Deduplication | Kunci dari `source_ref` mencegah baris ganda saat sinkronisasi diulang | `upsertDailySocial` + indeks unik `audience_insights` (`migrations/0003`, `0005`) |
| 6 | Multi-tenancy | Setiap tabel data memiliki kolom pemilik; seluruh kueri tersaring | `whereClause` di `lib/data.ts`; `tenantScope` di `lib/integrations.ts`; `GET /api/accounts` |
| 7 | Penjagaan endpoint baca | Endpoint baca tidak lagi publik | `requireAdmin` di `/api/overview`, `/api/copilot`, `/api/youtube/videos` |

**Deliverable:** satu lapisan data terstandardisasi, dengan provenance, riwayat
sinkronisasi, dan batas kepemilikan yang jelas.

**Catatan urutan:** pekerjaan 6 dan 7 harus selesai **sebelum** Phase 4 dimulai.
Menambahkan leads dan transaksi ke skema tanpa pemilik data berarti membangun
kebocoran ke dalam fondasi.

### Batas yang belum tertutup

- Pekerjaan 7 baru mencakup **endpoint API**. Halaman HTML yang merender dataset
  yang sama masih dapat dibuka tanpa kredensial; membatasinya memerlukan
  autentikasi pengguna sungguhan, yang belum ada di fase ini. Token bersama
  `x-admin-token` hanyalah penghalang, bukan autentikasi.
- Migrasi `0004` (bersama `0005`) **sudah diterapkan** ke D1 remote pada
  2026-11-02; `0003` ternyata sudah diterapkan lebih dulu. Yang belum diterapkan
  ke remote hanyalah **seed** — lihat §11 `docs/REMOTE_DATA_INVENTORY.md`.

### Bukti verifikasi (dari disk, bukan laporan)

- `npx tsc --noEmit` — bersih.
- `npm test` — 82 lulus, 0 gagal (51 dari Phase 1 + 31 baru untuk `retry`,
  `integrations`, dan `providers`).
- `npm run lint` — bersih.
- `npm run build` — sukses, 23 rute `ƒ Dynamic`.

---

## Phase 3 — FYP & Content Intelligence · SELESAI

**Tujuan:** menganalisis potensi performa konten dan peluang distribusi.

| No | Pekerjaan | Keterbatasan yang harus diakui | Wujud di kode |
| --- | --- | --- | --- |
| 1 | Analisis struktur konten | Hanya dari metadata yang tersedia | `performanceByFormat`/`performanceByDuration` (`lib/metrics.ts`) |
| 2 | Klasifikasi topik | Memerlukan pelabelan; kualitas bergantung pada data awal | `performanceByTopic`; `topicMomentum` (`lib/fyp.ts`) |
| 3 | Analisis format dan durasi | Tersedia | `performanceByDuration`, `durationCoverage` |
| 4 | Deteksi pola interaksi | Tersedia | `engagementRateOf`, `performanceByHour`/`Weekday` |
| 5 | Analisis tren | Butuh data historis memadai | `topicMomentum` — topik satu-sisi tidak dihitung |
| 6 | Indikator shareability | Tersedia dari shares/saves | `perThousand`, `fypBenchmark` |
| 7 | **Skor potensi FYP** | **Estimasi relatif**, bukan prediksi algoritma | `assessContent`/`fypAssessments`; halaman `/fyp` |
| 8 | Rekomendasi script dan caption | Layer 2 LLM baru; belum ada di fase ini | **belum dikerjakan** (sesuai batas fase) |
| 9 | Analisis hook 3 detik | **Hanya mungkin untuk YouTube** (retensi) | Selalu `unavailable` dengan alasan tertulis (`FYP_HOOK_REASON`) |

**Larangan tegas:** tidak boleh ada klaim atau antarmuka yang menyiratkan jaminan
masuk FYP. Skor harus disajikan sebagai perbandingan terhadap konten sendiri.

**Deliverable:** FYP & Viral Potential Intelligence dengan batas yang dinyatakan terbuka.

### Cara skor dinyatakan jujur

- Pembanding **selalu dari kanal yang sama**. `fypAssessments` mewajibkan argumen
  `platform`; tidak ada bentuk pemanggilan yang mencampur kanal, karena definisi
  tayangan tiap platform berbeda.
- `FYP_CAVEAT` ditampilkan sebagai kartu peringatan di atas daftar, bukan catatan
  kaki kecil.
- Indikator `hook` **tidak pernah** diisi angka: ia selalu muncul di daftar
  “belum tersedia” beserta alasan yang dapat diperiksa.
- Topik yang hanya muncul di satu sisi jendela tren tidak menghasilkan arah tren;
  ia ditandai `unavailable`, bukan ditebak.
- Bobot indikator dinyatakan terbuka di antarmuka dan diakui sebagai pilihan, bukan
  hasil kalibrasi terhadap data FYP nyata — data itu tidak ada.

### Bukti verifikasi (dari disk, bukan laporan)

- `npx tsc --noEmit` — bersih.
- `npm test` — 102 lulus, 0 gagal (20 baru di `tests/fyp.test.ts`).
- `npm run lint` — bersih.
- `npm run build` — sukses; rute `/fyp` terdaftar.

### Batas yang belum tertutup

- Pekerjaan 8 (rekomendasi script/caption) menunggu Layer 2 LLM; sengaja tidak
  dikerjakan di fase ini.
- Analisis hook tetap kosong sampai kurva retensi YouTube Analytics benar-benar
  ditarik ke basis data.

---

## Phase 4 — Sales & Conversion Intelligence · SEBAGIAN (item 1, 2, 6)

**Tujuan:** menghubungkan aktivitas konten dengan hasil penjualan. Ini fase dengan
nilai bisnis terbesar dan juga ketergantungan eksternal paling besar.

| No | Pekerjaan | Prasyarat |
| --- | --- | --- |
| 1 | Website tracking | Skrip pelacak + endpoint penerima |
| 2 | UTM attribution | Konvensi parameter disepakati lebih dulu |
| 3 | Lead tracking | WhatsApp Business atau CRM |
| 4 | Order integration | Marketplace (Shopee/Tokopedia) — **verifikasi akses lebih dulu** |
| 5 | Revenue tracking | Sistem transaksi |
| 6 | Funnel conversion | Pekerjaan 1–5 |
| 7 | Revenue attribution | Pekerjaan 6 + jendela atribusi yang disepakati |

**Urutan internal yang aman:** website + UTM lebih dulu. Keduanya tidak bergantung
pada pihak ketiga dan langsung membuat tahap `link clicks → product visits` terukur.
Empat tahap terakhir baru dikerjakan setelah integrasi eksternal terbukti berjalan.

**Aturan yang tidak boleh dilanggar:** setiap angka funnel wajib menyebut sumbernya.
Bila `orders` belum terhubung, tampilkan `not_connected` — **jangan** menampilkan
estimasi, dan **jangan** memakai `web_daily.conversions` dari seed sebagai
pengganti, karena itu angka ilustratif.

**Deliverable:** dashboard yang menunjukkan hubungan konten → leads → transaksi →
pendapatan, dengan setiap tahap yang belum terhubung ditandai jujur.

### Yang sudah dikerjakan

- **Item 1 — pelacakan website.** Skrip first-party [`public/track.js`](../public/track.js)
  dan endpoint penerima [`app/api/track/route.ts`](../app/api/track/route.ts).
  Peristiwa disimpan di tabel `site_events` (migrasi `0006_site_events.sql`)
  dengan kunci idempotensi `source_ref`.
- **Item 2 — atribusi UTM.** Parameter kampanye dinormalkan di
  [`lib/tracking.ts`](../lib/tracking.ts) dan dikelompokkan per kampanye + konten
  oleh `campaignAttribution` di [`lib/sales.ts`](../lib/sales.ts).
- **Item 6 — corong konversi.** `salesFunnel` di [`lib/sales.ts`](../lib/sales.ts)
  dan halaman [`app/sales/page.tsx`](../app/sales/page.tsx).

### Cara angka corong dinyatakan jujur

- Setiap tahap membawa `provenance`. Tahap yang belum punya sumber data
  berstatus `not_connected` dengan `value: null` — **bukan `0`**, karena nol akan
  terbaca “kosong” padahal artinya “tidak diketahui”.
- Peristiwa `lead` dan `order` dari pelacak browser **disimpan sebagai bukti**,
  tetapi **tidak** diangkat menjadi prospek, pesanan, atau pendapatan. Tahapnya
  tetap `not_connected`; jumlah sinyal dilaporkan terpisah sebagai sinyal.
- Rasio antar tahap (`stepRate`, `totalRate`) hanya dihitung bila kedua tahap
  benar-benar terukur; jika tidak, rasionya `null` — bukan `0`.
- `mixesProvenance` menandai corong yang mencampur data ilustratif dan data
  terukur, agar pembacanya tidak menyamakan keduanya.
- Kunjungan tanpa UTM membentuk kelompok `campaign: null` tersendiri dan tidak
  dibuang, sehingga atribusi tidak tampak lebih lengkap daripada kenyataannya.

### Bukti verifikasi (dari disk, bukan laporan)

- `npx tsc --noEmit` — bersih.
- `npm test` — 123 lulus, 0 gagal (21 baru untuk `tracking` dan `sales`).
- `npm run lint` — bersih.
- `npm run build` — sukses; rute `/sales` dan `/api/track` terdaftar.

### Batas yang belum tertutup

- **Item 3, 4, 5, dan 7** menunggu integrasi eksternal (WhatsApp/CRM, marketplace,
  sistem transaksi). Selama itu, tahap `leads`, `orders`, dan `revenue` tetap
  `not_connected`.
- Migrasi `0006_site_events.sql` **belum diterapkan** ke D1 remote. Kode
  penerimanya sudah siap, tetapi tabelnya belum ada di remote.
- `public/track.js` dimuat dari proxy situs pemasang; belum ada pemasangan nyata
  yang menghasilkan peristiwa pertama.

---

## Phase 5 — Hybrid AI Intelligence

**Tujuan:** mengubah data menjadi rekomendasi bisnis yang relevan dan dapat diperiksa.

Prasyarat mutlak: Phase 1 selesai. Menjalankan LLM di atas angka yang belum punya
provenance akan menghasilkan penjelasan yang meyakinkan untuk data yang salah.

| No | Pekerjaan | Kriteria selesai |
| --- | --- | --- |
| 1 | Integrasi provider LLM | Kunci disimpan sebagai secret Worker, tidak pernah ke klien |
| 2 | Context builder | Konteks dibangun dari Unified Data Layer, bukan dari kueri langsung |
| 3 | Orkestrasi analisis | Layer 1 → Layer 2 → Layer 3 |
| 4 | Luaran terstruktur | Sesuai `AIRecommendation` di dokumen arsitektur |
| 5 | Validator bukti | Rekomendasi tanpa angka pendukung ditolak, bukan ditampilkan |
| 6 | Penyimpanan rekomendasi | Termasuk `modelVersion` dan `promptVersion` |
| 7 | Pencatatan pemakaian dan biaya | Token dan biaya per permintaan tercatat |
| 8 | Uji kualitas | Evaluasi berkala terhadap rekomendasi masa lalu |

**Deliverable:** AI Business Advisor dengan rekomendasi berbasis bukti.

---

## Phase 6 — Competitor & Experiment Intelligence

**Tujuan:** mengukur strategi kompetitif dan membuktikan apakah rekomendasi berhasil.

| No | Pekerjaan | Catatan |
| --- | --- | --- |
| 1 | Pemantauan kompetitor | Batas data per platform harus diverifikasi lebih dulu |
| 2 | Benchmarking konten | Membandingkan konten sendiri dengan kompetitor |
| 3 | Analisis tren kompetitor | — |
| 4 | Pencatatan eksperimen A/B | Perlu definisi hipotesis dan metrik keberhasilan |
| 5 | Perbandingan kampanye | — |
| 6 | Pelacakan hasil rekomendasi | Menutup siklus dari Phase 5 |

**Catatan:** tanpa pekerjaan 6, "Recommend" hanya menghasilkan saran yang tidak
pernah dibuktikan. Ini yang membedakan sistem ini dari dashboard biasa.

**Deliverable:** Competitive Intelligence dan Optimization Engine.

---

## Phase 7 — Business Performance Intelligence

**Tujuan:** mengukur hasil keseluruhan investasi pemasaran.

| No | Pekerjaan | Prasyarat |
| --- | --- | --- |
| 1 | Dashboard pendapatan | Phase 4 |
| 2 | ROI pemasaran | Data biaya + pendapatan |
| 3 | Customer acquisition cost | Data biaya + jumlah pelanggan |
| 4 | Analisis pembelian berulang | Identitas pelanggan |
| 5 | Kontribusi per kanal | Atribusi dari Phase 4 |
| 6 | Pelaporan pertumbuhan bisnis | — |
| 7 | Rekomendasi strategis | Phase 5 + 6 |

**Peringatan:** pekerjaan 2 dan 3 **tidak dapat dikerjakan** tanpa data biaya.
Sesuai prinsip *attribution before ROI*, jangan menampilkan angka ROI sebelum
sumber biaya dan pendapatan benar-benar terhubung dan dapat ditelusuri.

**Deliverable:** Business Growth Dashboard.

---

## Urutan eksekusi teknis

```
Phase 1.1  Prasyarat pemblokir (provenance, jendela, diagnosis, label status)
   ↓
Phase 1.2  Penyelesaian modul A, B, C
   ↓
Phase 1.3  Harness pengujian
   ↓
Phase 2    Unified Data Layer (+ multi-tenancy + penjagaan baca)
   ↓
   ├── Phase 3  FYP & Content Intelligence
   └── Phase 4  Sales & Conversion Intelligence
          ↓
       Phase 5  Hybrid AI Intelligence
          ↓
       Phase 6  Competitor & Experiment
          ↓
       Phase 7  Business Performance
```

Phase 3 dan 4 dapat dikerjakan paralel setelah Phase 2 selesai, tetapi Phase 5
memerlukan keduanya karena rekomendasi AI harus mencakup konteks konten dan konteks
penjualan sekaligus.

---

## Yang perlu diverifikasi sebelum dijanjikan

Jangan menyanggupi hal-hal berikut sebelum ada bukti dari dokumentasi dan izin
aplikasi yang sebenarnya:

| Hal | Risiko |
| --- | --- |
| Retensi/hook untuk TikTok dan Instagram | Kemungkinan besar tidak tersedia |
| Jam aktif audiens di semua platform | Tidak tersedia |
| Demografi audiens Instagram | Bergantung ambang minimum pengikut |
| Akses transaksi Shopee/Tokopedia | Bergantung persetujuan partner |
| Atribusi multi-sentuh | Butuh identitas pengunjung, sering mustahil tanpa login |
| Data kompetitor | Sangat terbatas untuk akun yang bukan milik sendiri |

Menjanjikan sinkronisasi data yang tidak disediakan platform adalah cara tercepat
kehilangan kepercayaan pengguna.

---

## Langkah berikutnya

Kerjakan **Phase 1.1** lebih dulu: provenance, penyaringan rentang berbasis tanggal,
generalisasi diagnosis, dan perbaikan label status koneksi. Rincian perubahannya ada
di [DATABASE_MIGRATION_PLAN.md](./DATABASE_MIGRATION_PLAN.md).

Belum ada kode fitur baru yang ditulis. Fase 0 hanya menghasilkan dokumen ini.
