# TARGET_ARCHITECTURE

Arsitektur tujuan **Social Media Business Intelligence** untuk segmen UMKM &
online seller, disesuaikan dengan struktur aplikasi yang sudah ada.

Tanggal: 2026-10-31 · Commit acuan: `255eb0b`

Prinsip utama: **ini arsitektur target, bukan rencana rewrite.** Kode, tabel, dan
halaman yang sudah berfungsi tetap dipakai. Yang ditambahkan adalah lapisan yang
belum ada.

---

## 1. Lapisan target

```
┌──────────────────────────────────────────────────────────────┐
│ PRESENTATION                                                 │
│ Dashboard · Channel · Audience · Content · FYP · Sales       │
│ AI Advisor · Experiments · Business Performance              │
│ → app/ (9 halaman yang sudah ada + halaman baru)             │
└──────────────────────────────────────────────────────────────┘
                              ▲
┌──────────────────────────────────────────────────────────────┐
│ APPLICATION SERVICES                                         │
│ Channel · Content · Audience · Sales · Competitor            │
│ → lib/metrics.ts (ada) + lib/services/ (baru)                │
└──────────────────────────────────────────────────────────────┘
                              ▲
┌──────────────────────────────────────────────────────────────┐
│ UNIFIED MARKETING DATA LAYER                                 │
│ Normalization · Provenance · Validation · Attribution        │
│ → lib/data.ts (ada, diperluas) + lib/data-layer/ (baru)      │
└──────────────────────────────────────────────────────────────┘
                              ▲
┌──────────────────────────────────────────────────────────────┐
│ INTEGRATION (adapter per provider)                           │
│ Social APIs · Website · UTM · WhatsApp · CRM · Marketplace   │
│ → lib/meta.ts, lib/youtube.ts (ada) + lib/providers/ (baru)  │
└──────────────────────────────────────────────────────────────┘
                              ▲
┌──────────────────────────────────────────────────────────────┐
│ HYBRID INTELLIGENCE ENGINE                                   │
│ Determininistic · LLM · Recommendation Validator             │
│ → lib/ai.ts (ada, jadi Layer 1) + lib/intelligence/ (baru)   │
└──────────────────────────────────────────────────────────────┘
                              ▼
        BUSINESS OUTCOMES: Growth · Leads · Conversion · Revenue · ROI
```

Catatan: Hybrid Intelligence Engine **membaca** Unified Data Layer, bukan berdiri
di atas Integration. Ia tidak boleh memanggil API eksternal secara langsung.

---

## 2. Aturan pemetaan ke struktur yang ada

| Lapisan | Lokasi | Perlakuan |
| --- | --- | --- |
| Presentation | `app/**/page.tsx`, `components/` | **Dipertahankan.** Halaman baru ditambahkan, tidak ada yang diganti |
| Application services | `lib/metrics.ts` | **Dipertahankan apa adanya.** Penambahan ke `lib/services/` |
| Unified Data Layer | `lib/data.ts` | **Diperluas**, bukan diganti. `getDataset()` tetap satu-satunya pintu baca |
| Integration | `lib/meta.ts`, `lib/youtube.ts`, `lib/sync.ts` | **Dipertahankan.** Kontrak provider diselaraskan bertahap |
| Intelligence | `lib/ai.ts` | **Dipertahankan sebagai Layer 1.** LLM ditambahkan sebagai Layer 2 |

**Yang tidak boleh dilakukan:**

- Membuat ulang halaman yang sudah berfungsi.
- Mengganti nama tabel yang sudah ada (`accounts` tetap `accounts`, bukan
  `social_accounts`; `content` tetap `content`, bukan `social_posts`).
- Menambahkan ORM. Prepared statement D1 langsung tetap dipakai.
- Mengaktifkan PPR/Cache Components (alasan teknis terdokumentasi di `next.config.ts`).

---

## 3. Unified Marketing Data Layer

### 3.1 Tanggung jawab

1. **Normalization** — menyamakan istilah lintas sumber. Contoh: `views` (TikTok,
   YouTube), `impressions` (Instagram, Facebook), dan `pageviews` (website) adalah
   tiga hal berbeda yang tidak boleh dijumlahkan begitu saja.
2. **Provenance** — mencatat asal setiap angka.
3. **Validation** — menolak baris yang tidak memenuhi syarat minimum.
4. **Attribution** — menghubungkan konten dengan hasil bisnis.
5. **Freshness** — menghitung kesegaran data per sumber.

### 3.2 Provenance

Setiap baris metrik wajib memiliki tiga hal (sesuai prinsip brief):

