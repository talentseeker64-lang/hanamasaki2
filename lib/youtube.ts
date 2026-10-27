import { getEnv } from "./db";

/**
 * Klien tipis untuk Google OAuth 2.0 dan YouTube API.
 *
 * Dipakai alur OAuth (Tahap 2 lanjutan) dan tugas sinkronisasi. Seluruh
 * panggilan jaringan ada di sini supaya rute API tidak menyentuh detail
 * protokol dan tidak ada rahasia yang bocor ke respons HTTP.
 *
 * Berbeda dari Meta, token akses Google hanya berlaku sekitar satu jam sehingga
 * refresh token wajib disimpan — tanpa itu koneksi mati dalam hitungan jam.
 */

/** Nama cookie penyimpan state OAuth untuk penyedia Google. */
export const GOOGLE_STATE_COOKIE = "peakalpha.google.oauth";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const DATA_ENDPOINT = "https://www.googleapis.com/youtube/v3";
const ANALYTICS_ENDPOINT = "https://youtubeanalytics.googleapis.com/v2";

/** Izin minimum: Data API untuk profil channel, Analytics API untuk tayangan. */
export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

/** Kesalahan dari sisi Google atau konfigurasi yang aman ditampilkan ke admin. */
export class GoogleApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleApiError";
  }
}

export interface GoogleAppConfig {
  clientId: string;
  clientSecret: string;
}

export interface GoogleToken {
  accessToken: string;
  /** Hanya diisi saat pertama kali otorisasi; refresh berikutnya tidak mengirim ulang. */
  refreshToken: string | null;
  expiresAt: string | null;
}

/**
 * Membaca kredensial klien OAuth Google dari secret Worker.
 *
 * Gagal cepat bila belum diatur, supaya pesan errornya jelas dan bukan
 * kegagalan otorisasi yang membingungkan dari Google.
 */
export async function getGoogleAppConfig(): Promise<GoogleAppConfig> {
  const env = await getEnv();
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new GoogleApiError(
      "Klien OAuth Google belum dikonfigurasi. Atur secret GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET: " +
        "npx wrangler secret put GOOGLE_CLIENT_ID && npx wrangler secret put GOOGLE_CLIENT_SECRET",
    );
  }
  return { clientId, clientSecret };
}

/**
 * URL balikan yang didaftarkan di Google Cloud Console.
 *
 * Nilai default mengikuti origin permintaan yang sedang berjalan; dapat ditimpa
 * lewat secret GOOGLE_REDIRECT_URI bila Google mengharuskan alamat tetap.
 */
export async function resolveGoogleRedirectUri(request: Request): Promise<string> {
  const env = await getEnv();
  if (env.GOOGLE_REDIRECT_URI) return env.GOOGLE_REDIRECT_URI;
  return new URL("/api/oauth/google/callback", request.url).toString();
}

export function buildGoogleAuthorizeUrl(
  config: GoogleAppConfig,
  redirectUri: string,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: YOUTUBE_SCOPES.join(" "),
    // Dua parameter ini yang membuat Google mengirim refresh token.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/** Membaca respons Google; setiap bentuk penolakan menjadi GoogleApiError. */
async function readGoogle(response: Response): Promise<Record<string, unknown>> {
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (payload === null) {
    throw new GoogleApiError(`Respons Google tidak dapat dibaca (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    throw new GoogleApiError(`Google menolak permintaan: ${describeError(payload, response.status)}`);
  }
  return payload;
}

/**
 * Google memakai dua bentuk galat: OAuth memakai `{error, error_description}`
 * (string), sedangkan API memakai `{error: {message}}` (objek).
 */
function describeError(payload: Record<string, unknown>, status: number): string {
  const raw = payload.error;

  if (typeof raw === "string") {
    return typeof payload.error_description === "string" ? payload.error_description : raw;
  }
  if (typeof raw === "object" && raw !== null) {
    const message = (raw as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return `HTTP ${status}`;
}

async function requestToken(body: URLSearchParams): Promise<GoogleToken> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await readGoogle(response);

  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  if (accessToken === "") {
    throw new GoogleApiError("Google tidak mengembalikan access token.");
  }

  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : null;
  return {
    accessToken,
    refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : null,
    expiresAt: expiresIn === null ? null : new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

/** Kode otorisasi -> access token + refresh token. */
export async function exchangeGoogleCode(
  config: GoogleAppConfig,
  redirectUri: string,
  code: string,
): Promise<GoogleToken> {
  return requestToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
    }),
  );
}

/** Memperbarui access token yang kedaluwarsa memakai refresh token tersimpan. */
export async function refreshGoogleToken(
  config: GoogleAppConfig,
  refreshToken: string,
): Promise<GoogleToken> {
  return requestToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  );
}

export interface YouTubeChannel {
  id: string;
  title: string;
  /** 0 bila pemilik channel menyembunyikan jumlah pelanggan. */
  subscribers: number;
  totalViews: number;
  videoCount: number;
}

/**
 * Membaca channel milik akun yang diotorisasi (`mine=true`).
 *
 * Panggilan ini sekaligus menjadi bukti bahwa token benar-benar berlaku dan
 * akun tersebut memang punya channel YouTube.
 */
export async function fetchYouTubeChannel(accessToken: string): Promise<YouTubeChannel> {
  const url = new URL(`${DATA_ENDPOINT}/channels`);
  url.searchParams.set("part", "snippet,statistics");
  url.searchParams.set("mine", "true");

  const payload = await readGoogle(
    await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } }),
  );

  const items = Array.isArray(payload.items) ? payload.items : [];
  const first = items[0];
  if (typeof first !== "object" || first === null) {
    throw new GoogleApiError(
      "Akun Google ini tidak memiliki channel YouTube. Buat channel lebih dulu, lalu hubungkan ulang.",
    );
  }

  const channel = first as Record<string, unknown>;
  const snippet = (channel.snippet ?? {}) as Record<string, unknown>;
  const statistics = (channel.statistics ?? {}) as Record<string, unknown>;

  return {
    id: typeof channel.id === "string" ? channel.id : "",
    title: typeof snippet.title === "string" ? snippet.title : "",
    subscribers: toCount(statistics.subscriberCount),
    totalViews: toCount(statistics.viewCount),
    videoCount: toCount(statistics.videoCount),
  };
}

export interface YouTubeDailyViews {
  views: number;
}

/**
 * Tayangan channel pada satu tanggal.
 *
 * Mengembalikan `null` bila Google menolak atau belum ada datanya. Ini bukan
 * kegagalan sinkronisasi: analitik YouTube tertunda hingga 48 jam, jadi hari
 * berjalan sering masih kosong.
 */
export async function fetchYouTubeDailyViews(
  accessToken: string,
  date: string,
): Promise<YouTubeDailyViews | null> {
  const url = new URL(`${ANALYTICS_ENDPOINT}/reports`);
  url.searchParams.set("ids", "channel==MINE");
  url.searchParams.set("startDate", date);
  url.searchParams.set("endDate", date);
  url.searchParams.set("metrics", "views");

  let payload: Record<string, unknown>;
  try {
    payload = await readGoogle(
      await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } }),
    );
  } catch {
    return null;
  }

  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const first = rows[0];
  if (!Array.isArray(first)) return null;

  const views = first[0];
  if (typeof views !== "number") return null;

  return { views };
}

/** Statistik YouTube dikirim sebagai string, bukan angka. */
function toCount(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
