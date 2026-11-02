# FEATURE_GAP_ANALYSIS

Perbandingan antara kondisi aktual (lihat [EXISTING_SYSTEM_AUDIT.md](./EXISTING_SYSTEM_AUDIT.md))
dengan 10 modul A–J pada brief produk.

Tanggal: 2026-10-31 · Commit acuan: `255eb0b`

Legenda status:

- **Selesai** — berfungsi dengan data yang dapat dipertanggungjawabkan.
- **Parsial** — ada, tetapi cakupan atau sumber datanya belum memadai.
- **Kerangka** — logikanya ada, tetapi keluaran belum dapat dipercaya untuk data nyata.
- **Belum ada** — tidak ada sama sekali.

---

## 1. Matriks modul A–J

| Modul | Nama | Status | Ringkasan |
| --- | --- | --- | --- |
| A | Channel Intelligence | **Parsial** | KPI dan tren per kanal sudah lengkap; skor kesehatan kanal belum ada |
| B | Audience Intelligence | **Parsial** | Hanya jam dan hari aktif; demografi audiens belum ada |
| C | Content Intelligence | **Parsial** | Top konten, format, topik sudah ada; hook, retensi, caption belum |
| D | FYP & Viral Potential | **Belum ada** | Tidak ada analisis potensi distribusi |
| E | Sales Conversion Intelligence | **Parsial** | Hanya sampai `linkClicks`; leads, order, revenue belum ada |
| F | Content-to-Sales Strategy | **Belum ada** | Tidak ada pemetaan konten ke tahap perjalanan pembeli |
| G | Competitor Intelligence | **Belum ada** | Tidak ada tabel maupun konektor kompetitor |
| H | AI Content Recommendation | **Kerangka** | Mesin statistik ada, LLM dan generator konten belum ada |
| I | Experiment & Optimization | **Belum ada** | Tidak ada pencatatan eksperimen |
| J | Business Performance Intelligence | **Belum ada** | Tidak ada data transaksi maupun biaya |

Ringkasan: dari 10 modul, **0 selesai, 4 parsial, 1 kerangka, 5 belum ada.**
Yang belum ada seluruhnya berada di Phase 2–7.

---

## 2. Rincian per modul

### A. Channel Intelligence — Parsial

| Kebutuhan | Kondisi | Bukti / celah |
| --- | --- | --- |
| Pertumbuhan pengikut | Ada | `platformAggregates().followersGained` |
| Views dan reach | Ada | `lib/metrics.ts` — views, reach, impressions |
| Engagement rate | Ada | `engagementRateOf()` |
| Konsistensi posting | **Belum** | Tidak ada perhitungan jeda antar-unggahan |
| Performa per jenis konten | Ada | `performanceByFormat()` |
| Pertumbuhan dari waktu ke waktu | Ada | `platformTrendPoints()` |
| **Skor kesehatan kanal** | **Belum** | Tidak ada pembobotan gabungan |
| Rekomendasi perbaikan | Kerangka | Ada di `buildInsights()`, tetapi terikat ambang hardcode dan T-2 |

### B. Audience Intelligence — Parsial

| Kebutuhan | Kondisi | Bukti / celah |
| --- | --- | --- |
| Jam aktif audiens | Ada | `performanceByHour()` |
| Hari aktif audiens | Ada | `performanceByWeekday()` |
| Demografi audiens | **Belum** | Data tersedia di API untuk sebagian platform, belum ditarik |
| Minat dan kebutuhan | **Belum** | Tidak ada sumber data |
| Kesesuaian dengan target market | **Belum** | Butuh profil target dari pengguna |
| Potensi daya beli | **Belum** | Tidak ada sumber data |

Catatan penting: jam dan hari aktif di sini dihitung dari **waktu publikasi konten**,
bukan dari waktu audiens benar-benar aktif. Ini pendekatan proksi, dan berbeda arti.
Untuk jam aktif sesungguhnya diperlukan data audiens per jam dari API platform.

### C. Content Intelligence — Parsial

