export type Platform = "instagram" | "tiktok" | "youtube" | "facebook";

export type ContentFormat =
  | "reels"
  | "shorts"
  | "video"
  | "carousel"
  | "post"
  | "story";

export type Sentiment = "positive" | "neutral" | "negative";

export type CommentIntent = "question" | "complaint" | "praise" | "idea" | "other";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

/**
 * Asal sebuah baris data.
 *
 * Menentukan apakah angkanya boleh diperlakukan sebagai data bisnis:
 * `platform-api` berasal dari panggilan API yang berhasil; `first-party` diukur
 * langsung oleh sistem kita sendiri (mis. peristiwa dari pelacak website);
 * `import` berasal dari berkas yang dimasukkan pengguna; `seed` dibangkitkan
 * generator ilustratif; `legacy-unknown` berarti asalnya tidak dapat dibuktikan
 * sehingga angkanya tidak boleh dipakai sebagai dasar keputusan.
 *
 * `first-party` sengaja dipisahkan dari `platform-api`: keduanya sama-sama
 * terukur, tetapi hanya `platform-api` yang boleh dipakai sebagai bukti bahwa
 * kanal sosial benar-benar tersambung. Mencampur keduanya akan membuat status
 * koneksi kanal tampak terverifikasi oleh data yang bukan berasal dari platform.
 */
export type DataSourceKind =
  | "platform-api"
  | "first-party"
  | "import"
  | "seed"
  | "legacy-unknown";

/**
 * Ringkasan asal data untuk sekumpulan baris.
 *
 * `mixed` dipakai bila baris-barisnya tidak seragam — angka turunannya tetap
 * ditampilkan, tetapi pembacanya diberi tahu bahwa sebagian berasal dari data
 * ilustratif. `empty` berarti tidak ada baris sama sekali.
 */
export type DataProvenance = DataSourceKind | "mixed" | "empty";

/** Metrik harian per kanal sosial. Satu baris = satu platform pada satu tanggal. */
export interface DailySocialMetric {
  date: string;
  platform: Platform;
  views: number;
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  followersGained: number;
  /** Kunjungan ke halaman profil / bio. */
  profileVisits: number;
  /** Klik tautan keluar (bio / deskripsi) — jembatan menuju website. */
  linkClicks: number;
  sourceKind: DataSourceKind;
}

export interface ContentItem {
  id: string;
  platform: Platform;
  title: string;
  format: ContentFormat;
  topic: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  linkClicks: number;
  /**
   * Durasi konten dalam detik, atau `null` bila platform tidak melaporkannya.
   *
   * `null` berarti "tidak diketahui", bukan nol: konten bergambar tidak punya
   * durasi, dan sebagian platform tidak mengirimkan durasi sama sekali.
   */
  durationSeconds: number | null;
  sourceKind: DataSourceKind;
}

/**
 * Dimensi demografi audiens yang benar-benar tersedia lewat API platform.
 *
 * `hour_of_day` dan `retention` sengaja tidak ada di sini: keduanya tidak
 * disediakan API mana pun (jam aktif audiens) atau hanya milik YouTube
 * (retensi), sehingga menyediakannya akan mengundang angka karangan.
 */
export type AudienceDimension = "age" | "gender" | "country" | "city";

/**
 * Satu potongan demografi audiens untuk sebuah akun.
 *
 * `value` mengikuti `unit` pada baris basis data: proporsi audiens atau jumlah
 * orang, bergantung pada apa yang dilaporkan platform.
 */
export interface AudienceInsight {
  id: string;
  accountId: string;
  dimension: AudienceDimension;
  /** Nilai dimensi, mis. `25-34` atau `Jakarta`. */
  bucket: string;
  value: number;
  periodStart: string;
  periodEnd: string;
  sourceKind: DataSourceKind;
}

/**
 * Satu titik demografi yang baru dibaca dari API platform.
 *
 * Namanya sengaja berbeda dari `AudienceInsight`: bentuk ini belum punya
 * identitas akun, periode, maupun provenance, dan `bucket`-nya masih memakai
 * kosakata platform asalnya. Normalisasi ke kosakata basis data dikerjakan jalur
 * tulis, bukan di sini.
 */
export interface AudiencePoint {
  dimension: AudienceDimension;
  bucket: string;
  value: number;
}

