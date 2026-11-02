/**
 * Konteks Cloudflare tiruan untuk pengujian di Node.
 *
 * `getCloudflareContext` milik `@opennextjs/cloudflare` membaca konteks dari
 * `globalThis[Symbol.for("__cloudflare-context__")]`. Dengan menyetelnya, kode
 * jalur tulis di `lib/sync.ts` dan pembacaan secret di `lib/credentials.ts`
 * dapat diuji memakai binding tiruan — tanpa runtime Workers dan tanpa D1 lokal
 * (yang tidak dapat dijalankan di lingkungan pengembangan ini).
 */
export const CLOUDFLARE_CONTEXT_SYMBOL = Symbol.for("__cloudflare-context__");

/** Menjalankan `fn` dengan `env` sebagai binding Worker, lalu memulihkan global. */
export async function withCloudflareEnv<T>(
  env: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  const global = globalThis as Record<symbol, unknown>;
  const previous = global[CLOUDFLARE_CONTEXT_SYMBOL];
  global[CLOUDFLARE_CONTEXT_SYMBOL] = {
    env,
    cf: {},
    ctx: { waitUntil() {}, passThroughOnException() {} },
  };
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete global[CLOUDFLARE_CONTEXT_SYMBOL];
    else global[CLOUDFLARE_CONTEXT_SYMBOL] = previous;
  }
}
