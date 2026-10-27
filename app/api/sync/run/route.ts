import { NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/api";
import { syncAllAccounts } from "@/lib/sync";

/**
 * Menjalankan sinkronisasi metrik untuk seluruh akun.
 *
 * Dipakai dua jalur: tombol "Sinkronkan sekarang" di halaman integrasi, dan
 * handler `scheduled` pada Worker (Cron Trigger) lewat service binding.
 *
 * Hasilnya per akun, bukan satu status gabungan: akun tanpa kredensial atau
 * berplatform yang belum didukung bukan kegagalan, dan itu harus terlihat jelas.
 */
export async function POST(request: Request) {
  try {
    const denied = await requireAdmin(request);
    if (denied) return denied;

    const results = await syncAllAccounts();
    const ok = results.filter((item) => item.status === "ok").length;
    const failed = results.filter((item) => item.status === "error").length;
    const skipped = results.length - ok - failed;

    return NextResponse.json({
      ok: true,
      summary: { total: results.length, ok, failed, skipped },
      results,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