export interface CommentItem {
  id: string;
  platform: Platform;
  topic: string;
  text: string;
  author: string;
  sentiment: Sentiment;
  intent: CommentIntent;
  createdAt: string;
  likes: number;
  sourceKind: DataSourceKind;
}

export interface DailyWebMetric {
  date: string;
  sessions: number;
  users: number;
  newUsers: number;
  pageViews: number;
  /** Rasio dalam persen, 0-100. */
  bounceRate: number;
  avgSessionSeconds: number;
  conversions: number;
  sourceKind: DataSourceKind;
}

export type TrafficChannel =
  | "organic"
  | "social"
  | "referral"
  | "direct"
  | "paid"
  | "email";

export interface TrafficSource {
  source: string;
  channel: TrafficChannel;
  platform: Platform | null;
  /** Sesi 30 hari terakhir. */
  sessions: number;
  /** Sesi 30 hari sebelumnya. */
  sessionsPrev: number;
  conversions: number;
  conversionsPrev: number;
  /** Rasio dalam persen, 0-100. */
  bounceRate: number;
  sourceKind: DataSourceKind;
}

export interface LandingPage {
  path: string;
  title: string;
  views30: number;
  views30Prev: number;
  conversions30: number;
  conversions30Prev: number;
  /** Konversi 7 hari terakhir dan 7 hari sebelumnya, untuk diagnosis terkini. */
  conversions7: number;
  conversions7Prev: number;
  avgSeconds: number;
  /** Rasio dalam persen, 0-100. */
  exitRate: number;
  sourceKind: DataSourceKind;
}

export interface SearchMetric {
  query: string;
  impressions: number;
  clicks: number;
  clicksPrev: number;
  /** Rasio dalam persen, 0-100. */
  ctr: number;
  position: number;
  positionPrev: number;
  sourceKind: DataSourceKind;
}

/* ------------------------------------------------------------------ */
/* Peristiwa website — pelacakan first-party                           */
/* ------------------------------------------------------------------ */

/**
 * Jenis peristiwa yang diterima pelacak website.
 *
 * Daftarnya sengaja pendek dan masing-masing punya arti tunggal. Peristiwa yang
 * tidak dapat diukur langsung (mis. "minat") tidak disediakan: menyediakannya
 * hanya akan mendorong pengisian dengan tebakan.
 */
export type TrackingEventType = "pageview" | "product_view" | "lead" | "order";

/**
 * Parameter kampanye yang menempel pada sebuah kunjungan.
 *
 * Seluruh nilainya opsional: kunjungan tanpa UTM tetap dicatat apa adanya,
 * bukan dipaksa masuk ke kampanye tertentu. `null` berarti parameternya memang
 * tidak ada, berbeda dari string kosong.
 */
export interface UtmParams {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
}

/**
 * Satu peristiwa website yang benar-benar diterima sistem.
 *
 * `occurredAt` berasal dari jam browser dan `receivedAt` dari jam server. Ketika
 * keduanya berbeda jauh, yang dipakai untuk analitik adalah `occurredAt` —
 * tetapi `receivedAt` tetap disimpan supaya selisihnya dapat diperiksa, bukan
 * disembunyikan.
 */
export interface SiteEvent {
  id: string;
  occurredAt: string;
  receivedAt: string;
  eventType: TrackingEventType;
  path: string;
  referrer: string | null;
  sessionId: string | null;
  utm: UtmParams;
  /** Nilai transaksi; `null` bila peristiwanya bukan pesanan atau nilainya tidak dikirim. */
  value: number | null;
  currency: string | null;
  sourceKind: DataSourceKind;
}

export type ConnectionState = "connected" | "needs_review" | "not_connected";

export interface ChannelAccount {
  id: string;
  platform: Platform;
  handle: string;
  displayName: string;
  followers: number;
  followersStart: number;
  connection: ConnectionState;
  scopes: string[];
  lastSyncAt: string | null;
  /** Catatan keterbatasan data dari API platform terkait. */
  limitation: string;
}

export interface Evidence {
  label: string;
  value: string;
  change?: number;
}

export interface KpiSummary {
  totalViews: number;
  totalViewsPrev: number;
  /** Rasio interaksi dalam persen. */
  engagementRate: number;
  engagementRatePrev: number;
  followers: number;
  followersPrev: number;
  sessions: number;
  sessionsPrev: number;
  conversions: number;
  conversionsPrev: number;
  linkClicks: number;
  linkClicksPrev: number;
}

export interface TrendPoint {
  date: string;
  label: string;
  socialViews: number;
  linkClicks: number;
  webSessions: number;
}

