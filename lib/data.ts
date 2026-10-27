import { connection } from "next/server";
import { type AccountRow, toAccount } from "./accounts";
import { getDb, rowsOf } from "./db";
import type {
  CommentIntent,
  CommentItem,
  ContentFormat,
  ContentItem,
  DailySocialMetric,
  DailyWebMetric,
  Dataset,
  LandingPage,
  Platform,
  SearchMetric,
  Sentiment,
  TrafficChannel,
  TrafficSource,
} from "./types";

// Konstanta jendela tampilan tetap diekspor dari sini agar lib/metrics.ts dan
// lib/ai.ts tidak perlu mengetahui dari mana isi dataset berasal.
export { RANGE_DAYS, RANGE_TOTAL, WINDOW } from "./demo-dataset";

/* ------------------------------------------------------------------ */
/* Bentuk baris tabel D1 (snake_case)                                  */
/* ------------------------------------------------------------------ */

interface MetaRow {
  range_start: string;
  range_end: string;
  range_days: number;
  history_start: string;
  history_end: string;
  history_days: number;
  generated_at: string;
}

interface SocialRow {
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
}

interface ContentRow {
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
}

interface CommentRow {
  id: string;
  platform: string;
  topic: string;
  text: string;
  author: string;
  sentiment: string;
  intent: string;
  created_at: string;
  likes: number;
}

interface WebRow {
  date: string;
  sessions: number;
  users: number;
  new_users: number;
  page_views: number;
  bounce_rate: number;
  avg_session_seconds: number;
  conversions: number;
}

interface SourceRow {
  source: string;
  channel: string;
  platform: string | null;
  sessions: number;
  sessions_prev: number;
  conversions: number;
  conversions_prev: number;
  bounce_rate: number;
}

interface PageRow {
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
}

interface SearchRow {
  query: string;
  impressions: number;
  clicks: number;
  clicks_prev: number;
  ctr: number;
  position: number;
  position_prev: number;
}

/* ------------------------------------------------------------------ */
/* Pemetaan baris -> kontrak Dataset                                   */
/* ------------------------------------------------------------------ */

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
 */
export async function getDataset(): Promise<Dataset> {
  await connection();
  const db = await getDb();

  const [metaResult, accountResult, socialResult, contentResult, commentResult, webResult, sourceResult, pageResult, searchResult] =
    await db.batch([
      db.prepare("SELECT range_start, range_end, range_days, history_start, history_end, history_days, generated_at FROM dataset_meta WHERE id = 'current'"),
      db.prepare("SELECT * FROM accounts ORDER BY sort_order"),
      db.prepare("SELECT * FROM social_daily ORDER BY platform, date"),
      db.prepare("SELECT * FROM content ORDER BY published_at DESC"),
      db.prepare("SELECT * FROM comments ORDER BY created_at DESC"),
      db.prepare("SELECT * FROM web_daily ORDER BY date"),
      db.prepare("SELECT * FROM sources ORDER BY sort_order"),
      db.prepare("SELECT * FROM pages ORDER BY sort_order"),
      db.prepare("SELECT * FROM search ORDER BY sort_order"),
    ]);

  const meta = rowsOf<MetaRow>(metaResult)[0];
  if (!meta) {
    throw new Error(
      "Tabel dataset_meta masih kosong. Jalankan migrasi dan seed D1 terlebih dahulu.",
    );
  }

  return {
    range: {
      start: meta.range_start,
      end: meta.range_end,
      days: meta.range_days,
    },
    history: {
      start: meta.history_start,
      end: meta.history_end,
      days: meta.history_days,
    },
    generatedAt: meta.generated_at,
    accounts: rowsOf<AccountRow>(accountResult).map(toAccount),
    social: rowsOf<SocialRow>(socialResult).map(toSocial),
    content: rowsOf<ContentRow>(contentResult).map(toContent),
    comments: rowsOf<CommentRow>(commentResult).map(toComment),
    web: rowsOf<WebRow>(webResult).map(toWeb),
    sources: rowsOf<SourceRow>(sourceResult).map(toSource),
    pages: rowsOf<PageRow>(pageResult).map(toPage),
    search: rowsOf<SearchRow>(searchResult).map(toSearch),
  };
}
