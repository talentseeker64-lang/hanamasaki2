import { getEnv } from "./db";
import type { AudienceDimension, AudiencePoint } from "./types";

/**
 * Klien tipis untuk Meta Graph API.
 *
 * Dipakai oleh alur OAuth (Tahap 2) dan tugas sinkronisasi (Tahap 3). Seluruh
 * panggilan jaringan ada di sini supaya rute API tidak pernah menyentuh detail
 * protokol, dan supaya tidak ada rahasia yang bocor ke respons HTTP.
 */

/** Naikkan serentak saat Meta menghentikan dukungan versi lama. */
export const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const OAUTH_DIALOG = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;

/**
 * Izin minimum yang diminta saat otorisasi.
 *
 * Tanpa `instagram_manage_insights` metrik jangkauan tidak tersedia, sehingga
 * akun akan tampak "terhubung" tetapi tanpa angka apa pun.
 */
export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_manage_insights",
  "business_management",
];

/** Nama cookie penyimpan state OAuth. Hanya peramban admin yang memilikinya. */
export const META_STATE_COOKIE = "peakalpha.meta.oauth";

/** Kesalahan dari sisi Meta atau konfigurasi yang aman ditampilkan ke admin. */
export class MetaApiError extends Error {
  /**
   * Kode HTTP respons Meta, atau `null` bila kegagalannya bukan dari respons
   * (mis. konfigurasi belum diatur). Dipakai `lib/retry.ts` untuk membedakan
   * kegagalan sementara (429, 5xx) dari kegagalan permanen.
   */
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "MetaApiError";
    this.status = status;
  }
}

export interface MetaAppConfig {
  appId: string;
  appSecret: string;
}

export interface MetaToken {
  accessToken: string;
  /** ISO 8601, atau null bila Meta tidak memberi tahu masa berlakunya. */
  expiresAt: string | null;
}

/**
 * Membaca kredensial aplikasi Meta dari secret Worker.
 *
 * Gagal cepat bila belum diatur — lebih baik daripada mencoba otorisasi dengan
 * client id kosong dan mendapat pesan error yang membingungkan dari Meta.
 */
export async function getMetaAppConfig(): Promise<MetaAppConfig> {
  const env = await getEnv();
  const appId = env.META_APP_ID;
  const appSecret = env.META_APP_SECRET;
  if (!appId || !appSecret) {
    throw new MetaApiError(
      "Aplikasi Meta belum dikonfigurasi. Atur secret META_APP_ID dan META_APP_SECRET: " +
        "npx wrangler secret put META_APP_ID && npx wrangler secret put META_APP_SECRET",
    );
  }
  return { appId, appSecret };
}

/**
 * URL balikan yang didaftarkan ke Meta.
 *
 * Memakai origin permintaan yang sedang berjalan supaya alur ini juga bekerja di
 * URL pratinjau Worker. Nilai dapat ditimpa lewat secret META_REDIRECT_URI bila
 * Meta mengharuskan alamat tetap.
 */
export async function resolveRedirectUri(request: Request): Promise<string> {
  const env = await getEnv();
  if (env.META_REDIRECT_URI) return env.META_REDIRECT_URI;
  return new URL("/api/oauth/meta/callback", request.url).toString();
}

export function buildAuthorizeUrl(
  config: MetaAppConfig,
  redirectUri: string,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    scope: META_SCOPES.join(","),
  });
  return `${OAUTH_DIALOG}?${params.toString()}`;
}

/** Membaca respons Graph API; setiap bentuk penolakan menjadi MetaApiError. */
async function readGraph(response: Response): Promise<Record<string, unknown>> {
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (payload === null) {
    throw new MetaApiError(`Respons Meta tidak dapat dibaca (HTTP ${response.status}).`, response.status);
  }
  const error = payload.error;
  if (!response.ok || typeof error === "object") {
    const message =
      typeof error === "object" && error !== null && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : `Meta menolak permintaan (HTTP ${response.status}).`;
    throw new MetaApiError(`Meta menolak permintaan: ${message}`, response.status);
  }
  return payload;
}

