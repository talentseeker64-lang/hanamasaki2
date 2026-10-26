/// <reference types="@cloudflare/workers-types" />

// Binding Cloudflare yang tersedia pada runtime Worker.
// Nama properti harus sama dengan `binding` pada wrangler.jsonc.
// Dapat diregenerasi dengan: npm run cf-typegen
interface CloudflareEnv {
  DB: D1Database;
}