export interface Insight {
  id: string;
  title: string;
  severity: Severity;
  category: string;
  narrative: string;
  evidence: Evidence[];
  actions: string[];
}

export interface CopilotFactor {
  label: string;
  detail: string;
  evidence: Evidence[];
}

export interface CopilotAnswer {
  question: string;
  headline: string;
  matchedTopic: string;
  body: string[];
  factors: CopilotFactor[];
  actions: string[];
  confidence: "tinggi" | "sedang" | "rendah";
  dataPoints: string[];
}

export interface Dataset {
  /** Jendela tampilan (30 hari terakhir). */
  range: { start: string; end: string; days: number };
  /** Jendela pembanding yang tersedia di dataset (60 hari). */
  history: { start: string; end: string; days: number };
  generatedAt: string;
  accounts: ChannelAccount[];
  social: DailySocialMetric[];
  content: ContentItem[];
  comments: CommentItem[];
  web: DailyWebMetric[];
  sources: TrafficSource[];
  pages: LandingPage[];
  search: SearchMetric[];
  /**
   * Demografi audiens. Kosong berarti platform tidak menyediakannya — UI wajib
   * menampilkan "belum tersedia" alih-alih mengisi angka apa pun.
   */
  audience: AudienceInsight[];
  /**
   * Peristiwa website dari pelacak first-party. Kosong berarti belum ada
   * peristiwa yang diterima — bukan berarti tidak ada kunjungan.
   */
  events: SiteEvent[];
}

/* ------------------------------------------------------------------ */
/* Pengaturan organisasi — tabel D1 tersendiri, bukan bagian analitik  */
/* ------------------------------------------------------------------ */

/** Peran anggota tim. Disimpan sebagai kunci stabil; labelnya diatur di UI. */
export type TeamRole = "owner" | "admin" | "analyst" | "content_manager" | "agency";

export interface Organization {
  id: string;
  name: string;
  plan: string;
  timezone: string;
  defaultPeriod: string;
}

export interface TeamMember {
  email: string;
  name: string;
  role: TeamRole;
  scope: string;
}

export interface NotificationPreference {
  id: string;
  label: string;
  detail: string;
  enabled: boolean;
}

export interface Settings {
  organization: Organization;
  team: TeamMember[];
  notifications: NotificationPreference[];
}

/**
 * Masukan pembuatan dan pembaruan akun.
 *
 * Metrik (pengikut, tayangan, konversi) sengaja tidak ada di sini: angka itu
 * harus berasal dari API platform, bukan diketik manual.
 */
export interface AccountInput {
  platform: Platform;
  handle: string;
  displayName: string;
  connection: ConnectionState;
  scopes: string[];
  limitation: string;
}

/** Ringkasan kredensial yang aman dikirim ke klien — tanpa rahasia apa pun. */
export interface CredentialSummary {
  accountId: string;
  clientId: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Registri integrasi — tabel D1 tersendiri (migrasi 0004)             */
/* ------------------------------------------------------------------ */

/**
 * Status sebuah sumber data, dipakai konsisten di seluruh dashboard.
 *
 * Kosakata ini sengaja tidak menyatukan "belum terhubung" dengan "gagal":
 * keduanya butuh tindakan yang berbeda, dan `unavailable` (platform tidak
 * menyediakan metriknya) bukan `0` maupun perkiraan.
 */
export type DataStatus =
  | "connected"
  | "syncing"
  | "synced"
  | "stale"
  | "error"
  | "not_connected"
  | "unavailable";

/** Kelompok sumber data pada registri integrasi. */
export type IntegrationKind = "social" | "website" | "utm" | "whatsapp" | "crm" | "marketplace";

/** Status satu eksekusi sinkronisasi. */
export type SyncJobStatus = "running" | "ok" | "partial" | "error";

export interface Integration {
  id: string;
  kind: IntegrationKind;
  /** Penyedia konkret, mis. `meta`, `google`, `ga4`. */
  provider: string;
  /** Akun terkait bila berlaku; `null` untuk sumber yang bukan akun. */
  accountId: string | null;
  status: DataStatus;
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface SyncJob {
  id: string;
  integrationId: string;
  startedAt: string;
  finishedAt: string | null;
  status: SyncJobStatus;
  /** Jumlah baris metrik yang benar-benar tertulis. */
  rowsWritten: number;
  message: string;
}
