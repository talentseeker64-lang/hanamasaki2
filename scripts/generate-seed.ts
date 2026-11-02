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
import { NOTIFICATIONS, ORGANIZATION, TEAM_MEMBERS } from "../lib/default-settings.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const dataset = buildDemoDataset();

function q(value: string | number | null): string {
  if (value === null) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${value.replace(/'/g, "''")}'`;
}

type SqlValue = string | number | null;

/** Tenant tunggal: organisasi yang sama dengan yang diisi migrasi 0003. */
const TENANT_ID = ORGANIZATION.id;

/**
 * Identitas baris seed di "sistem asalnya" — bentuknya sengaja sama dengan yang
 * ditulis bagian backfill migrasi 0003, yaitu `seed:<bagian>:<bagian>`.
 */
function seedRef(...parts: string[]): string {
  return ["seed", ...parts].join(":");
}

/**
 * Menyusun satu blok seed untuk sebuah tabel.
 *
 * Default-nya seluruh isi tabel diganti. `scope` mempersempit perilaku itu untuk
 * tabel yang isinya bercampur dengan data nyata:
 *   - `deleteWhere` membatasi baris yang dihapus sebelum penyisipan;
 *   - `keepExisting` membuat penyisipan tidak menimpa baris yang kuncinya sudah ada.
 * Tanpa keduanya, menjalankan seed bisa mengubah atau menghapus data nyata.
 */
interface SeedScope {
  deleteWhere?: string;
  keepExisting?: boolean;
}

function insert(
  table: string,
  columns: string[],
  rows: SqlValue[][],
  scope: SeedScope = {},
): string {
  if (rows.length === 0) return "";
  const values = rows.map((row) => `  (${row.map(q).join(", ")})`).join(",\n");
  const remove = scope.deleteWhere
    ? `DELETE FROM ${table} WHERE ${scope.deleteWhere};`
    : `DELETE FROM ${table};`;
  const verb = scope.keepExisting ? "INSERT OR IGNORE INTO" : "INSERT INTO";
  return `${remove}\n${verb} ${table} (${columns.join(", ")}) VALUES\n${values};\n`;
}

/**
 * Cakupan untuk seluruh tabel metrik: yang dihapus hanya baris berlabel seed, dan
 * baris hasil sinkronisasi API dipertahankan bila kuncinya bertabrakan.
 */
const SEED_ROWS_ONLY: SeedScope = {
  deleteWhere: "source_kind = 'seed'",
  keepExisting: true,
};

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
      "source_kind",
      "source_ref",
      "tenant_id",
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
      "seed",
      seedRef(account.id),
      TENANT_ID,
    ]),
    // Akun contoh yang sudah tersentuh sinkronisasi API berlabel 'platform-api'
    // (lihat migrasi 0003), sehingga tidak ikut terhapus dan tidak tertimpa di sini.
    // Akun yang ditambahkan lewat aplikasi berlabel 'import' atau 'legacy-unknown',
    // sehingga juga tidak tersentuh.
    SEED_ROWS_ONLY,
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
      "source_kind",
      "source_ref",
      "tenant_id",
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
      "seed",
      seedRef(row.platform, row.date),
      TENANT_ID,
    ]),
    SEED_ROWS_ONLY,
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
      "duration_seconds",
      "source_kind",
      "source_ref",
      "tenant_id",
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
      // NULL = durasi tidak diketahui (konten bergambar). Bukan nol.
      row.durationSeconds,
      "seed",
      seedRef(row.id),
      TENANT_ID,
    ]),
    SEED_ROWS_ONLY,
  ),
);

chunks.push(
  insert(
    "comments",
    ["id", "platform", "topic", "text", "author", "sentiment", "intent", "created_at", "likes", "source_kind", "source_ref", "tenant_id"],
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
      "seed",
      seedRef(row.id),
      TENANT_ID,
    ]),
    SEED_ROWS_ONLY,
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
      "source_kind",
      "source_ref",
      "tenant_id",
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
      "seed",
      seedRef(row.date),
      TENANT_ID,
    ]),
    SEED_ROWS_ONLY,
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
      "source_kind",
      "tenant_id",
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
      "seed",
      TENANT_ID,
    ]),
    SEED_ROWS_ONLY,
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
      "source_kind",
      "tenant_id",
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
      "seed",
      TENANT_ID,
    ]),
    SEED_ROWS_ONLY,
  ),
);

chunks.push(
  insert(
    "search",
    ["query", "impressions", "clicks", "clicks_prev", "ctr", "position", "position_prev", "sort_order", "source_kind", "tenant_id"],
    dataset.search.map((row, index) => [
      row.query,
      row.impressions,
      row.clicks,
      row.clicksPrev,
      row.ctr,
      row.position,
      row.positionPrev,
      index,
      "seed",
      TENANT_ID,
    ]),
    SEED_ROWS_ONLY,
  ),
);

// Demografi audiens. Sama seperti tabel metrik lain: hanya baris berlabel seed
// yang diganti, sehingga demografi hasil API tidak pernah tertimpa angka
// ilustratif.
chunks.push(
  insert(
    "audience_insights",
    [
      "id",
      "tenant_id",
      "account_id",
      "dimension",
      "bucket",
      "value",
      "period_start",
      "period_end",
      "source_kind",
      "source_ref",
    ],
    dataset.audience.map((row) => [
      row.id,
      TENANT_ID,
      row.accountId,
      row.dimension,
      row.bucket,
      row.value,
      row.periodStart,
      row.periodEnd,
      "seed",
      seedRef("audience", row.id),
    ]),
    SEED_ROWS_ONLY,
  ),
);

// Pengaturan ruang kerja. Tabelnya dibuat oleh migrasi 0002, terpisah dari
// dataset analitik di atas agar reset dataset tidak menghapus pengaturan.
// Tabel `account_credentials` sengaja tidak diisi: rahasianya hanya masuk lewat
// endpoint tulis yang terenkripsi.

chunks.push(
  insert(
    "organization",
    ["id", "name", "plan", "timezone", "default_period"],
    [
      [
        ORGANIZATION.id,
        ORGANIZATION.name,
        ORGANIZATION.plan,
        ORGANIZATION.timezone,
        ORGANIZATION.defaultPeriod,
      ],
    ],
  ),
);

chunks.push(
  insert(
    "team_members",
    ["email", "name", "role", "scope", "sort_order"],
    TEAM_MEMBERS.map((member, index) => [
      member.email,
      member.name,
      member.role,
      member.scope,
      index,
    ]),
  ),
);

chunks.push(
  insert(
    "notifications",
    ["id", "label", "detail", "enabled", "sort_order"],
    NOTIFICATIONS.map((preference, index) => [
      preference.id,
      preference.label,
      preference.detail,
      preference.enabled ? 1 : 0,
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
db.exec(readFileSync(resolve(root, "migrations", "0002_settings_and_credentials.sql"), "utf8"));
db.exec(readFileSync(resolve(root, "migrations", "0003_provenance.sql"), "utf8"));
db.exec(readFileSync(resolve(root, "migrations", "0005_audience_and_duration.sql"), "utf8"));

// Baris tiruan seolah-olah sudah ditulis sinkronisasi API. Tanggalnya di luar
// rentang dataset supaya tidak bertabrakan dengan baris seed. Baris ini dipakai
// untuk membuktikan bahwa menjalankan seed tidak menghapus, tidak menimpa, dan
// tidak mengubah provenance data nyata.
const API_PROBE_DATE = "2020-01-01";
const API_PROBE_CONTENT = "probe-api-content";
const API_PROBE_ACCOUNT = "acc-api-probe";

// Akun contoh yang disimulasikan sudah tersentuh sinkronisasi API. Nilainya diambil
// dari kejadian nyata pada D1 remote (docs/REMOTE_DATA_INVENTORY.md): akun 'acc-yt'
// yang sama berubah menjadi 6 pengikut, connection 'connected', dan last_sync_at
// terisi. Inilah kasus yang paling mudah terlewat — id-nya tetap sama, jadi seed
// berbasis daftar id akan menghapusnya tanpa sadar.
const API_PROBE_SYNCED_ACCOUNT = "acc-yt";
const API_PROBE_SYNCED_FOLLOWERS = 6;
const API_PROBE_SYNCED_AT = "2026-10-31T00:00:15.672Z";
const API_PROBE_SYNCED_REF = "youtube:channel:probe-api-channel";

// Demografi hasil API untuk salah satu akun contoh. Bucket-nya dipilih yang tidak
// dipakai seed, sehingga baris ini murni milik jalur sinkronisasi. Nilainya
// sengaja berbeda dari pola seed agar penimpaan akan langsung terlihat.
const API_PROBE_AUDIENCE_ID = "probe-api-audience";
const API_PROBE_AUDIENCE_BUCKET = "65+";
const API_PROBE_AUDIENCE_VALUE = 4.8;
const API_PROBE_AUDIENCE_REF = "instagram:audience:probe:age:65+";

db.exec(`
INSERT INTO social_daily (date, platform, views, reach, impressions, likes, comments, shares, saves, followers_gained, profile_visits, link_clicks, source_kind, source_ref, tenant_id)
  VALUES ('${API_PROBE_DATE}', 'youtube', 4242, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'platform-api', 'youtube:analytics:probe:${API_PROBE_DATE}', ${q(ORGANIZATION.id)});
INSERT INTO content (id, platform, title, format, topic, published_at, views, likes, comments, shares, saves, link_clicks, duration_seconds, source_kind, source_ref, tenant_id)
  VALUES ('${API_PROBE_CONTENT}', 'youtube', 'Baris uji API', 'video', 'uji', '${API_PROBE_DATE}T00:00:00Z', 7, 0, 0, 0, 0, 0, 512, 'platform-api', 'youtube:video:${API_PROBE_CONTENT}', ${q(ORGANIZATION.id)});
INSERT INTO accounts (id, platform, handle, display_name, followers, followers_start, connection, scopes, last_sync_at, limitation, sort_order, source_kind, tenant_id)
  VALUES ('${API_PROBE_ACCOUNT}', 'tiktok', '@probe', 'Akun uji API', 1, 1, 'connected', '[]', NULL, '', 99, 'import', ${q(ORGANIZATION.id)});
INSERT INTO audience_insights (id, tenant_id, account_id, dimension, bucket, value, period_start, period_end, source_kind, source_ref)
  VALUES ('${API_PROBE_AUDIENCE_ID}', ${q(ORGANIZATION.id)}, 'acc-ig', 'age', '${API_PROBE_AUDIENCE_BUCKET}', ${API_PROBE_AUDIENCE_VALUE}, '${dataset.range.start}', '${dataset.range.end}', 'platform-api', '${API_PROBE_AUDIENCE_REF}');
`);

db.exec(sql);

const expected: Array<[string, number]> = [
  ["dataset_meta", 1],
  ["accounts", dataset.accounts.length + 1],
  ["social_daily", dataset.social.length + 1],
  ["content", dataset.content.length + 1],
  ["comments", dataset.comments.length],
  ["web_daily", dataset.web.length],
  ["sources", dataset.sources.length],
  ["pages", dataset.pages.length],
  ["search", dataset.search.length],
  ["audience_insights", dataset.audience.length + 1],
  ["organization", 1],
  ["team_members", TEAM_MEMBERS.length],
  ["notifications", NOTIFICATIONS.length],
  ["account_credentials", 0],
];

let failed = false;
const check = (ok: boolean, message: string) => {
  if (!ok) failed = true;
  console.log(`${ok ? "OK   " : "GAGAL"} ${message}`);
};

for (const [table, want] of expected) {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  check(row.n === want, `${table}: ${row.n}/${want} baris`);
}

/** Ringkasan keadaan tabel, untuk membandingkan hasil antar-penerapan seed. */
function snapshot(): string {
  const tables = ["social_daily", "content", "comments", "web_daily", "sources", "pages", "search", "accounts", "audience_insights"];
  return tables
    .map((table) => {
      const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
      return `${table}=${row.n}`;
    })
    .join(" ");
}

// 1. Provenance wajib terisi pada seluruh baris metrik.
const missingProvenance = db
  .prepare(
    `SELECT (SELECT COUNT(*) FROM social_daily WHERE source_kind IS NULL OR tenant_id IS NULL)
          + (SELECT COUNT(*) FROM content      WHERE source_kind IS NULL OR tenant_id IS NULL)
          + (SELECT COUNT(*) FROM comments     WHERE source_kind IS NULL OR tenant_id IS NULL)
          + (SELECT COUNT(*) FROM web_daily    WHERE source_kind IS NULL OR tenant_id IS NULL)
          + (SELECT COUNT(*) FROM sources      WHERE source_kind IS NULL OR tenant_id IS NULL)
          + (SELECT COUNT(*) FROM pages        WHERE source_kind IS NULL OR tenant_id IS NULL)
          + (SELECT COUNT(*) FROM search       WHERE source_kind IS NULL OR tenant_id IS NULL)
          + (SELECT COUNT(*) FROM accounts     WHERE tenant_id IS NULL OR source_kind IS NULL)
          + (SELECT COUNT(*) FROM audience_insights WHERE source_kind IS NULL OR tenant_id IS NULL) AS n`,
  )
  .get() as { n: number };
check(missingProvenance.n === 0, "tidak ada baris dengan source_kind/tenant_id NULL");

// 2. Setiap baris seed dapat ditelusuri ke sistem asalnya.
const missingRef = db
  .prepare(
    `SELECT (SELECT COUNT(*) FROM social_daily WHERE source_kind = 'seed' AND source_ref IS NULL)
          + (SELECT COUNT(*) FROM content      WHERE source_kind = 'seed' AND source_ref IS NULL)
          + (SELECT COUNT(*) FROM comments     WHERE source_kind = 'seed' AND source_ref IS NULL)
          + (SELECT COUNT(*) FROM web_daily    WHERE source_kind = 'seed' AND source_ref IS NULL)
          + (SELECT COUNT(*) FROM audience_insights WHERE source_kind = 'seed' AND source_ref IS NULL) AS n`,
  )
  .get() as { n: number };
check(missingRef.n === 0, "setiap baris seed punya source_ref");

const sampleRef = db
  .prepare("SELECT source_ref FROM social_daily WHERE source_kind = 'seed' ORDER BY date LIMIT 1")
  .get() as { source_ref: string } | undefined;
check(
  typeof sampleRef?.source_ref === "string" && /^seed:[a-z]+:\d{4}-\d{2}-\d{2}$/.test(sampleRef.source_ref),
  `source_ref seed berformat benar (${sampleRef?.source_ref})`,
);

// 3. Inilah yang mencegah data ilustratif menyamar sebagai data bisnis: label
//    provenance baris seed dan baris hasil API harus berbeda.
const kindMix = db
  .prepare("SELECT source_kind, COUNT(*) AS n FROM social_daily GROUP BY source_kind ORDER BY source_kind")
  .all() as Array<{ source_kind: string; n: number }>;
console.log(`     sebaran provenance social_daily: ${JSON.stringify(kindMix)}`);
check(
  kindMix.some((row) => row.source_kind === "seed" && row.n === dataset.social.length) &&
    kindMix.some((row) => row.source_kind === "platform-api" && row.n === 1),
  "baris seed dan baris API terlabel berbeda",
);

// 4. Data nyata tidak tersentuh seed.
const probeDaily = db
  .prepare("SELECT views, source_kind, source_ref FROM social_daily WHERE date = ?")
  .get(API_PROBE_DATE) as { views: number; source_kind: string; source_ref: string } | undefined;
check(
  probeDaily?.source_kind === "platform-api" && probeDaily.views === 4242 && probeDaily.source_ref === `youtube:analytics:probe:${API_PROBE_DATE}`,
  "baris hasil API di social_daily tidak tertimpa seed",
);

const probeContent = db
  .prepare("SELECT views, source_kind FROM content WHERE id = ?")
  .get(API_PROBE_CONTENT) as { views: number; source_kind: string } | undefined;
check(
  probeContent?.source_kind === "platform-api" && probeContent.views === 7,
  "baris hasil API di content tidak tertimpa seed",
);

// 4b. Durasi konten: hanya format yang punya durasi yang diisi, dan yang tidak
//     punya wajib NULL. Nol akan menggeser konten bergambar ke bucket "≤ 30 detik"
//     di analisis durasi, jadi keadaan ini harus dijaga oleh seed itu sendiri.
const galleryWithDuration = db
  .prepare(
    "SELECT COUNT(*) AS n FROM content WHERE source_kind = 'seed' AND format IN ('carousel', 'post', 'story') AND duration_seconds IS NOT NULL",
  )
  .get() as { n: number };
check(galleryWithDuration.n === 0, "konten bergambar tidak diberi durasi (NULL, bukan nol)");

const videoWithoutDuration = db
  .prepare(
    "SELECT COUNT(*) AS n FROM content WHERE source_kind = 'seed' AND format IN ('reels', 'shorts', 'video') AND (duration_seconds IS NULL OR duration_seconds <= 0)",
  )
  .get() as { n: number };
check(videoWithoutDuration.n === 0, "seluruh konten video punya durasi > 0");

const galleryRows = db
  .prepare(
    "SELECT COUNT(*) AS n FROM content WHERE source_kind = 'seed' AND format IN ('carousel', 'post', 'story')",
  )
  .get() as { n: number };
check(galleryRows.n > 0, `ada konten bergambar sebagai pembanding (${galleryRows.n} baris)`);

// 4c. Demografi audiens: hanya platform yang menyediakannya yang punya baris.
//     TikTok sengaja kosong, dan keadaan itu harus bertahan.
const audienceKinds = db
  .prepare(
    "SELECT source_kind, COUNT(*) AS n FROM audience_insights GROUP BY source_kind ORDER BY source_kind",
  )
  .all() as Array<{ source_kind: string; n: number }>;
console.log(`     sebaran provenance audience_insights: ${JSON.stringify(audienceKinds)}`);
check(
  audienceKinds.some((row) => row.source_kind === "seed" && row.n === dataset.audience.length) &&
    audienceKinds.some((row) => row.source_kind === "platform-api" && row.n === 1),
  "demografi seed dan demografi hasil API terlabel berbeda",
);

const unknownDimension = db
  .prepare("SELECT COUNT(*) AS n FROM audience_insights WHERE dimension NOT IN ('age', 'gender', 'country', 'city')")
  .get() as { n: number };
check(unknownDimension.n === 0, "tidak ada dimensi demografi di luar kosakata yang dikenal");

const tiktokAudience = db
  .prepare("SELECT COUNT(*) AS n FROM audience_insights WHERE account_id = ?")
  .get("acc-tt") as { n: number };
check(tiktokAudience.n === 0, "akun TikTok tetap tanpa demografi (keadaan 'belum tersedia')");

const probeAccount = db
  .prepare("SELECT COUNT(*) AS n FROM accounts WHERE id = ?")
  .get(API_PROBE_ACCOUNT) as { n: number };
check(probeAccount.n === 1, "akun yang ditambahkan lewat aplikasi dipertahankan seed");

// 5. Sinkronisasi API menyentuh salah satu akun contoh, lalu seed dijalankan ulang.
//    Inilah kasus yang sebelumnya lolos dari validasi: id-nya masih ada di daftar akun
//    contoh, jadi seed yang menghapus berdasarkan daftar id akan menghapusnya dan
//    menggantinya dengan angka ilustratif. Sekarang akun itu berlabel 'platform-api'
//    sehingga harus bertahan.
const seedFollowers = db
  .prepare("SELECT followers FROM accounts WHERE id = ?")
  .get(API_PROBE_SYNCED_ACCOUNT) as { followers: number };
check(
  seedFollowers.followers !== API_PROBE_SYNCED_FOLLOWERS,
  `nilai seed akun uji berbeda dari nilai hasil API (${seedFollowers.followers} vs ${API_PROBE_SYNCED_FOLLOWERS})`,
);

db.exec(`
UPDATE accounts
   SET followers = ${API_PROBE_SYNCED_FOLLOWERS},
       connection = 'connected',
       last_sync_at = '${API_PROBE_SYNCED_AT}',
       source_kind = 'platform-api',
       source_ref = '${API_PROBE_SYNCED_REF}'
 WHERE id = '${API_PROBE_SYNCED_ACCOUNT}';
`);

// 6. Seed harus idempotent: penerapan kedua tidak boleh mengubah apa pun.
const beforeRerun = snapshot();
db.exec(sql);
check(snapshot() === beforeRerun, `seed dapat dijalankan berulang tanpa efek samping (${beforeRerun})`);
for (const [table, want] of expected) {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  check(row.n === want, `penerapan ulang: ${table}: ${row.n}/${want} baris`);
}

// 7. Data nyata tetap utuh sesudah penerapan ulang.
interface SyncedAccount {
  followers: number;
  connection: string;
  last_sync_at: string;
  source_kind: string;
  source_ref: string;
}

const syncedAfter = db
  .prepare(
    `SELECT followers, connection, last_sync_at, source_kind, source_ref
       FROM accounts WHERE id = ?`,
  )
  .get(API_PROBE_SYNCED_ACCOUNT) as SyncedAccount | undefined;
check(
  syncedAfter?.followers === API_PROBE_SYNCED_FOLLOWERS &&
    syncedAfter?.connection === "connected" &&
    syncedAfter?.last_sync_at === API_PROBE_SYNCED_AT &&
    syncedAfter?.source_kind === "platform-api" &&
    syncedAfter?.source_ref === API_PROBE_SYNCED_REF,
  "akun contoh yang sudah tersentuh API tidak dikembalikan ke nilai seed",
);

const dailyAfter = db
  .prepare("SELECT views, source_kind FROM social_daily WHERE date = ?")
  .get(API_PROBE_DATE) as { views: number; source_kind: string } | undefined;
check(
  dailyAfter?.source_kind === "platform-api" && dailyAfter.views === 4242,
  "baris hasil API di social_daily tetap utuh setelah penerapan ulang",
);

const audienceAfter = db
  .prepare("SELECT value, source_kind, source_ref FROM audience_insights WHERE id = ?")
  .get(API_PROBE_AUDIENCE_ID) as
  | { value: number; source_kind: string; source_ref: string }
  | undefined;
check(
  audienceAfter?.source_kind === "platform-api" &&
    audienceAfter?.value === API_PROBE_AUDIENCE_VALUE &&
    audienceAfter?.source_ref === API_PROBE_AUDIENCE_REF,
  "demografi hasil API tidak tertimpa seed",
);

const accountKinds = db
  .prepare("SELECT source_kind, COUNT(*) AS n FROM accounts GROUP BY source_kind ORDER BY source_kind")
  .all() as Array<{ source_kind: string; n: number }>;
console.log(`     sebaran provenance accounts: ${JSON.stringify(accountKinds)}`);
check(
  accountKinds.some((row) => row.source_kind === "seed" && row.n === dataset.accounts.length - 1) &&
    accountKinds.some((row) => row.source_kind === "platform-api" && row.n === 1) &&
    accountKinds.some((row) => row.source_kind === "import" && row.n === 1),
  "akun seed, akun hasil API, dan akun buatan aplikasi terlabel berbeda",
);

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
  "SELECT * FROM audience_insights ORDER BY account_id, dimension, value DESC",
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
