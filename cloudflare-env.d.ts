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
}
