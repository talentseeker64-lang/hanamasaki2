/**
 * Menghasilkan `seed/seed.sql` dari generator dataset ilustratif, lalu memvalidasi
 * isinya dengan memuatnya ke SQLite in-memory (node:sqlite).
 *
 * Jalankan: node scripts/generate-seed.ts
 * Terapkan: npx wrangler d1 migrations apply karambit --remote
 *           npx wrangler d1 execute karambit --remote --file=seed/seed.sql
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDemoDataset } from "../lib/demo-dataset.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const dataset = buildDemoDataset();

function q(value: string | number | null): string {
  if (value === null) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${value.replace(/'/g, "''")}'`;
}

type SqlValue = string | number | null;

function insert(table: string, columns: string[], rows: SqlValue[][]): string {
  if (rows.length === 0) return "";
  const values = rows.map((row) => `  (${row.map(q).join(", ")})`).join(",\n");
  return `DELETE FROM ${table};\nINSERT INTO ${table} (${columns.join(", ")}) VALUES\n${values};\n`;
}

const chunks: string[] = [
  "-- Seed dataset ilustratif PeakAlpha.",
  "-- Dibangkitkan oleh scripts/generate-seed.ts — jangan diubah manual.",
  "-- Terapkan: npx wrangler d1 execute hanamasak --local --file=seed/seed.sql",
  "PRAGMA foreign_keys = OFF;",
  "",
];

chunks.push(
  insert(
    "dataset_meta",
    [
      "id",
      "range_start",
      "range_end",
      "range_days",
      "history_start",
      "history_end",
      "history_days",
      "generated_at",
    ],
    [
      [
        "current",
        dataset.range.start,
        dataset.range.end,
        dataset.range.days,
        dataset.history.start,
        dataset.history.end,
        dataset.history.days,
        dataset.generatedAt,
      ],
    ],
  ),
);

chunks.push(
  insert(
    "accounts",
    [
      "id",
      "platform",
      "handle",
      "display_name",
      "followers",
      "followers_start",
      "connection",
      "scopes",
      "last_sync_at",
      "limitation",
      "sort_order",
    ],
    dataset.accounts.map((account, index) => [
      account.id,
      account.platform,
      account.handle,
      account.displayName,
      account.followers,
      account.followersStart,
      account.connection,
      JSON.stringify(account.scopes),
      account.lastSyncAt,
      account.limitation,
      index,
    ]),
  ),
);

chunks.push(
  insert(
    "social_daily",
    [
      "date",
      "platform",
      "views",
      "reach",
      "impressions",
      "likes",
      "comments",
      "shares",
      "saves",
      "followers_gained",
      "profile_visits",
      "link_clicks",
    ],
    dataset.social.map((row) => [
      row.date,
      row.platform,
      row.views,
      row.reach,
      row.impressions,
      row.likes,
      row.comments,
      row.shares,
      row.saves,
      row.followersGained,
      row.profileVisits,
      row.linkClicks,
    ]),
  ),
);

chunks.push(
  insert(
    "content",
    [
      "id",
      "platform",
      "title",
      "format",
      "topic",
      "published_at",
      "views",
      "likes",
      "comments",
      "shares",
      "saves",
      "link_clicks",
    ],
    dataset.content.map((row) => [
      row.id,
      row.platform,
      row.title,
      row.format,
      row.topic,
      row.publishedAt,
      row.views,
      row.likes,
      row.comments,
      row.shares,
      row.saves,
      row.linkClicks,
    ]),
  ),
);

chunks.push(
  insert(
    "comments",
    ["id", "platform", "topic", "text", "author", "sentiment", "intent", "created_at", "likes"],
    dataset.comments.map((row) => [
      row.id,
      row.platform,
      row.topic,
      row.text,
      row.author,
      row.sentiment,
      row.intent,
      row.createdAt,
      row.likes,
    ]),
  ),
);

chunks.push(
  insert(
    "web_daily",
    [
      "date",
      "sessions",
      "users",
      "new_users",
      "page_views",
      "bounce_rate",
      "avg_session_seconds",
      "conversions",
    ],
    dataset.web.map((row) => [
      row.date,
      row.sessions,
      row.users,
      row.newUsers,
      row.pageViews,
      row.bounceRate,
      row.avgSessionSeconds,
      row.conversions,
    ]),
  ),
);

chunks.push(
  insert(
    "sources",
    [
      "source",
      "channel",
      "platform",
      "sessions",
      "sessions_prev",
      "conversions",
      "conversions_prev",
      "bounce_rate",
      "sort_order",
    ],
    dataset.sources.map((row, index) => [
      row.source,
      row.channel,
      row.platform,
      row.sessions,
      row.sessionsPrev,
      row.conversions,
      row.conversionsPrev,
      row.bounceRate,
      index,
    ]),
  ),
);

chunks.push(
  insert(
    "pages",
    [
      "path",
      "title",
      "views30",
      "views30_prev",
      "conversions30",
      "conversions30_prev",
      "conversions7",
      "conversions7_prev",
      "avg_seconds",
      "exit_rate",
      "sort_order",
    ],
    dataset.pages.map((row, index) => [
      row.path,
      row.title,
      row.views30,
      row.views30Prev,
      row.conversions30,
      row.conversions30Prev,
      row.conversions7,
      row.conversions7Prev,
      row.avgSeconds,
      row.exitRate,
      index,
    ]),
  ),
);

chunks.push(
  insert(
    "search",
    ["query", "impressions", "clicks", "clicks_prev", "ctr", "position", "position_prev", "sort_order"],
    dataset.search.map((row, index) => [
      row.query,
      row.impressions,
      row.clicks,
      row.clicksPrev,
      row.ctr,
      row.position,
      row.positionPrev,
      index,
    ]),
  ),
);

const sql = `${chunks.filter(Boolean).join("\n")}\n`;
const seedPath = resolve(root, "seed", "seed.sql");
mkdirSync(dirname(seedPath), { recursive: true });
writeFileSync(seedPath, sql, "utf8");
console.log(`seed.sql ditulis: ${seedPath} (${(sql.length / 1024).toFixed(1)} KB)`);

/* ------------------------------------------------------------------ */
/* Validasi: muat migrasi + seed ke SQLite in-memory                   */
/* ------------------------------------------------------------------ */

