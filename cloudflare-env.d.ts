/// <reference types="@cloudflare/workers-types" />

// Binding Cloudflare yang tersedia pada runtime Worker.
// Nama properti harus sama dengan `binding` pada wrangler.jsonc.
// Dapat diregenerasi dengan: npm run cf-typegen
interface CloudflareEnv {
  DB: D1Database;
  /**
   * Kunci enkripsi kredensial OAuth: base64 dari 32 byte acak.
   * Atur dengan `npx wrangler secret put CREDENTIALS_KEY`.
   */
  CREDENTIALS_KEY?: string;
  /**
   * Token bersama untuk mengizinkan operasi tulis lewat API.
   * Selama belum diatur, seluruh endpoint tulis menolak permintaan (HTTP 503).
   * Atur dengan `npx wrangler secret put ADMIN_TOKEN`.
   */
  ADMIN_TOKEN?: string;
  /**
   * Binding service ke Worker ini sendiri. Dipakai handler `scheduled`
   * (Cron Trigger) untuk memanggil endpoint sinkronisasi internal.
   */
  WORKER_SELF_REFERENCE: Fetcher;
  /**
   * App ID aplikasi Meta (Facebook Login). Atur dengan
   * `npx wrangler secret put META_APP_ID`.
   */
  META_APP_ID?: string;
  /**
   * App secret aplikasi Meta. Dipakai untuk menukar kode otorisasi menjadi token.
   * Atur dengan `npx wrangler secret put META_APP_SECRET`.
   */
  META_APP_SECRET?: string;
  /**
   * Menimpa URL balikan OAuth. Opsional; bila kosong dipakai
   * `<origin>/api/oauth/meta/callback`.
   */
  META_REDIRECT_URI?: string;
  /**
   * Client ID OAuth Google (YouTube). Atur dengan
   * `npx wrangler secret put GOOGLE_CLIENT_ID`.
   */
  GOOGLE_CLIENT_ID?: string;
  /**
   * Client secret OAuth Google. Dipakai untuk menukar kode otorisasi menjadi token.
   * Atur dengan `npx wrangler secret put GOOGLE_CLIENT_SECRET`.
   */
  GOOGLE_CLIENT_SECRET?: string;
  /**
   * Menimpa URL balikan OAuth Google. Opsional; bila kosong dipakai
   * `<origin>/api/oauth/google/callback`.
   */
  GOOGLE_REDIRECT_URI?: string;
}
