import { type CredentialInput, readCredentials, saveCredentials } from "./credentials";
import { getDb } from "./db";
import {
  exchangeForLongLivedToken,
  fetchInstagramDailyInsights,
  fetchInstagramProfile,
  fetchPageProfile,
  findFirstPage,
  findInstagramTarget,
  getMetaAppConfig,
} from "./meta";
import type { Platform } from "./types";
import {
  fetchYouTubeChannel,
  fetchYouTubeDailyViews,
  getGoogleAppConfig,
  refreshGoogleToken,
} from "./youtube";

/**
 * Sinkronisasi metrik platform ke D1.
 *
 * Modul ini sengaja tidak memakai `next/server` agar tetap dapat dipanggil dari
 * konteks mana pun yang punya binding Cloudflare (route API, maupun Worker).
 *
 * Prinsip yang dipegang: nilai yang ditulis harus berasal dari panggilan API
 * yang benar-benar berhasil. Bila panggilan gagal, baris D1 dibiarkan apa
 * adanya dan kegagalan dilaporkan — bukan diisi angka nol yang menyesatkan.
 */

export interface AccountSyncResult {
  accountId: string;
  platform: Platform;
  status: "ok" | "skipped" | "error";
  message: string;
}

interface SyncAccountRow {
  id: string;
  platform: string;
  handle: string;
  followers: number;
}

/** Platform yang alur izinnya sudah diimplementasikan beserta penyedianya. */
const META_PLATFORMS: readonly Platform[] = ["instagram", "facebook"];
const GOOGLE_PLATFORMS: readonly Platform[] = ["youtube"];

/** Perpanjang token bila sisa masa berlakunya kurang dari satu hari. */
const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export async function syncAllAccounts(): Promise<AccountSyncResult[]> {
  const db = await getDb();
  const result = await db
    .prepare("SELECT id, platform, handle, followers FROM accounts ORDER BY sort_order")
    .all<SyncAccountRow>();

  const rows = result.results ?? [];
  const outcomes: AccountSyncResult[] = [];
  for (const row of rows) {
    outcomes.push(await syncAccount(row));
  }
  return outcomes;
}

async function syncAccount(row: SyncAccountRow): Promise<AccountSyncResult> {
  const platform = row.platform as Platform;
  const base = { accountId: row.id, platform };

  const supported = META_PLATFORMS.includes(platform) || GOOGLE_PLATFORMS.includes(platform);
  if (!supported) {
    return {
      ...base,
      status: "skipped",
      message: "Alur izin platform ini belum diimplementasikan.",
    };
  }

  const credentials = await readCredentials(row.id);
  if (!credentials) {
    return {
      ...base,
      status: "skipped",
      message: "Belum ada kredensial OAuth tersimpan. Hubungkan akun lebih dulu.",
    };
  }

  try {
    return META_PLATFORMS.includes(platform)
      ? await syncMetaAccount(row, credentials)
      : await syncGoogleAccount(row, credentials);
  } catch (error) {
    return {
      ...base,
      status: "error",
      message: error instanceof Error ? error.message : "Kegagalan tidak diketahui.",
    };
  }
}

function needsRefresh(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const remaining = Date.parse(expiresAt) - Date.now();
  return Number.isFinite(remaining) && remaining < REFRESH_THRESHOLD_MS;
}

/** Instagram dan Facebook: token panjang Meta diperpanjang dengan fb_exchange_token. */
async function syncMetaAccount(
  row: SyncAccountRow,
  credentials: CredentialInput,
): Promise<AccountSyncResult> {
  const config = await getMetaAppConfig();
  let accessToken = credentials.accessToken;

  if (needsRefresh(credentials.expiresAt)) {
    const refreshed = await exchangeForLongLivedToken(config, accessToken);
    accessToken = refreshed.accessToken;
    await saveCredentials(row.id, {
      ...credentials,
      accessToken: refreshed.accessToken,
      expiresAt: refreshed.expiresAt,
    });
  }

  return row.platform === "instagram"
    ? await syncInstagram(row, accessToken)
    : await syncFacebook(row, accessToken);
}

/** YouTube: access token Google hanya sejam, jadi refresh token wajib ada. */
async function syncGoogleAccount(
  row: SyncAccountRow,
  credentials: CredentialInput,
): Promise<AccountSyncResult> {
  const config = await getGoogleAppConfig();
  let accessToken = credentials.accessToken;

  if (needsRefresh(credentials.expiresAt)) {
    const refreshToken = credentials.refreshToken;
    if (!refreshToken) {
      return {
        accountId: row.id,
        platform: "youtube",
        status: "error",
        message:
          "Token Google sudah kedaluwarsa dan refresh token tidak tersimpan. Hubungkan ulang akun YouTube.",
      };
    }
    const refreshed = await refreshGoogleToken(config, refreshToken);
    accessToken = refreshed.accessToken;
    await saveCredentials(row.id, {
      ...credentials,
      accessToken: refreshed.accessToken,
      expiresAt: refreshed.expiresAt,
    });
  }

  const channel = await fetchYouTubeChannel(accessToken);
  await recordFollowers(row, channel.subscribers);

  const today = new Date().toISOString().slice(0, 10);
  const insight = await fetchYouTubeDailyViews(accessToken, today);

  if (!insight) {
    return {
      accountId: row.id,
      platform: "youtube",
      status: "ok",
      message:
        `Pelanggan channel "${channel.title}" tersimpan (${channel.subscribers}). ` +
        "Tayangan harian dilewati — YouTube menunda data analitik hingga 48 jam.",
    };
  }

  await upsertDailySocial("youtube", {
    views: insight.views,
    followersGained: Math.max(0, channel.subscribers - row.followers),
  });

  return {
    accountId: row.id,
    platform: "youtube",
    status: "ok",
    message: `Pelanggan (${channel.subscribers}) dan tayangan hari ini (${insight.views}) tersimpan.`,
  };
}

