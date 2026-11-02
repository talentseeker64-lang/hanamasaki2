import { connection } from "next/server";
import { type AccountRow, toAccount } from "./accounts";
import { getDb, rowsOf } from "./db";
import type {
  AudienceDimension,
  AudienceInsight,
  CommentIntent,
  CommentItem,
  ContentFormat,
  ContentItem,
  DailySocialMetric,
  DailyWebMetric,
  DataSourceKind,
  Dataset,
  LandingPage,
  Platform,
  SearchMetric,
  Sentiment,
  SiteEvent,
  TrackingEventType,
  TrafficChannel,
  TrafficSource,
} from "./types";

// Konstanta jendela tampilan tetap diekspor dari sini agar lib/metrics.ts dan
// lib/ai.ts tidak perlu mengetahui dari mana isi dataset berasal.
export { RANGE_DAYS, RANGE_TOTAL, WINDOW } from "./demo-dataset";

/* ------------------------------------------------------------------ */
/* Bentuk baris tabel D1 (snake_case)                                  */
/* ------------------------------------------------------------------ */

export interface MetaRow {
  range_start: string;
  range_end: string;
  range_days: number;
  history_start: string;
  history_end: string;
  history_days: number;
  generated_at: string;
}

export interface SocialRow {
  date: string;
  platform: string;
  views: number;
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  followers_gained: number;
  profile_visits: number;
  link_clicks: number;
  source_kind: string | null;
}

export interface ContentRow {
  id: string;
  platform: string;
  title: string;
  format: string;
  topic: string;
  published_at: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  link_clicks: number;
  duration_seconds: number | null;
  source_kind: string | null;
}

export interface AudienceRow {
  id: string;
  account_id: string;
  dimension: string;
  bucket: string;
  value: number;
  period_start: string;
  period_end: string;
  source_kind: string | null;
}

export interface CommentRow {
  id: string;
  platform: string;
  topic: string;
  text: string;
  author: string;
  sentiment: string;
  intent: string;
  created_at: string;
  likes: number;
  source_kind: string | null;
}

export interface WebRow {
  date: string;
  sessions: number;
  users: number;
  new_users: number;
  page_views: number;
  bounce_rate: number;
  avg_session_seconds: number;
  conversions: number;
  source_kind: string | null;
}

export interface SourceRow {
  source: string;
  channel: string;
  platform: string | null;
  sessions: number;
  sessions_prev: number;
  conversions: number;
  conversions_prev: number;
  bounce_rate: number;
  source_kind: string | null;
}

export interface PageRow {
  path: string;
  title: string;
  views30: number;
  views30_prev: number;
  conversions30: number;
  conversions30_prev: number;
  conversions7: number;
  conversions7_prev: number;
  avg_seconds: number;
  exit_rate: number;
  source_kind: string | null;
}

export interface SearchRow {
  query: string;
  impressions: number;
  clicks: number;
  clicks_prev: number;
  ctr: number;
  position: number;
  position_prev: number;
  source_kind: string | null;
}

export interface SiteEventRow {
  id: string;
  occurred_at: string;
  received_at: string;
  event_type: string;
  path: string;
  referrer: string | null;
  session_id: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  value: number | null;
  currency: string | null;
  source_kind: string | null;
}

/* ------------------------------------------------------------------ */
/* Kolom yang dibaca, ditulis eksplisit                                */
/* ------------------------------------------------------------------ */

/*
 * `SELECT *` sengaja tidak dipakai. Daftar eksplisit membuat kontrak baca tidak
 * ikut berubah setiap kali kolom baru ditambahkan — kolom provenance dan tenant
 * dari migrasi 0003 adalah contoh kolom yang tidak perlu dikirim ke UI.
 */

const ACCOUNT_COLUMNS =
  "id, platform, handle, display_name, followers, followers_start, connection, scopes, last_sync_at, limitation";

const SOCIAL_COLUMNS =
  "date, platform, views, reach, impressions, likes, comments, shares, saves, " +
  "followers_gained, profile_visits, link_clicks, source_kind";

const CONTENT_COLUMNS =
  "id, platform, title, format, topic, published_at, views, likes, comments, shares, " +
  "saves, link_clicks, duration_seconds, source_kind";

const AUDIENCE_COLUMNS =
  "id, account_id, dimension, bucket, value, period_start, period_end, source_kind";

const COMMENT_COLUMNS =
  "id, platform, topic, text, author, sentiment, intent, created_at, likes, source_kind";

const WEB_COLUMNS =
  "date, sessions, users, new_users, page_views, bounce_rate, avg_session_seconds, " +
  "conversions, source_kind";

const SOURCE_COLUMNS =
  "source, channel, platform, sessions, sessions_prev, conversions, conversions_prev, " +
  "bounce_rate, source_kind";