const db = new DatabaseSync(":memory:");
db.exec(readFileSync(resolve(root, "migrations", "0001_init.sql"), "utf8"));
db.exec(sql);

const expected: Array<[string, number]> = [
  ["dataset_meta", 1],
  ["accounts", dataset.accounts.length],
  ["social_daily", dataset.social.length],
  ["content", dataset.content.length],
  ["comments", dataset.comments.length],
  ["web_daily", dataset.web.length],
  ["sources", dataset.sources.length],
  ["pages", dataset.pages.length],
  ["search", dataset.search.length],
];

let failed = false;
for (const [table, want] of expected) {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  const ok = row.n === want;
  if (!ok) failed = true;
  console.log(`${ok ? "OK  " : "GAGAL"} ${table}: ${row.n}/${want} baris`);
}

// Kueri yang sama dengan lib/data.ts, untuk memastikan kolomnya benar-benar ada.
const probes = [
  "SELECT range_start FROM dataset_meta WHERE id = 'current'",
  "SELECT * FROM accounts ORDER BY sort_order",
  "SELECT * FROM social_daily ORDER BY platform, date",
  "SELECT * FROM content ORDER BY published_at DESC",
  "SELECT * FROM comments ORDER BY created_at DESC",
  "SELECT * FROM web_daily ORDER BY date",
  "SELECT * FROM sources ORDER BY sort_order",
  "SELECT * FROM pages ORDER BY sort_order",
  "SELECT * FROM search ORDER BY sort_order",
];
for (const probe of probes) {
  db.prepare(probe).all();
}
console.log(`OK   ${probes.length} kueri baca lib/data.ts berhasil dijalankan`);

db.close();
if (failed) {
  console.error("Validasi seed GAGAL.");
  process.exit(1);
}
console.log("Validasi seed selesai tanpa masalah.");
