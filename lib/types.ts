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
