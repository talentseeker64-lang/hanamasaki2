/**
 * Hook resolusi modul agar pengujian dapat menjalankan modul TypeScript proyek
 * langsung dengan Node, tanpa bundler.
 *
 * Seluruh impor di dalam proyek ditulis tanpa ekstensi (`./metrics`) karena
 * Next.js yang me-resolve-nya. Node tidak melakukan itu, jadi hook ini mencoba
 * menambahkan `.ts` lalu `/index.ts` ketika resolusi pertama gagal. Hanya
 * specifier relatif yang disentuh; impor paket dibiarkan apa adanya.
 *
 * Satu pengecualian: `next/server` ditulis tanpa ekstensi di kode sumber, tetapi
 * berkas ekspor Next.js bernama `server.js`. Pemetaan ini hanya mengubah nama
 * berkas resolusi; `connection()` tetap melempar bila dipanggil di luar siklus
 * permintaan Next, sehingga jalur baca tetap harus diuji lewat fungsi murni.
 */
const PACKAGE_ALIASES = { "next/server": "next/server.js" };

export async function resolve(specifier, context, nextResolve) {
  const alias = PACKAGE_ALIASES[specifier];
  if (alias) return nextResolve(alias, context);
  if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
    return nextResolve(specifier, context);
  }
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
    for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
      try {
        return await nextResolve(candidate, context);
      } catch {
        // Kandidat berikutnya dicoba sebelum menyerah.
      }
    }
    throw error;
  }
}
