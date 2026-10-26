import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Mengambil binding D1 dari runtime Cloudflare.
 *
 * Selalu memakai mode `async`, karena mode sinkron melempar error kalau dipanggil
 * dari route yang dirender statis.
 */
export async function getDb(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  const db = env.DB;
  if (!db) {
    throw new Error(
      'Binding D1 "DB" tidak tersedia. Periksa blok d1_databases pada wrangler.jsonc.',
    );
  }
  return db;
}