const PAGE_COLUMNS =
  "path, title, views30, views30_prev, conversions30, conversions30_prev, conversions7, " +
  "conversions7_prev, avg_seconds, exit_rate, source_kind";

const SEARCH_COLUMNS =
  "query, impressions, clicks, clicks_prev, ctr, position, position_prev, source_kind";

const SITE_EVENT_COLUMNS =
  "id, occurred_at, received_at, event_type, path, referrer, session_id, utm_source, " +
  "utm_medium, utm_campaign, utm_content, utm_term, value, currency, source_kind";

/* ------------------------------------------------------------------ */
/* Pemetaan baris -> kontrak Dataset                                   */
/* ------------------------------------------------------------------ */

/**
 * Membaca label asal data dari basis data.
 *
 * Nilai yang tidak dikenal — termasuk NULL yang ditulis versi aplikasi lama yang
 * belum mengenal kolom ini — diperlakukan sebagai `legacy-unknown`, bukan
 * dianggap data terukur. Dengan begitu baris yang asalnya tidak dapat dibuktikan
 * tidak pernah tampil sebagai data bisnis.
 */
export function toSourceKind(value: string | null): DataSourceKind {
  if (
    value === "platform-api" ||
    value === "first-party" ||
    value === "import" ||
    value === "seed" ||
    value === "legacy-unknown"
  ) {
    return value;
  }
  return "legacy-unknown";
}

function toSocial(row: SocialRow): DailySocialMetric {
  return {
    date: row.date,
    platform: row.platform as Platform,
    views: row.views,
    reach: row.reach,
    impressions: row.impressions,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    saves: row.saves,
    followersGained: row.followers_gained,
    profileVisits: row.profile_visits,
    linkClicks: row.link_clicks,
    sourceKind: toSourceKind(row.source_kind),
  };
}

function toContent(row: ContentRow): ContentItem {
  return {
    id: row.id,
    platform: row.platform as Platform,
    title: row.title,
    format: row.format as ContentFormat,
    topic: row.topic,
    publishedAt: row.published_at,
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    saves: row.saves,
    linkClicks: row.link_clicks,
    durationSeconds: row.duration_seconds,
    sourceKind: toSourceKind(row.source_kind),
  };
}

/**
 * Membaca dimensi demografi dari basis data.
 *
 * Baris dengan dimensi di luar kosakata yang dikenal akan dibuang oleh pemanggil,
 * bukan ditebak menjadi dimensi lain — nilai yang tidak dikenal berarti ada
 * penulis yang menyimpang dari kontrak, dan menampilkannya sebagai dimensi lain
 * akan menyesatkan.
 */
function toAudienceDimension(value: string): AudienceDimension | null {
  if (value === "age" || value === "gender" || value === "country" || value === "city") {
    return value;
  }
  return null;
}

function toAudience(row: AudienceRow): AudienceInsight | null {
  const dimension = toAudienceDimension(row.dimension);
  if (dimension === null) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    dimension,
    bucket: row.bucket,
    value: row.value,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    sourceKind: toSourceKind(row.source_kind),
  };
}

function toComment(row: CommentRow): CommentItem {
  return {
    id: row.id,
    platform: row.platform as Platform,
    topic: row.topic,
    text: row.text,
    author: row.author,
    sentiment: row.sentiment as Sentiment,
    intent: row.intent as CommentIntent,
    createdAt: row.created_at,
    likes: row.likes,
    sourceKind: toSourceKind(row.source_kind),
  };
}

function toWeb(row: WebRow): DailyWebMetric {
  return {
    date: row.date,
    sessions: row.sessions,
    users: row.users,
    newUsers: row.new_users,
    pageViews: row.page_views,
    bounceRate: row.bounce_rate,
    avgSessionSeconds: row.avg_session_seconds,
    conversions: row.conversions,
    sourceKind: toSourceKind(row.source_kind),
  };
}

function toSource(row: SourceRow): TrafficSource {
  return {
    source: row.source,
    channel: row.channel as TrafficChannel,
    platform: row.platform as Platform | null,
    sessions: row.sessions,
    sessionsPrev: row.sessions_prev,
    conversions: row.conversions,
    conversionsPrev: row.conversions_prev,
    bounceRate: row.bounce_rate,
    sourceKind: toSourceKind(row.source_kind),
  };
}

function toPage(row: PageRow): LandingPage {
  return {
    path: row.path,
    title: row.title,
    views30: row.views30,
    views30Prev: row.views30_prev,
    conversions30: row.conversions30,
    conversions30Prev: row.conversions30_prev,
    conversions7: row.conversions7,
    conversions7Prev: row.conversions7_prev,
    avgSeconds: row.avg_seconds,
    exitRate: row.exit_rate,
    sourceKind: toSourceKind(row.source_kind),
  };
}