| Kolom | Isi | Contoh |
| --- | --- | --- |
| `source_kind` | Asal data | `platform-api`, `website-tracker`, `whatsapp`, `marketplace`, `import`, `seed` |
| `source_ref` | Identitas di sistem asal, untuk deduplication | `ig:1791234…`, `ga4:session-2026-10-30` |
| `measured_period` | Periode pengukuran | `2026-10-30` (harian), `2026-10-01..2026-10-31` (agregat) |

Konsekuensi yang harus diterapkan di seluruh UI: tanda "Data ilustratif" tidak lagi
global di header, melainkan **per angka** — diturunkan dari `source_kind`.

### 3.3 Status data

Status yang dipakai konsisten di seluruh dashboard:

```ts
export type DataStatus =
  | "connected"     // sumber sudah terhubung
  | "syncing"       // sedang mengambil data
  | "synced"        // data berhasil diperbarui
  | "stale"         // data ada, tetapi melewati jadwal pembaruan
  | "error"         // sinkronisasi gagal
  | "not_connected" // sumber belum terhubung
  | "unavailable";  // platform tidak menyediakan metrik tersebut
```

`unavailable` adalah yang paling sering dilupakan dan paling penting. Contoh nyata:
retensi video tidak tersedia untuk TikTok dan Instagram (lihat
[FEATURE_GAP_ANALYSIS.md](./FEATURE_GAP_ANALYSIS.md) bagian 3). Nilai yang benar
untuk sel itu adalah `unavailable` — **bukan `0`, dan bukan angka perkiraan.**

Aturan tampilan:

| Status | Yang ditampilkan |
| --- | --- |
| `synced` | Angka + waktu sinkronisasi |
| `stale` | Angka + peringatan kesegaran |
| `syncing` | Indikator proses, angka lama disembunyikan |
| `not_connected` | Ajakan menghubungkan, **tanpa angka** |
| `unavailable` | Keterangan "tidak disediakan platform", **tanpa angka** |
| `error` | Pesan kegagalan + tindakan yang bisa diambil |

---

## 4. Integration layer

### 4.1 Kontrak provider

Selaras dengan kontrak di brief, disesuaikan dengan pola `lib/sync.ts` yang sudah
ada (yang mengembalikan `AccountSyncResult` alih-alih melempar pengecualian):

```ts
export interface SyncRange {
  start: string;
  end: string;
}

export interface ProviderSyncResult {
  sourceKind: SourceKind;
  status: "ok" | "skipped" | "error";
  message: string;
  /** Jumlah baris metrik yang benar-benar tertulis. */
  written: number;
}

export interface MarketingDataProvider {
  readonly kind: SourceKind;
  /** Memeriksa apakah kredensial masih sah, tanpa menulis data. */
  validateConnection(): Promise<boolean>;
  syncMetrics(range: SyncRange): Promise<ProviderSyncResult>;
  disconnect(): Promise<void>;
}
```

Perbedaan dari proposal awal brief:

- Tidak ada `connect()`. Alur izin sudah ditangani terpisah oleh
  `app/api/oauth/*/start|callback`. Provider tidak boleh memiliki alur izinnya
  sendiri karena itu akan menduplikasi penanganan `state`, cookie, dan enkripsi.
- Ditambahkan `written` supaya hasil sinkronisasi dapat diperiksa, bukan hanya
  dilaporkan berhasil/gagal.

### 4.2 Urutan integrasi

| Prioritas | Sumber | Kondisi saat ini |
| --- | --- | --- |
| P0 | Konektor sosial yang ada | Sudah jalan (Meta, Google) |
| P1 | Website tracking | Belum ada |
| P1 | UTM tracking | Belum ada |
| P2 | WhatsApp Business | Belum ada |
| P2 | CRM / sumber lead | Belum ada |
| P3 | Marketplace | Belum ada |

Wajib diverifikasi sebelum dijanjikan: akses API, izin aplikasi, batasan akun,
ketersediaan webhook, dan apakah metrik yang diminta benar-benar disediakan.
Jangan pernah mengiklankan sinkronisasi data yang tidak disediakan platform.

---

## 5. Hybrid Intelligence Engine

### 5.1 Tiga lapisan

```
AI Intelligence Engine
│
├── Data Context Builder          ← dari Unified Data Layer
│   ├── Channel Context
│   ├── Audience Context
│   ├── Content Context
│   ├── Competitor Context
│   └── Sales Context
│
├── LAYER 1 · Deterministic Analytics     ← lib/metrics.ts + lib/ai.ts (ADA)
│   ├── KPI Calculator
│   ├── Trend Detector
│   ├── Forecast Engine
│   ├── Anomaly Detector
│   ├── Funnel Calculator                 ← baru
│   └── Attribution Engine                ← baru
│
├── LAYER 2 · LLM Engine                  ← baru (lib/intelligence/llm/)
│   ├── Content Strategist
│   ├── Growth Advisor
│   ├── Sales Advisor
│   └── Competitor Analyst
│
└── LAYER 3 · Recommendation Validator    ← baru (lib/intelligence/validator.ts)
    ├── Evidence Validation
    ├── Confidence Assessment
    ├── Data Availability Check
    └── Recommendation Tracking
```

