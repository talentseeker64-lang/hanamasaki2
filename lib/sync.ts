import {
  type CredentialInput,
  deleteCredentials,
  readCredentials,
  saveCredentials,
} from "./credentials";
import { getDb } from "./db";
import {
  ensureAccountIntegration,
  finishSyncJob,
  integrationStatusAfterSync,
  markIntegration,
  startSyncJob,
  syncJobStatusOf,
  tenantScope,
} from "./integrations";
import {
  exchangeForLongLivedToken,
  fetchIdentity,
  fetchInstagramDailyInsights,
  fetchInstagramDemographics,
  fetchInstagramProfile,
  fetchPageDemographics,
  fetchPageProfile,
  findFirstPage,
  findInstagramTarget,
  getMetaAppConfig,
} from "./meta";
import { type MarketingDataProvider, type ProviderSyncResult, providerNameOf } from "./providers";
import { withRetry } from "./retry";
import type { AudienceDimension, AudiencePoint, Platform } from "./types";
import {
  GoogleApiError,
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
 *
 * Setiap akun melewati kontrak `MarketingDataProvider` (lib/providers.ts),
 * sehingga menambah sumber baru tidak mengubah alur di sini. Setiap eksekusi
 * menghasilkan satu baris riwayat di `sync_jobs`, dan kegagalan sementara
 * (jaringan, HTTP 429/5xx) diulang sebelum ditandai `error`.
 */

export interface AccountSyncResult {
  accountId: string;
  platform: Platform;
  status: "ok" | "skipped" | "error";
  message: string;
  /** Jumlah baris metrik yang benar-benar tertulis pada sinkronisasi ini. */
  written: number;
}

interface SyncAccountRow {
  id: string;
  platform: string;
  handle: string;
  followers: number;
}

/** Perpanjang token bila sisa masa berlakunya kurang dari satu hari. */
const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Menyinkronkan seluruh akun yang terdaftar untuk tenant aktif.
 *
 * Akun milik tenant lain tidak pernah ikut tersinkronisasi; baris yang belum
 * punya pemilik tetap ikut agar data lama tidak tertinggal.
 */
export async function syncAllAccounts(): Promise<AccountSyncResult[]> {
  const db = await getDb();
  const tenantId = await tenantScope(db);
  const statement = db.prepare(
    `SELECT id, platform, handle, followers FROM accounts${
      tenantId ? " WHERE (tenant_id = ? OR tenant_id IS NULL)" : ""
    } ORDER BY sort_order`,
  );
  const result = tenantId
    ? await statement.bind(tenantId).all<SyncAccountRow>()
    : await statement.all<SyncAccountRow>();

  const rows = result.results ?? [];
  const outcomes: AccountSyncResult[] = [];
  for (const row of rows) {
    outcomes.push(await syncAccount(db, row, tenantId));
  }
  return outcomes;
}

/**
 * Menyinkronkan satu akun, dengan registri integrasi dan riwayat sebagai jejak.
 *
 * Urutan pencatatan sengaja begini: integrasi didaftarkan lebih dulu (supaya
 * sumber yang belum pernah terhubung pun tetap terlihat di registri), lalu
 * tugas dibuka sebelum panggilan API dan ditutup di blok yang sama — sehingga
 * tidak ada tugas yang tertinggal berstatus `running`.
 */
async function syncAccount(
  db: D1Database,
  row: SyncAccountRow,
  tenantId: string | null,
): Promise<AccountSyncResult> {
  const platform = row.platform as Platform;
  const base = { accountId: row.id, platform };
  const providerName = providerNameOf(platform);

  if (!providerName) {
    return {
      ...base,
      written: 0,
      status: "skipped",
      message: "Alur izin platform ini belum diimplementasikan.",
    };
  }

  const integrationId = await ensureAccountIntegration(db, {
    accountId: row.id,
    provider: providerName,
    tenantId,
  });

  const credentials = await readCredentials(row.id);
  if (!credentials) {
    await markIntegration(db, integrationId, { status: "not_connected", lastError: null });
    return {
      ...base,
      written: 0,
      status: "skipped",
      message: "Belum ada kredensial OAuth tersimpan. Hubungkan akun lebih dulu.",
    };
  }

  const provider = providerName === "meta" ? metaProvider(row, credentials) : googleProvider(row, credentials);
  const today = new Date().toISOString().slice(0, 10);
  const jobId = await startSyncJob(db, integrationId);

  try {
    const result = await withRetry(() => provider.syncMetrics({ start: today, end: today }));
    await finishSyncJob(db, jobId, {
      status: syncJobStatusOf(result.status),
      rowsWritten: result.written,
      message: result.message,
    });
    await markIntegration(db, integrationId, {
      status: integrationStatusAfterSync(result),
      lastSyncAt: result.status === "error" ? undefined : new Date().toISOString(),
      lastError: result.status === "error" ? result.message : null,
    });
    return { ...base, written: result.written, status: result.status, message: result.message };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kegagalan tidak diketahui.";
    await finishSyncJob(db, jobId, { status: "error", rowsWritten: 0, message });
    await markIntegration(db, integrationId, { status: "error", lastError: message });
    return { ...base, written: 0, status: "error", message };
  }
}

/* ------------------------------------------------------------------ */
/* Penyedia: Meta (Instagram, Facebook) dan Google (YouTube)            */
/* ------------------------------------------------------------------ */

/**
 * Penyedia Meta. Token panjang diperpanjang lebih dulu bila mendekati
 * kedaluwarsa, sesuai alur resmi `fb_exchange_token`.
 */
function metaProvider(row: SyncAccountRow, credentials: CredentialInput): MarketingDataProvider {
  return {
    platform: row.platform as Platform,
    sourceKind: "platform-api",
    async validateConnection() {
      try {
        await fetchIdentity(credentials.accessToken);
        return true;
      } catch {
        return false;
      }
    },
    async syncMetrics(range) {
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
        ? await syncInstagram(row, accessToken, range.end)
        : await syncFacebook(row, accessToken);
    },
    async disconnect() {
      await deleteCredentials(row.id);
    },
  };
}

/**
 * Penyedia Google (YouTube). Access token Google hanya berlaku sekitar satu jam,
 * jadi refresh token wajib ada.
 */
function googleProvider(row: SyncAccountRow, credentials: CredentialInput): MarketingDataProvider {
  return {
    platform: "youtube",
    sourceKind: "platform-api",
    async validateConnection() {
      try {
        await fetchYouTubeChannel(credentials.accessToken);
        return true;
      } catch {
        return false;
      }
    },
    async syncMetrics(range) {
      const accessToken = await googleAccessToken(row.id, credentials);
      return syncYouTube(row, accessToken, range.end);
    },
    async disconnect() {
      await deleteCredentials(row.id);
    },
  };
}

function needsRefresh(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const remaining = Date.parse(expiresAt) - Date.now();
  return Number.isFinite(remaining) && remaining < REFRESH_THRESHOLD_MS;
}

/**
 * Access token Google yang masih berlaku untuk satu akun, diperbarui bila perlu.
 *
 * Dipakai bersama oleh tugas sinkronisasi dan endpoint baca daftar video, supaya
 * aturan perpanjangan token hanya ada di satu tempat.
 */
async function googleAccessToken(
  accountId: string,
  credentials: CredentialInput,
): Promise<string> {
  if (!needsRefresh(credentials.expiresAt)) return credentials.accessToken;

  const refreshToken = credentials.refreshToken;
  if (!refreshToken) {
    throw new GoogleApiError(
      "Token Google sudah kedaluwarsa dan refresh token tidak tersimpan. Hubungkan ulang akun YouTube.",
    );
  }

  const config = await getGoogleAppConfig();
  const refreshed = await refreshGoogleToken(config, refreshToken);
  await saveCredentials(accountId, {
    ...credentials,
    accessToken: refreshed.accessToken,
    expiresAt: refreshed.expiresAt,
  });
  return refreshed.accessToken;
}

/** Versi publik `googleAccessToken` yang membaca sendiri kredensial akun. */
export async function resolveGoogleAccessToken(accountId: string): Promise<string> {
  const credentials = await readCredentials(accountId);
  if (!credentials) {
    throw new GoogleApiError(
      "Belum ada kredensial OAuth tersimpan untuk akun ini. Hubungkan akun lewat menu Integrations.",
    );
  }
  return googleAccessToken(accountId, credentials);
}

/** YouTube: pelanggan channel dan tayangan harian. */
async function syncYouTube(
  row: SyncAccountRow,
  accessToken: string,
  date: string,
): Promise<ProviderSyncResult> {
  const channel = await fetchYouTubeChannel(accessToken);
  // Identitas kanal di sistem asal — sama dengan yang dipakai baris metrik harian.
  await recordFollowers(row, channel.subscribers, `youtube:channel:${channel.id}`);

  const insight = await fetchYouTubeDailyViews(accessToken, date);

  if (!insight) {
    return {
      sourceKind: "platform-api",
      status: "ok",
      written: 1,
      message:
        `Pelanggan channel "${channel.title}" tersimpan (${channel.subscribers}). ` +
        "Tayangan harian dilewati — YouTube menunda data analitik hingga 48 jam.",
    };
  }

  const write = await upsertDailySocial(
    "youtube",
    date,
    // Identitas baris di sistem asal: channel + tanggal laporan Analytics.
    `youtube:analytics:${channel.id}:${date}`,
    {
      views: insight.views,
      followersGained: Math.max(0, channel.subscribers - row.followers),
    },
  );

  const written = 1 + (write.status === "written" ? 1 : 0);

  if (write.status !== "written") {
    return {
      sourceKind: "platform-api",
      status: "skipped",
      written,
      message:
        `Pelanggan channel "${channel.title}" tersimpan (${channel.subscribers}). ` +
        `Tayangan hari ini (${insight.views}) tidak ditulis: ${writeReason(write)}`,
    };
  }

  return {
    sourceKind: "platform-api",
    status: "ok",
    written,
    message: `Pelanggan (${channel.subscribers}) dan tayangan hari ini (${insight.views}) tersimpan.`,
  };
}

async function syncInstagram(
  row: SyncAccountRow,
  accessToken: string,
  date: string,
): Promise<ProviderSyncResult> {
  const target = await findInstagramTarget(accessToken);
  if (!target) {
    return {
      sourceKind: "platform-api",
      status: "error",
      written: 0,
      message: "Tidak ada akun Instagram Business yang tertaut ke halaman Facebook.",
    };
  }

  const profile = await fetchInstagramProfile(target.igUserId, target.pageToken);
  // Identitas akun Instagram Business di sistem asal.
  await recordFollowers(row, profile.followers, `instagram:profile:${target.igUserId}`);

  const audience = await recordAudience(
    row.id,
    `instagram:audience:${target.igUserId}`,
    await fetchInstagramDemographics(target.igUserId, target.pageToken),
  );

  const insight = await fetchInstagramDailyInsights(target.igUserId, target.pageToken);
  if (!insight) {
    return {
      sourceKind: "platform-api",
      status: "ok",
      written: 1 + audience.written,
      message:
        "Metrik pengikut tersimpan. Insight harian dilewati — Meta belum menyediakannya untuk token ini." +
        audienceSentence(audience),
    };
  }

  const write = await upsertDailySocial(
    "instagram",
    date,
    // Identitas baris di sistem asal: akun Instagram Business + tanggal insight.
    `instagram:insights:${target.igUserId}:${date}`,
    {
      reach: insight.reach,
      profileVisits: insight.profileViews,
      followersGained: Math.max(0, profile.followers - row.followers),
    },
  );

  const written = 1 + (write.status === "written" ? 1 : 0) + audience.written;

  if (write.status !== "written") {
    return {
      sourceKind: "platform-api",
      status: "skipped",
      written,
      message:
        `Metrik pengikut dan jangkauan (${insight.reach}) terbaca, tetapi tidak ditulis: ` +
        writeReason(write) +
        audienceSentence(audience),
    };
  }

  return {
    sourceKind: "platform-api",
    status: "ok",
    written,
    message:
      `Metrik pengikut, jangkauan (${insight.reach}), dan kunjungan profil (${insight.profileViews}) tersimpan.` +
      audienceSentence(audience),
  };
}

async function syncFacebook(
  row: SyncAccountRow,
  accessToken: string,
): Promise<ProviderSyncResult> {
  const page = await findFirstPage(accessToken);
  if (!page) {
    return {
      sourceKind: "platform-api",
      status: "error",
      written: 0,
      message: "Tidak ada Halaman Facebook yang dapat diakses token ini.",
    };
  }

  const profile = await fetchPageProfile(page.pageId, page.pageToken);
  // Identitas Halaman Facebook di sistem asal.
  await recordFollowers(row, profile.followers, `facebook:page:${page.pageId}`);

  const audience = await recordAudience(
    row.id,
    `facebook:audience:${page.pageId}`,
    await fetchPageDemographics(page.pageId, page.pageToken),
  );

  return {
    sourceKind: "platform-api",
    status: "ok",
    written: 1 + audience.written,
    message:
      `Pengikut Halaman "${profile.name}" tersimpan (${profile.followers}).` + audienceSentence(audience),
  };
}

/**
 * Menulis pengikut terbaru ke tabel akun.
 *
 * `connection` diisi 'connected' karena angka ini berasal dari panggilan API
 * yang berhasil — bukan dari pilihan manual seperti pada formulir akun.
 *
 * Provenance diisi di sini, bukan oleh SQL migrasi: baris yang angkanya benar-benar
 * terbaca dari platform ditandai `platform-api`, dan `source_ref` menyimpan identitas
 * kanal di sistem asalnya (`channel.id` / `igUserId` / `pageId`). Tanpa penanda ini,
 * angka hasil API tidak dapat dibedakan dari angka ilustratif seed.
 *
 * Tenant yang sudah terisi tidak diganti (`COALESCE`) agar kepemilikan baris stabil
 * walau organisasi aktif berganti. Bila `organization` masih kosong, penulisan
 * digagalkan lebih awal — sama seperti `upsertDailySocial`.
 */
async function recordFollowers(
  row: SyncAccountRow,
  followers: number,
  sourceRef: string,
): Promise<void> {
  const db = await getDb();
  const tenantId = await currentTenantId(db);
  await db
    .prepare(
      `UPDATE accounts
          SET followers = ?,
              connection = 'connected',
              last_sync_at = ?,
              source_kind = 'platform-api',
              source_ref = ?,
              tenant_id = COALESCE(tenant_id, ?)
        WHERE id = ?`,
    )
    .bind(followers, new Date().toISOString(), sourceRef, tenantId, row.id)
    .run();
}

/* ------------------------------------------------------------------ */
/* Demografi audiens                                                    */
/* ------------------------------------------------------------------ */

/**
 * Label periode demografi.
 *
 * Meta melaporkan demografi pengikut sebagai akumulasi seumur akun tanpa
 * rentang tanggal. Menuliskan tanggal hari ini sebagai periode akan mengarang
 * batas waktu yang tidak pernah dilaporkan platform, dan membuat setiap
 * sinkronisasi menambah baris baru alih-alih menyegarkan baris yang sama.
 * Karena itu kedua ujung periode memakai label yang sama dan tidak berpura-pura
 * menjadi tanggal.
 */
const AUDIENCE_PERIOD = "lifetime";

/** Hasil penulisan demografi, untuk disusun menjadi kalimat laporan. */
interface AudienceWrite {
  /** Jumlah baris yang benar-benar ditulis. */
  written: number;
  /** Jumlah baris yang tidak ditulis karena bertabrakan dengan data non-API. */
  blocked: number;
  /** `true` bila platform tidak mengembalikan demografi apa pun. */
  unavailable: boolean;
}

/** Kalimat laporan demografi yang dipakai ulang oleh pemanggil. */
function audienceSentence(write: AudienceWrite): string {
  if (write.unavailable) {
    return " Demografi audiens tidak tersedia untuk token ini.";
  }
  const parts = [` Demografi audiens: ${write.written} potongan tersimpan.`];
  if (write.blocked > 0) {
    parts.push(
      `${write.blocked} potongan tidak ditulis karena barisnya sudah terisi data non-API; ` +
        "bersihkan baris tersebut lebih dahulu.",
    );
  }
  return ` ${parts.join(" ")}`;
}

/**
 * Menyeragamkan kosakata bucket platform ke kosakata basis data.
 *
 * Meta memakai kode satu huruf untuk jenis kelamin (`F`/`M`/`U`), sedangkan
 * basis data memakai label yang dapat dibaca. Dimensi lain dibiarkan apa adanya
 * karena Meta memang sudah mengirim nilai yang bermakna (`25-34`, `ID`,
 * `Jakarta`).
 */
function normalizeBucket(dimension: AudienceDimension, bucket: string): string {
  const trimmed = bucket.trim();
  if (dimension !== "gender") return trimmed;
  const key = trimmed.toUpperCase();
  if (key === "F" || key === "FEMALE") return "Perempuan";
  if (key === "M" || key === "MALE") return "Laki-laki";
  return "Tidak diketahui";
}

/**
 * Menulis demografi audiens hasil API ke `audience_insights`.
 *
 * Baris yang kuncinya sama tetapi provenance-nya bukan `platform-api` tidak
 * ditimpa — sama seperti `upsertDailySocial` — supaya angka ilustratif tidak
 * berubah label menjadi angka yang seolah-olah terukur. `source_ref` menyimpan
 * identitas akun di sistem asal, sehingga barisnya dapat ditelusuri kembali ke
 * panggilan API yang menghasilkannya.
 *
 * Nilai disimpan apa adanya seperti dilaporkan platform (jumlah orang atau
 * persentase, bergantung metrik). UI menghitung proporsinya terhadap total satu
 * dimensi, jadi kedua bentuk itu tetap terbaca benar.
 *
 * Diekspor agar aturan proteksi provenance-nya dapat diuji langsung dengan D1
 * tiruan — D1 lokal tidak dapat dijalankan di lingkungan pengembangan ini.
 */
export async function recordAudience(
  accountId: string,
  sourceRefPrefix: string,
  points: AudiencePoint[] | null,
): Promise<AudienceWrite> {
  // Satu bucket muncul sekali per dimensi; peta ini menjaga penulisan tetap
  // unik walau platform mengirim potongan yang sama dua kali.
  const unique = new Map<string, AudiencePoint>();
  for (const point of points ?? []) {
    const bucket = normalizeBucket(point.dimension, point.bucket);
    if (bucket === "" || !Number.isFinite(point.value)) continue;
    unique.set(`${point.dimension}:${bucket}`, { ...point, bucket });
  }
  const normalized = [...unique.values()];
  if (normalized.length === 0) {
    return { written: 0, blocked: 0, unavailable: true };
  }

  const db = await getDb();
  const existing = await db
    .prepare(
      `SELECT dimension, bucket, source_kind FROM audience_insights
        WHERE account_id = ? AND period_start = ? AND period_end = ?`,
    )
    .bind(accountId, AUDIENCE_PERIOD, AUDIENCE_PERIOD)
    .all<{ dimension: string; bucket: string; source_kind: string | null }>();
  const protectedKeys = new Set(
    (existing.results ?? [])
      .filter((row) => row.source_kind !== "platform-api")
      .map((row) => `${row.dimension}:${row.bucket}`),
  );

  const writable = normalized.filter((point) => !protectedKeys.has(`${point.dimension}:${point.bucket}`));
  const blocked = normalized.length - writable.length;
  if (writable.length === 0) {
    return { written: 0, blocked, unavailable: false };
  }

  const tenantId = await currentTenantId(db);
  const statements = writable.map((point) =>
    db
      .prepare(
        `INSERT INTO audience_insights
           (id, tenant_id, account_id, dimension, bucket, value, period_start, period_end, source_kind, source_ref)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'platform-api', ?)
         ON CONFLICT (account_id, dimension, bucket, period_start, period_end)
         DO UPDATE SET value = excluded.value,
                       source_kind = excluded.source_kind,
                       source_ref = excluded.source_ref,
                       tenant_id = COALESCE(audience_insights.tenant_id, excluded.tenant_id)
           WHERE audience_insights.source_kind = 'platform-api'`,
      )
      .bind(
        `${accountId}:${point.dimension}:${point.bucket}:${AUDIENCE_PERIOD}`,
        tenantId,
        accountId,
        point.dimension,
        point.bucket,
        point.value,
        AUDIENCE_PERIOD,
        AUDIENCE_PERIOD,
        `${sourceRefPrefix}:${point.dimension}:${point.bucket}`,
      ),
  );
  await db.batch(statements);

  return { written: writable.length, blocked, unavailable: false };
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

/** Status penulisan satu baris metrik harian. */
interface DailySocialWrite {
  status: "written" | "blocked" | "nothing-to-write";
  date: string;
  /** Diisi saat status 'blocked': label provenance baris yang sudah ada. */
  existingKind: string | null;
}

/**
 * Tenant pemilik data.
 *
 * Gagal cepat bila tabel `organization` masih kosong: menulis baris tanpa pemilik
 * menghasilkan data yang tidak dapat ditelusuri, dan itu lebih buruk daripada
 * sinkronisasi yang berhenti dengan pesan jelas. Diekspor agar endpoint tulis lain
 * (mis. pembuatan akun) memakai syarat kepemilikan yang sama.
 */
export async function currentTenantId(db: D1Database): Promise<string> {
  const row = await db
    .prepare("SELECT id FROM organization ORDER BY id LIMIT 1")
    .first<{ id: string }>();
  if (!row?.id) {
    throw new Error(
      "Tabel organization masih kosong sehingga pemilik data tidak dapat ditentukan. Jalankan migrasi dan seed terlebih dahulu.",
    );
  }
  return row.id;
}

/** Kalimat alasan yang dipakai ulang oleh pemanggil saat penulisan tidak terjadi. */
function writeReason(write: DailySocialWrite): string {
  if (write.status === "nothing-to-write") {
    return "tidak ada angka terukur yang dikirim platform.";
  }
  const label =
    write.existingKind === null ? "tanpa label asal data" : `berlabel asal data "${write.existingKind}"`;
  return (
    `baris tanggal ${write.date} pada tabel metrik sudah terisi dan ${label}. ` +
    "Angka API tidak dicampurkan ke baris itu agar data ilustratif tidak menyamar sebagai " +
    "data aktual; bersihkan baris tersebut lebih dahulu."
  );
}

/**
 * Menggabungkan metrik harian hasil API ke baris tanggal tersebut.
 *
 * Hanya kolom yang benar-benar diukur yang ditimpa; kolom lain dibiarkan apa
 * adanya (bukan direset ke nol) agar data lain pada tanggal yang sama tidak
 * rusak. Karena kolom tabelnya NOT NULL tanpa DEFAULT, saat menyisipkan baris
 * baru sisa kolom diisi 0 secara eksplisit.
 *
 * Baris yang sudah ada dan provenance-nya bukan `platform-api` (mis. `seed`)
 * TIDAK disentuh: menimpanya akan membuat angka ilustratif berubah label menjadi
 * angka API yang seolah-olah terukur. Pemanggil menerima status 'blocked' dan
 * wajib melaporkannya, bukan mengaku berhasil.
 *
 * Diekspor agar aturan proteksi provenance-nya dapat diuji langsung dengan D1
 * tiruan — D1 lokal tidak dapat dijalankan di lingkungan pengembangan ini.
 */
export async function upsertDailySocial(
  platform: Platform,
  date: string,
  sourceRef: string,
  patch: DailySocialPatch,
): Promise<DailySocialWrite> {
  const changed = DAILY_PATCH_KEYS.filter((key) => typeof patch[key] === "number");
  if (changed.length === 0) {
    return { status: "nothing-to-write", date, existingKind: null };
  }

  const db = await getDb();

  const existing = await db
    .prepare("SELECT source_kind FROM social_daily WHERE date = ? AND platform = ?")
    .bind(date, platform)
    .first<{ source_kind: string | null }>();

  if (existing && existing.source_kind !== "platform-api") {
    return { status: "blocked", date, existingKind: existing.source_kind };
  }

  const tenantId = await currentTenantId(db);
  const columns = ["date", "platform", ...DAILY_COLUMNS, "source_kind", "source_ref", "tenant_id"];
  const values = [
    date,
    platform,
    ...DAILY_PATCH_KEYS.map((key) => patch[key] ?? 0),
    "platform-api",
    sourceRef,
    tenantId,
  ];
  const updates = [
    ...changed.map((key) => `${DAILY_COLUMN_MAP[key]} = excluded.${DAILY_COLUMN_MAP[key]}`),
    "source_kind = excluded.source_kind",
    "source_ref = excluded.source_ref",
    // Tenant yang sudah terisi tidak diganti.
    "tenant_id = COALESCE(social_daily.tenant_id, excluded.tenant_id)",
  ];

  await db
    .prepare(
      `INSERT INTO social_daily (${columns.join(", ")})
       VALUES (${columns.map(() => "?").join(", ")})
       ON CONFLICT (date, platform) DO UPDATE SET ${updates.join(", ")}
         WHERE social_daily.source_kind = 'platform-api'`,
    )
    .bind(...values)
    .run();

  return { status: "written", date, existingKind: null };
}