| Kebutuhan | Kondisi | Bukti / celah |
| --- | --- | --- |
| Topik dan tema konten | Ada | `performanceByTopic()` — topik dari kolom `content.topic` |
| Durasi video | **Belum** | Baru tersedia untuk YouTube (`YouTubeVideoList`), belum masuk analitik |
| Format konten | Ada | `performanceByFormat()` |
| Konten mana yang berhasil | Ada | `topContent()`, `topContentByEngagement()` |
| **Mengapa berhasil** | **Belum** | Tidak ada analisis kausal |
| Hook 3 detik pertama | **Belum** | Butuh analisis retensi atau pengolahan teks/audio |
| Storytelling, visual, audio | **Belum** | Di luar jangkauan API |
| Caption dan hashtag | **Belum** | Tidak ada tabel maupun analisis |
| CTA | **Belum** | Tidak ada penandaan CTA pada konten |
| Retention / completion rate | **Belum** | Hanya mungkin untuk YouTube; belum ditarik |

### D. FYP & Viral Potential — Belum ada

Tidak ada satu pun komponen. Yang dibutuhkan: hook strength, shareability,
save potential, relevansi tren, dan skor gabungan.

Batas yang wajib dipegang (tertulis di brief dan tidak boleh dilanggar): skor ini
adalah **estimasi berdasarkan indikator yang tersedia**, bukan prediksi algoritma
platform. Tidak ada bukti bahwa model dapat memprediksi FYP; yang dapat disajikan
adalah daya tarik relatif terhadap konten sendiri.

### E. Sales Conversion Intelligence — Parsial

Rantai funnel dan posisi kita sekarang:

```
Views              ✅ ada (social_daily.views)
  ↓
Profile visits     ✅ ada (social_daily.profile_visits) — hanya Instagram & YouTube
  ↓
Link clicks        ✅ ada (social_daily.link_clicks) — hanya dari API platform
  ↓
Product visits     ❌ belum ada (butuh UTM + tracking website)
  ↓
Leads              ❌ belum ada (butuh WhatsApp/CRM)
  ↓
Orders             ❌ belum ada (butuh integrasi marketplace)
  ↓
Revenue            ❌ belum ada
```

Yang sudah ada: rasio klik terhadap tayangan (`linkCtr`), dan jumlah konversi
website dari tabel seed (`web_daily.conversions`) — **bukan** konversi nyata.
`web_daily`, `sources`, dan `pages` seluruhnya masih berasal dari seed.

Kesimpulan: 3 dari 6 tahap funnel belum dapat dihitung. Funnel tidak lengkap
tidak boleh ditampilkan seolah lengkap.

### F. Content-to-Sales Strategy — Belum ada

Belum ada pemetaan konten ke tahap perjalanan pembeli (awareness → edukasi →
demonstrasi → testimoni → perbandingan → promosi → CTA). Bergantung pada E.

### G. Competitor Intelligence — Belum ada

Tidak ada tabel kompetitor, tidak ada konektor, tidak ada cara memasukkan akun
kompetitor. Perlu diperhatikan: untuk Instagram, data akun lain sangat terbatas
via API; sebagian besar kompetitor hanya dapat dipantau melalui jumlah pengikut
dan konten publik. Perlu verifikasi batasan sebelum menjanjikan fitur ini.

### H. AI Content Recommendation — Kerangka

Yang sudah ada (`lib/ai.ts`): forecast regresi linear, deteksi anomali z-score,
diagnosis lintas kanal, 6 insight berbasis aturan, laporan otomatis, dan copilot
dengan pencocokan kata kunci.

Yang belum ada: LLM, pengenalan pola, generasi ide/script/caption/hashtag,
kalender publikasi, dan validasi rekomendasi.

Celah terbesar bukan pada "belum ada LLM", melainkan pada **T-2**: `diagnoseTrafficGap`
mencari literal `/promo-oktober` dan menghasilkan kalimat jadi untuk satu skenario.
Fungsi ini harus digeneralisasi sebelum LLM ditambahkan — kalau tidak, LLM akan
menjelaskan temuan yang salah dengan sangat meyakinkan.

### I. Experiment & Optimization — Belum ada

Tidak ada tabel eksperimen, tidak ada pencatatan hasil, tidak ada pengukuran
sebelum/sesudah. Tanpa ini, tidak ada cara membuktikan rekomendasi berhasil.