### 5.2 Pembagian tanggung jawab yang tidak boleh dilanggar

| Layer | Boleh | **Tidak boleh** |
| --- | --- | --- |
| 1 · Deterministik | Menghitung semua angka | Menyusun narasi strategi |
| 2 · LLM | Menjelaskan, mengenali pola, menyusun strategi | **Menghasilkan atau mengubah angka** |
| 3 · Validator | Menolak, menandai, memberi tingkat keyakinan | Menciptakan data baru |

Aturan keras: **LLM tidak pernah menjadi sumber angka.** Semua angka yang muncul di
luaran LLM harus berasal dari Layer 1 dan diverifikasi ulang oleh Layer 3 sebelum
ditampilkan. Bila LLM menyebut angka yang tidak ada di konteks, rekomendasi itu
ditolak.

### 5.3 Kontrak luaran

```ts
export interface RecommendationEvidence {
  metric: string;
  actualValue: number | null;
  /** Periode pengukuran angka tersebut, mis. "2026-10-01..2026-10-30". */
  period: string;
  sourceKind: SourceKind;
}

export interface RecommendationImpact {
  metric: string;
  estimate: number | null;
  confidence: "low" | "medium" | "high";
}

export interface AIRecommendation {
  title: string;
  objective: string;
  recommendation: string;
  evidence: RecommendationEvidence[];
  expectedImpact: RecommendationImpact[];
  actions: string[];
  dataLimitations: string[];
  /** Versi model dan versi prompt, untuk reproduksibilitas. */
  modelVersion: string;
  promptVersion: string;
}
```

Perbedaan dari proposal awal brief:

- `RecommendationEvidence` ditambahkan `period` dan `sourceKind`. Tanpa keduanya,
  "bukti" tidak dapat diperiksa — persis masalah T-1 yang sudah ada di sistem kini.
- Ditambahkan `modelVersion` dan `promptVersion` agar rekomendasi lama dapat
  ditelusuri ketika prompt berubah.

### 5.4 Aturan validasi (Layer 3)

Rekomendasi **ditolak** bila salah satu terpenuhi:

1. Menyebut angka yang tidak ada di konteks masukan.
2. Bukti hanya berasal dari `source_kind = 'seed'` tetapi dinyatakan sebagai temuan.
3. `estimate` diberi `confidence: "high"` padahal data historis kurang dari 2 periode.
4. Merekomendasikan metrik yang berstatus `unavailable` di platform terkait.
5. Tidak mencantumkan `dataLimitations` ketika ada metrik `not_connected` yang
   relevan dengan kesimpulannya.

Prediksi selalu ditandai sebagai estimasi. Tingkat keyakinan ditentukan oleh jumlah
data, bukan oleh keyakinan LLM.

---

## 6. Yang harus dibereskan lebih dulu

Tiga temuan audit memblokir arsitektur ini dan harus diselesaikan sebelum Layer 2
dan Layer 3 dibangun:

| Temuan | Alasan memblokir |
| --- | --- |
| T-1 · Tidak ada provenance | Validator tidak punya cara membedakan data nyata dari seed |
| T-2 · `diagnoseTrafficGap` terikat satu skenario | LLM akan menjelaskan temuan yang salah dengan meyakinkan |
| T-3 · Jendela berbasis posisi | Funnel dan atribusi akan menghitung pembilang/penyebut dari periode berbeda |

Urutan pengerjaannya ada di [IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md),
dan perubahan skema yang diperlukan di [DATABASE_MIGRATION_PLAN.md](./DATABASE_MIGRATION_PLAN.md).

---

## 7. Batas yang diakui secara terbuka

Arsitektur ini **tidak** dapat:

- Menjamin atau memprediksi masuknya konten ke FYP. Yang dapat disajikan hanya
  daya tarik relatif terhadap riwayat konten sendiri.
- Memberi jam aktif audiens untuk platform mana pun (tidak tersedia via API).
- Memberi retensi video untuk selain YouTube.
- Menghitung ROI tanpa data biaya dan pendapatan yang dapat ditelusuri.
- Menghitung atribusi multi-sentuh yang andal tanpa UTM dan identitas pengunjung.

Batas-batas ini harus tercermin di UI, bukan hanya di dokumen ini.