function toSearch(row: SearchRow): SearchMetric {
  return {
    query: row.query,
    impressions: row.impressions,
    clicks: row.clicks,
    clicksPrev: row.clicks_prev,
    ctr: row.ctr,
    position: row.position,
    positionPrev: row.position_prev,
    sourceKind: toSourceKind(row.source_kind),
  };
}

/**
 * Membaca jenis peristiwa pelacak dari basis data.
 *
 * Nilai di luar kosakata dibuang oleh pemanggil, bukan ditebak menjadi jenis
 * lain. Menebaknya akan mengubah arti sebuah peristiwa — mis. peristiwa tak
 * dikenal yang dianggap `pageview` akan menambah angka kunjungan yang tidak
 * pernah terjadi.
 */
function toTrackingEventType(value: string): TrackingEventType | null {
  if (value === "pageview" || value === "product_view" || value === "lead" || value === "order") {
    return value;
  }
  return null;
}

function toSiteEvent(row: SiteEventRow): SiteEvent | null {
  const eventType = toTrackingEventType(row.event_type);
  if (eventType === null) return null;
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    receivedAt: row.received_at,
    eventType,
    path: row.path,
    referrer: row.referrer,
    sessionId: row.session_id,
    utm: {
      source: row.utm_source,
      medium: row.utm_medium,
      campaign: row.utm_campaign,
      content: row.utm_content,
      term: row.utm_term,
    },
    value: row.value,
    currency: row.currency,
    sourceKind: toSourceKind(row.source_kind),
  };
}

/* ------------------------------------------------------------------ */
/* Penyaring kueri                                                     */
/* ------------------------------------------------------------------ */

/**
 * Syarat `WHERE` untuk sebuah tabel: kepemilikan tenant dan, bila diberikan,
 * syarat tambahan seperti rentang tanggal.
 *
 * Baris yang `tenant_id`-nya NULL tetap ikut terbaca karena pemiliknya belum
 * ditetapkan; baris milik tenant lain tidak pernah ikut terbaca. Pengurutan
 * `params` mengikuti urutan `conditions`, sehingga `extra` selalu mendahului
 * parameter tenant saat di-bind.
 */