async function requestToken(params: Record<string, string>): Promise<MetaToken> {
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const payload = await readGraph(await fetch(url));
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  if (accessToken === "") {
    throw new MetaApiError("Meta tidak mengembalikan access token.");
  }
  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : null;
  return {
    accessToken,
    expiresAt: expiresIn === null ? null : new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

/** Kode otorisasi -> token jangka pendek (berlaku sekitar satu jam). */
export async function exchangeCodeForToken(
  config: MetaAppConfig,
  redirectUri: string,
  code: string,
): Promise<MetaToken> {
  return requestToken({
    client_id: config.appId,
    client_secret: config.appSecret,
    redirect_uri: redirectUri,
    code,
  });
}

/**
 * Token jangka pendek -> token jangka panjang (sekitar 60 hari).
 *
 * Fungsi yang sama juga dipakai untuk memperpanjang token jangka panjang yang
 * mendekati kedaluwarsa, sesuai alur resmi Meta.
 */
export async function exchangeForLongLivedToken(
  config: MetaAppConfig,
  accessToken: string,
): Promise<MetaToken> {
  return requestToken({
    grant_type: "fb_exchange_token",
    client_id: config.appId,
    client_secret: config.appSecret,
    fb_exchange_token: accessToken,
  });
}

export interface MetaIdentity {
  id: string;
  name: string;
}

/**
 * Memanggil `/me`.
 *
 * Inilah bukti nyata bahwa token benar-benar berlaku: permintaan ini gagal bila
 * token salah, kedaluwarsa, atau izinnya dicabut.
 */
export async function fetchIdentity(accessToken: string): Promise<MetaIdentity> {
  const url = new URL(`${GRAPH_BASE}/me`);
  url.searchParams.set("fields", "id,name");
  url.searchParams.set("access_token", accessToken);

  const payload = await readGraph(await fetch(url));
  const id = typeof payload.id === "string" ? payload.id : "";
  if (id === "") {
    throw new MetaApiError("Meta tidak mengembalikan identitas pengguna.");
  }
  return { id, name: typeof payload.name === "string" ? payload.name : "" };
}

export interface InstagramTarget {
  igUserId: string;
  username: string;
  followers: number;
  mediaCount: number;
  pageId: string;
  pageName: string;
  /** Token halaman; dipakai untuk memanggil insight Instagram. */
  pageToken: string;
}

/**
 * Mencari akun Instagram Business yang tertaut ke salah satu halaman Facebook
 * milik pengguna. Mengembalikan `null` bila tidak ada yang tertaut.
 */
export async function findInstagramTarget(accessToken: string): Promise<InstagramTarget | null> {
  const url = new URL(`${GRAPH_BASE}/me/accounts`);
  url.searchParams.set(
    "fields",
    "id,name,access_token,instagram_business_account{id,username,followers_count,media_count}",
  );
  url.searchParams.set("access_token", accessToken);

  const payload = await readGraph(await fetch(url));
  const pages = Array.isArray(payload.data) ? payload.data : [];

  for (const entry of pages) {
    if (typeof entry !== "object" || entry === null) continue;
    const page = entry as Record<string, unknown>;
    const ig = page.instagram_business_account;
    if (typeof ig !== "object" || ig === null) continue;
    const igRecord = ig as Record<string, unknown>;
    if (typeof igRecord.id !== "string") continue;

    return {
      igUserId: igRecord.id,
      username: typeof igRecord.username === "string" ? igRecord.username : "",
      followers: typeof igRecord.followers_count === "number" ? igRecord.followers_count : 0,
      mediaCount: typeof igRecord.media_count === "number" ? igRecord.media_count : 0,
      pageId: typeof page.id === "string" ? page.id : "",
      pageName: typeof page.name === "string" ? page.name : "",
      pageToken: typeof page.access_token === "string" ? page.access_token : accessToken,
    };
  }
  return null;
}

export interface InstagramProfile {
  username: string;
  followers: number;
  mediaCount: number;
}

export async function fetchInstagramProfile(
  igUserId: string,
  accessToken: string,
): Promise<InstagramProfile> {
  const url = new URL(`${GRAPH_BASE}/${encodeURIComponent(igUserId)}`);
  url.searchParams.set("fields", "username,followers_count,media_count");
  url.searchParams.set("access_token", accessToken);

  const payload = await readGraph(await fetch(url));
  return {
    username: typeof payload.username === "string" ? payload.username : "",
    followers: typeof payload.followers_count === "number" ? payload.followers_count : 0,
    mediaCount: typeof payload.media_count === "number" ? payload.media_count : 0,
  };
}

export interface InstagramDailyInsight {
  reach: number;
  profileViews: number;
}

/**
 * Insight harian Instagram.
 *
 * Mengembalikan `null` bila Meta menolak (izin belum disetujui atau metrik tidak
 * tersedia untuk akun ini). Ini bukan kegagalan sinkronisasi: metrik pengikut
 * tetap tersimpan, hanya metrik harian yang dilewati.
 */
export async function fetchInstagramDailyInsights(
  igUserId: string,
  accessToken: string,
): Promise<InstagramDailyInsight | null> {
  const url = new URL(`${GRAPH_BASE}/${encodeURIComponent(igUserId)}/insights`);
  url.searchParams.set("metric", "reach,profile_views");
  url.searchParams.set("period", "day");
  url.searchParams.set("access_token", accessToken);

  let payload: Record<string, unknown>;
  try {
    payload = await readGraph(await fetch(url));
  } catch {
    return null;
  }

  const series = Array.isArray(payload.data) ? payload.data : [];
  let reach = 0;
  let profileViews = 0;

  for (const entry of series) {
    if (typeof entry !== "object" || entry === null) continue;
    const metric = entry as Record<string, unknown>;
    const values = Array.isArray(metric.values) ? metric.values : [];
    const last = values[values.length - 1];
    const value =
      typeof last === "object" && last !== null
        ? (last as Record<string, unknown>).value
        : undefined;
    if (typeof value !== "number") continue;
    if (metric.name === "reach") reach = value;
    if (metric.name === "profile_views") profileViews = value;
  }

  return { reach, profileViews };
}

export interface PageProfile {
  name: string;
  followers: number;
}

export async function fetchPageProfile(
  pageId: string,
  accessToken: string,
): Promise<PageProfile> {
  const url = new URL(`${GRAPH_BASE}/${encodeURIComponent(pageId)}`);
  url.searchParams.set("fields", "name,followers_count,fan_count");
  url.searchParams.set("access_token", accessToken);

  const payload = await readGraph(await fetch(url));
  const followers =
    typeof payload.followers_count === "number"
      ? payload.followers_count
      : typeof payload.fan_count === "number"
        ? payload.fan_count
        : 0;

  return {
    name: typeof payload.name === "string" ? payload.name : "",
    followers,
  };
}

/** Halaman Facebook pertama milik pengguna, dipakai akun berplatform facebook. */
export async function findFirstPage(
  accessToken: string,
): Promise<{ pageId: string; pageName: string; pageToken: string } | null> {
  const url = new URL(`${GRAPH_BASE}/me/accounts`);
  url.searchParams.set("fields", "id,name,access_token");
  url.searchParams.set("access_token", accessToken);

  const payload = await readGraph(await fetch(url));
  const pages = Array.isArray(payload.data) ? payload.data : [];
  const first = pages[0];
  if (typeof first !== "object" || first === null) return null;

  const page = first as Record<string, unknown>;
  if (typeof page.id !== "string") return null;

  return {
    pageId: page.id,
    pageName: typeof page.name === "string" ? page.name : "",
    pageToken: typeof page.access_token === "string" ? page.access_token : accessToken,
  };
}

/* ------------------------------------------------------------------ */
/* Demografi audiens                                                   */
/* ------------------------------------------------------------------ */

/**
 * Demografi pengikut Instagram.
 *
 * Meta menyalurkannya lewat satu metrik (`follower_demographics`) yang harus
 * diminta satu dimensi per panggilan; `breakdown` tidak menerima daftar. Karena
 * itu tiap dimensi diambil terpisah dan kegagalan satu dimensi (mis. `country`
 * belum tersedia untuk akun tertentu) tidak membatalkan yang lain.
 *
 * Dimensi `city` sengaja tidak diminta: untuk Instagram, Meta mengembalikan
 * *city ID* berupa angka, bukan nama kota. Menyimpannya hanya akan menghasilkan
 * bucket yang tidak dapat dibaca siapa pun, dan menerjemahkannya sendiri berarti
 * menebak. Halaman Facebook tetap punya dimensi kota karena metriknya memang
 * mengirim nama kota.
 *
 * Mengembalikan `null` bila tidak satu pun dimensi berhasil — itu berarti Meta
 * memang tidak menyediakannya untuk token ini, bukan kegagalan sinkronisasi.
 */
export async function fetchInstagramDemographics(
  igUserId: string,
  accessToken: string,
): Promise<AudiencePoint[] | null> {
  const dimensions: AudienceDimension[] = ["age", "gender", "country"];
  const results = await Promise.all(
    dimensions.map((dimension) => fetchInstagramDemographic(igUserId, accessToken, dimension)),
  );
  const points = results.flat();
  return points.length === 0 ? null : points;
}

async function fetchInstagramDemographic(
  igUserId: string,
  accessToken: string,
  dimension: AudienceDimension,
): Promise<AudiencePoint[]> {
  const url = new URL(`${GRAPH_BASE}/${encodeURIComponent(igUserId)}/insights`);
  url.searchParams.set("metric", "follower_demographics");
  url.searchParams.set("period", "lifetime");
  // Metrik ini hanya mengembalikan total dalam bentuk `total_value`, bukan deret waktu.
  url.searchParams.set("metric_type", "total_value");
  url.searchParams.set("breakdown", dimension);
  url.searchParams.set("access_token", accessToken);

  let payload: Record<string, unknown>;
  try {
    payload = await readGraph(await fetch(url));
  } catch {
    return [];
  }

  const data = Array.isArray(payload.data) ? payload.data : [];
  const first = data[0];
  if (typeof first !== "object" || first === null) return [];

  const totalValue = ((first as Record<string, unknown>).total_value ?? {}) as Record<string, unknown>;
  const breakdowns = Array.isArray(totalValue.breakdowns) ? totalValue.breakdowns : [];

  const points: AudiencePoint[] = [];
  for (const entry of breakdowns) {
    if (typeof entry !== "object" || entry === null) continue;
    const results = (entry as Record<string, unknown>).results;
    if (!Array.isArray(results)) continue;
    for (const result of results) {
      if (typeof result !== "object" || result === null) continue;
      const record = result as Record<string, unknown>;
      const values = Array.isArray(record.dimension_values) ? record.dimension_values : [];
      const bucket = typeof values[0] === "string" ? values[0] : "";
      const value = toNumber(record.value);
      if (bucket === "" || value === null) continue;
      points.push({ dimension, bucket, value });
    }
  }
  return points;
}

/** Metrik demografi Halaman Facebook beserta dimensi yang diwakilinya. */
const PAGE_DEMOGRAPHIC_METRICS = ["page_fans_gender_age", "page_fans_country", "page_fans_city"] as const;

/**
 * Demografi pengikut Halaman Facebook.
 *
 * Berbeda dari Instagram, Meta mengirim ketiganya dalam satu panggilan sebagai
 * peta `label -> jumlah`. `page_fans_gender_age` menggabungkan dua dimensi dalam
 * satu label (`F.25-34`), jadi hasilnya dipecah menjadi dimensi `gender` dan
 * `age` secara terpisah dengan menjumlahkan sisi lainnya.
 *
 * Mengembalikan `null` bila Meta menolak — sama seperti Instagram, itu berarti
 * datanya tidak tersedia untuk token ini.
 */
export async function fetchPageDemographics(
  pageId: string,
  accessToken: string,
): Promise<AudiencePoint[] | null> {
  const url = new URL(`${GRAPH_BASE}/${encodeURIComponent(pageId)}/insights`);
  url.searchParams.set("metric", PAGE_DEMOGRAPHIC_METRICS.join(","));
  url.searchParams.set("period", "lifetime");
  url.searchParams.set("access_token", accessToken);

  let payload: Record<string, unknown>;
  try {
    payload = await readGraph(await fetch(url));
  } catch {
    return null;
  }

  const series = Array.isArray(payload.data) ? payload.data : [];
  const points: AudiencePoint[] = [];

  for (const entry of series) {
    if (typeof entry !== "object" || entry === null) continue;
    const metric = entry as Record<string, unknown>;
    const values = Array.isArray(metric.values) ? metric.values : [];
    const last = values[values.length - 1];
    const value =
      typeof last === "object" && last !== null
        ? (last as Record<string, unknown>).value
        : null;
    if (typeof value !== "object" || value === null) continue;

    if (metric.name === "page_fans_gender_age") {
      points.push(...splitGenderAge(value as Record<string, unknown>));
    } else if (metric.name === "page_fans_country") {
      points.push(...toPoints("country", value as Record<string, unknown>));
    } else if (metric.name === "page_fans_city") {
      points.push(...toPoints("city", value as Record<string, unknown>));
    }
  }

  return points.length === 0 ? null : points;
}

/** Memecah peta `F.25-34 -> jumlah` menjadi dimensi gender dan age. */
function splitGenderAge(map: Record<string, unknown>): AudiencePoint[] {
  const byGender = new Map<string, number>();
  const byAge = new Map<string, number>();

  for (const [key, raw] of Object.entries(map)) {
    const value = toNumber(raw);
    if (value === null) continue;
    const separator = key.indexOf(".");
    if (separator <= 0) continue;
    const gender = key.slice(0, separator);
    const age = key.slice(separator + 1);
    if (age === "") continue;
    byGender.set(gender, (byGender.get(gender) ?? 0) + value);
    byAge.set(age, (byAge.get(age) ?? 0) + value);
  }

  return [
    ...[...byGender].map(([bucket, value]) => ({ dimension: "gender" as const, bucket, value })),
    ...[...byAge].map(([bucket, value]) => ({ dimension: "age" as const, bucket, value })),
  ];
}

function toPoints(
  dimension: AudienceDimension,
  map: Record<string, unknown>,
): AudiencePoint[] {
  const points: AudiencePoint[] = [];
  for (const [bucket, raw] of Object.entries(map)) {
    const value = toNumber(raw);
    if (bucket === "" || value === null) continue;
    points.push({ dimension, bucket, value });
  }
  return points;
}

/** Meta mengirim angka demografi sebagai angka maupun string. */
function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