async function syncInstagram(
  row: SyncAccountRow,
  accessToken: string,
): Promise<AccountSyncResult> {
  const target = await findInstagramTarget(accessToken);
  if (!target) {
    return {
      accountId: row.id,
      platform: "instagram",
      status: "error",
      message: "Tidak ada akun Instagram Business yang tertaut ke halaman Facebook.",
    };
  }

  const profile = await fetchInstagramProfile(target.igUserId, target.pageToken);
  await recordFollowers(row, profile.followers);

  const insight = await fetchInstagramDailyInsights(target.igUserId, target.pageToken);
  if (!insight) {
    return {
      accountId: row.id,
      platform: "instagram",
      status: "ok",
      message:
        "Metrik pengikut tersimpan. Insight harian dilewati — Meta belum menyediakannya untuk token ini.",
    };
  }

  await upsertDailySocial("instagram", {
    reach: insight.reach,
    profileVisits: insight.profileViews,
    followersGained: Math.max(0, profile.followers - row.followers),
  });

  return {
    accountId: row.id,
    platform: "instagram",
    status: "ok",
    message: `Metrik pengikut, jangkauan (${insight.reach}), dan kunjungan profil (${insight.profileViews}) tersimpan.`,
  };
}

async function syncFacebook(
  row: SyncAccountRow,
  accessToken: string,
): Promise<AccountSyncResult> {
  const page = await findFirstPage(accessToken);
  if (!page) {
    return {
      accountId: row.id,
      platform: "facebook",
      status: "error",
      message: "Tidak ada Halaman Facebook yang dapat diakses token ini.",
    };
  }

  const profile = await fetchPageProfile(page.pageId, page.pageToken);
  await recordFollowers(row, profile.followers);

  return {
    accountId: row.id,
    platform: "facebook",
    status: "ok",
    message: `Pengikut Halaman "${profile.name}" tersimpan (${profile.followers}).`,
  };
}

/**
 * Menulis pengikut terbaru ke tabel akun.
 *
 * `connection` diisi 'connected' karena angka ini berasal dari panggilan API
 * yang berhasil — bukan dari pilihan manual seperti pada formulir akun.
 */
async function recordFollowers(row: SyncAccountRow, followers: number): Promise<void> {
  const db = await getDb();
  await db
    .prepare(
      `UPDATE accounts
          SET followers = ?, connection = 'connected', last_sync_at = ?
        WHERE id = ?`,
    )
    .bind(followers, new Date().toISOString(), row.id)
    .run();
}

/**
 * Potongan metrik harian yang boleh ditulis.
 *
 * Dipetakan eksplisit ke nama kolom D1 supaya kunci di sini tidak pernah
 * dirangkai menjadi SQL.
 */
interface DailySocialPatch {
  views?: number;
  reach?: number;
  impressions?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  followersGained?: number;
  profileVisits?: number;
  linkClicks?: number;
}

const DAILY_COLUMN_MAP: Record<keyof DailySocialPatch, string> = {
  views: "views",
  reach: "reach",
  impressions: "impressions",
  likes: "likes",
  comments: "comments",
  shares: "shares",
  saves: "saves",
  followersGained: "followers_gained",
  profileVisits: "profile_visits",
  linkClicks: "link_clicks",
};

const DAILY_PATCH_KEYS = Object.keys(DAILY_COLUMN_MAP) as Array<keyof DailySocialPatch>;
const DAILY_COLUMNS = DAILY_PATCH_KEYS.map((key) => DAILY_COLUMN_MAP[key]);

/**
 * Menggabungkan metrik harian ke baris hari ini.
 *
 * Hanya kolom yang benar-benar diukur yang ditimpa; kolom lain dibiarkan apa
 * adanya (bukan direset ke nol) agar data lain pada tanggal yang sama tidak
 * rusak. Karena kolom tabelnya NOT NULL tanpa DEFAULT, saat menyisipkan baris
 * baru sisa kolom diisi 0 secara eksplisit.
 */
async function upsertDailySocial(
  platform: Platform,
  patch: DailySocialPatch,
): Promise<void> {
  const changed = DAILY_PATCH_KEYS.filter((key) => typeof patch[key] === "number");
  if (changed.length === 0) return;

  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  const columns = ["date", "platform", ...DAILY_COLUMNS];
  const values = [today, platform, ...DAILY_PATCH_KEYS.map((key) => patch[key] ?? 0)];
  const updates = changed.map((key) => `${DAILY_COLUMN_MAP[key]} = excluded.${DAILY_COLUMN_MAP[key]}`);

  await db
    .prepare(
      `INSERT INTO social_daily (${columns.join(", ")})
       VALUES (${columns.map(() => "?").join(", ")})
       ON CONFLICT (date, platform) DO UPDATE SET ${updates.join(", ")}`,
    )
    .bind(...values)
    .run();
}