### J. Business Performance Intelligence — Belum ada

Tidak ada data transaksi, biaya, maupun pelanggan. `web_daily.conversions` adalah
angka ilustratif, dan tidak ada tabel `orders`, `order_items`, atau `revenue_events`.

---

## 3. Ketersediaan data per platform

Bagian ini menentukan modul mana yang **mungkin** dikerjakan secara jujur.
Setiap baris perlu diverifikasi ulang terhadap dokumentasi resmi dan izin aplikasi
sebelum dijanjikan ke pengguna.

| Metrik | Instagram | Facebook | YouTube | TikTok |
| --- | --- | --- | --- | --- |
| Pengikut | Ya | Ya | Ya | Ya |
| Tayangan / views | Ya | Ya | Ya | Ya (per video) |
| Jangkauan | Ya | Ya | — (pakai tayangan) | — |
| Like / komentar / bagi | Ya | Ya | Ya | Ya |
| Simpan / saves | Ya | — | — | — |
| Kunjungan profil | Ya | — | — | — |
| Klik tautan keluar | Ya | — | — | — |
| Demografi audiens | Ya (syarat minimum pengikut) | Ya | — (tidak tersedia) | Belum ada |
| Jam aktif audiens | Belum ada | Belum ada | Belum ada | Belum ada |
| Retensi / completion rate | Belum ada | Belum ada | **Ya** (Analytics API) | Belum ada |
| Daftar video + durasi | — | — | Ya (sudah dipakai di `/api/youtube/videos`) | Ya (perlu konektor) |
| Daftar konten | Ya | Ya | Ya | Ya |
| Leads / order / revenue | Belum ada | Belum ada | Belum ada | Belum ada |

Yang paling penting dari tabel ini: **kolom "jam aktif audiens" kosong di semua
platform.** Modul B saat ini mustahil dikerjakan secara jujur dengan data API
saja, dan retensi hanya tersedia untuk YouTube.

Konsekuensi untuk desain: untuk TikTok dan Instagram, klaim "jam terbaik" harus
dinyatakan sebagai **waktu publikasi yang historisnya paling berhasil**, bukan
sebagai "jam aktif audiens".

---

## 4. KPI bertingkat: posisi sekarang

| Level | KPI | Sumber data hari ini | Status |
| --- | --- | --- | --- |
| Awareness | reach, impressions, views | API platform (sebagian) + seed | **Campur** |
| Engagement | likes, comments, shares, saves | API platform (sebagian) + seed | **Campur** |
| Content quality | retention, completion | tidak ada | **Kosong** |
| Traffic | profile visits, link clicks | API platform (sebagian) + seed | **Campur** |
| Leads | inquiries, WhatsApp clicks | tidak ada | **Kosong** |
| Conversion | orders, conversion rate | tidak ada (`web_daily.conversions` = seed) | **Kosong** |
| Business | revenue, profit, ROI | tidak ada | **Kosong** |

Tiga level teratas belum punya sumber data apa pun. Itu berarti **setengah tangga
KPI belum dapat diisi**, dan menampilkannya sekarang hanya bisa dilakukan dengan
angka karangan — yang dilarang.

---

## 5. Prasyarat yang harus diselesaikan lebih dulu

Berurutan, tidak dapat dilompati:

1. **Provenance data (T-1).** Setiap baris metrik harus punya penanda asal
   (`platform-api` / `website-tracker` / `import` / `seed`) dan status validasi.
   Tanpa ini, tidak ada angka yang dapat ditandai "nyata" atau "contoh".

2. **Generalisasi `diagnoseTrafficGap` (T-2).** Hentikan keluaran kalimat jadi
   untuk skenario yang belum tentu terjadi.

3. **Pemotongan jendela berbasis tanggal (T-3).** Ganti `slice` berbasis posisi
   dengan penyaringan berdasarkan `date` dan `dataset.range`.

4. **Multi-tenancy (T-4) dan penjagaan baca (T-5).** Prasyarat sebelum data
   penjualan masuk.

Setelah empat prasyarat ini, barulah Phase 2 dan seterusnya dapat dikerjakan
tanpa membangun di atas fondasi yang menyesatkan.
