/**
 * Entry point Worker kustom.
 *
 * Worker yang dihasilkan adapter OpenNext hanya mengekspor handler `fetch`.
 * Cron Trigger membutuhkan handler `scheduled`, jadi berkas ini memakai ulang
 * handler `fetch` hasil build lalu menambahkan `scheduled` — pola resmi dari
 * dokumentasi @opennextjs/cloudflare.
 *
 * `scheduled` sengaja tidak berisi logika sinkronisasi langsung: ia memanggil
 * endpoint `/api/sync/run` milik aplikasi lewat service binding, sehingga akses
 * D1 dan dekripsi kredensial tetap berjalan di satu jalur yang sama dengan
 * tombol "Sinkronkan sekarang".
 */

// Berkas `.open-next/worker.js` baru ada setelah `opennextjs-cloudflare build`,
// sehingga impor ini perlu diabaikan saat berkasnya belum dibangun. Anotasi
// dipilih ketimbang @ts-expect-error karena pada salinan yang sudah dibangun
// impornya justru sah.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { default as openNextWorker } from "./.open-next/worker.js";

/** Jalur endpoint sinkronisasi. Wajib sama dengan app/api/sync/run/route.ts. */
const SYNC_PATH = "/api/sync/run";

/** Host tidak dipakai untuk routing oleh service binding; jalur yang menentukan. */
const SELF_ORIGIN = "https://hanamasaki2";

export default {
  fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    return openNextWorker.fetch(request, env, ctx);
  },

  async scheduled(
    controller: ScheduledController,
    env: CloudflareEnv,
    ctx: ExecutionContext,
  ): Promise<void> {
    const adminToken = env.ADMIN_TOKEN;
    if (!adminToken) {
      // Tidak ada yang bisa dijalankan: endpoint sinkronisasi gagal-tertutup
      // tanpa token admin. Dicatat agar terlihat di log Worker.
      console.error("[cron] sinkronisasi dilewati: secret ADMIN_TOKEN belum diatur.");
      return;
    }

    console.log(`[cron] sinkronisasi dimulai (${controller.cron}).`);
    ctx.waitUntil(runSync(env, adminToken));
  },
} satisfies ExportedHandler<CloudflareEnv>;

async function runSync(env: CloudflareEnv, adminToken: string): Promise<void> {
  try {
    const response = await env.WORKER_SELF_REFERENCE.fetch(`${SELF_ORIGIN}${SYNC_PATH}`, {
      method: "POST",
      headers: { "x-admin-token": adminToken },
    });
    const body = await response.text();
    if (response.ok) {
      console.log(`[cron] sinkronisasi selesai: ${body}`);
    } else {
      console.error(`[cron] sinkronisasi gagal (HTTP ${response.status}): ${body}`);
    }
  } catch (error) {
    console.error(
      "[cron] sinkronisasi error:",
      error instanceof Error ? `${error.name}: ${error.message}` : "penyebab tidak diketahui",
    );
  }
}