function whereClause(
  tenantId: string | null,
  extra: string[] = [],
): { where: string; params: string[] } {
  const conditions = [...extra];
  const params: string[] = [];
  if (tenantId) {
    conditions.push("(tenant_id = ? OR tenant_id IS NULL)");
    params.push(tenantId);
  }
  return {
    where: conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

/* ------------------------------------------------------------------ */
/* Penyusunan Dataset                                                  */
/* ------------------------------------------------------------------ */

/** Baris mentah hasil kueri, sebelum dipetakan ke kontrak `Dataset`. */
export interface DatasetRows {
  accounts: AccountRow[];
  social: SocialRow[];
  content: ContentRow[];
  comments: CommentRow[];
  web: WebRow[];
  sources: SourceRow[];
  pages: PageRow[];
  search: SearchRow[];
  audience: AudienceRow[];
  events: SiteEventRow[];
}

/**
 * Menyusun `Dataset` dari baris mentah.
 *
 * Dipisahkan dari `getDataset` supaya kontrak baca dapat diuji tanpa D1:
 * provenance yang tidak dikenal jatuh ke `legacy-unknown`, dimensi demografi
 * yang tidak dikenal dibuang (bukan ditebak), dan durasi yang `null` tetap
 * `null`. Baris sosial di luar rentang `history` disaring di sini; rentangnya
 * dinyatakan sebagai tanggal, bukan jumlah baris, sehingga menambah atau
 * menghapus data di luar rentang tidak menggeser periode yang dianalisis.
 */
export function assembleDataset(meta: MetaRow, rows: DatasetRows): Dataset {
  return {
    range: { start: meta.range_start, end: meta.range_end, days: meta.range_days },
    history: { start: meta.history_start, end: meta.history_end, days: meta.history_days },
    generatedAt: meta.generated_at,
    accounts: rows.accounts.map(toAccount),
    social: rows.social
      .filter((row) => row.date >= meta.history_start && row.date <= meta.history_end)
      .map(toSocial),
    content: rows.content.map(toContent),
    comments: rows.comments.map(toComment),
    web: rows.web.map(toWeb),
    sources: rows.sources.map(toSource),
    pages: rows.pages.map(toPage),
    search: rows.search.map(toSearch),
    // Baris demografi dengan dimensi tak dikenal dibuang, bukan ditebak.
    audience: rows.audience
      .map(toAudience)
      .filter((row): row is AudienceInsight => row !== null),
    // Peristiwa dengan jenis tak dikenal juga dibuang, bukan dianggap kunjungan.
    events: rows.events
      .map(toSiteEvent)
      .filter((row): row is SiteEvent => row !== null),
  };
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

/**
 * Membaca dataset dari D1 pada setiap request.
 *
 * `connection()` menandai pembacaan ini sebagai operasi request-time, sehingga
 * Next.js tidak mencoba menjalankannya saat prerender — di tahap build binding
 * D1 belum menunjuk ke database yang sebenarnya. Ini juga yang membuat halaman
 * dirender `ƒ Dynamic` (bukan PPR), karena Cache Components tidak kompatibel
 * dengan runtime Cloudflare Workers.
 *
 * Metrik sosial hanya diikutkan bila tanggalnya berada dalam rentang `history`
 * yang tercatat di `dataset_meta`. Penyaringan itu dikerjakan `assembleDataset`
 * berdasarkan tanggal, bukan jumlah baris, sehingga menambah atau menghapus
 * data di luar rentang tidak menggeser periode yang sedang dianalisis.
 */
export async function getDataset(): Promise<Dataset> {
  await connection();
  const db = await getDb();

  const meta = await db
    .prepare(
      "SELECT range_start, range_end, range_days, history_start, history_end, history_days, generated_at FROM dataset_meta WHERE id = 'current'",
    )
    .first<MetaRow>();

  if (!meta) {
    throw new Error(
      "Tabel dataset_meta masih kosong. Jalankan migrasi dan seed D1 terlebih dahulu.",
    );
  }

  const tenant = await db
    .prepare("SELECT id FROM organization ORDER BY id LIMIT 1")
    .first<{ id: string }>();
  const tenantId = tenant?.id ?? null;

  // Rentang tanggal metrik sosial disaring di `assembleDataset`, bukan di SQL,
  // supaya jaminannya tidak terpecah antara kueri dan pemetaan.
  const accounts = whereClause(tenantId);
  const social = whereClause(tenantId);
  const content = whereClause(tenantId);
  const comments = whereClause(tenantId);
  const web = whereClause(tenantId);
  const sources = whereClause(tenantId);
  const pages = whereClause(tenantId);
  const search = whereClause(tenantId);
  const audience = whereClause(tenantId);
  const events = whereClause(tenantId);

  const [
    accountResult,
    socialResult,
    contentResult,
    commentResult,
    webResult,
    sourceResult,
    pageResult,
    searchResult,
    audienceResult,
    eventResult,
  ] = await db.batch([
    db
      .prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts${accounts.where} ORDER BY sort_order`)
      .bind(...accounts.params),
    db
      .prepare(`SELECT ${SOCIAL_COLUMNS} FROM social_daily${social.where} ORDER BY platform, date`)
      .bind(...social.params),
    db
      .prepare(`SELECT ${CONTENT_COLUMNS} FROM content${content.where} ORDER BY published_at DESC`)
      .bind(...content.params),
    db
      .prepare(`SELECT ${COMMENT_COLUMNS} FROM comments${comments.where} ORDER BY created_at DESC`)
      .bind(...comments.params),
    db
      .prepare(`SELECT ${WEB_COLUMNS} FROM web_daily${web.where} ORDER BY date`)
      .bind(...web.params),
    db
      .prepare(`SELECT ${SOURCE_COLUMNS} FROM sources${sources.where} ORDER BY sort_order`)
      .bind(...sources.params),
    db
      .prepare(`SELECT ${PAGE_COLUMNS} FROM pages${pages.where} ORDER BY sort_order`)
      .bind(...pages.params),
    db
      .prepare(`SELECT ${SEARCH_COLUMNS} FROM search${search.where} ORDER BY sort_order`)
      .bind(...search.params),
    db
      .prepare(
        `SELECT ${AUDIENCE_COLUMNS} FROM audience_insights${audience.where} ORDER BY account_id, dimension, value DESC`,
      )
      .bind(...audience.params),
    db
      .prepare(
        `SELECT ${SITE_EVENT_COLUMNS} FROM site_events${events.where} ORDER BY occurred_at DESC`,
      )
      .bind(...events.params),
  ]);

  return assembleDataset(meta, {
    accounts: rowsOf<AccountRow>(accountResult),
    social: rowsOf<SocialRow>(socialResult),
    content: rowsOf<ContentRow>(contentResult),
    comments: rowsOf<CommentRow>(commentResult),
    web: rowsOf<WebRow>(webResult),
    sources: rowsOf<SourceRow>(sourceResult),
    pages: rowsOf<PageRow>(pageResult),
    search: rowsOf<SearchRow>(searchResult),
    audience: rowsOf<AudienceRow>(audienceResult),
    events: rowsOf<SiteEventRow>(eventResult),
  });
}
