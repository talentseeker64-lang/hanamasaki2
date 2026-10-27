import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Mengambil binding runtime Cloudflare (D1 dan secret).
 *
 * Selalu memakai mode `async`, karena mode sinkron melempar error kalau dipanggil
 * dari route yang dirender statis.
 */
export async function getEnv(): Promise<CloudflareEnv> {
  const { env } = await getCloudflareContext({ async: true });
  return env;
}

export async function getDb(): Promise<D1Database> {
  const env = await getEnv();
  const db = env.DB;
  if (!db) {
    throw new Error(
      'Binding D1 "DB" tidak tersedia. Periksa blok d1_databases pada wrangler.jsonc.',
    );
  }
  return db;
}

/** Baris hasil kueri D1 sebagai array — `results` bernilai null bila kosong. */
export function rowsOf<T>(result: D1Result): T[] {
  return (result.results ?? []) as T[];
}
