import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { getDb } from "@/lib/db";
import { resolveGoogleAccessToken } from "@/lib/sync";
import { GoogleApiError, fetchYouTubeVideos } from "@/lib/youtube";

/**
 * Daftar video channel YouTube yang sedang terhubung.
 *
 * Endpoint baca: hanya mengembalikan data publik channel (judul, durasi,
 * statistik) dan tidak pernah menyentuh kredensial. Token akses diambil dari
 * penyimpanan terenkripsi lalu diperbarui bila sudah mendekati kedaluwarsa.
 *
 * Parameter `account` opsional untuk memilih akun tertentu; tanpa itu dipakai
 * akun YouTube pertama sesuai urutan tampilan.
 */
export async function GET(request: Request) {
  try {
    const requested = new URL(request.url).searchParams.get("account");
    const db = await getDb();
    const account = requested
      ? await db
          .prepare("SELECT id FROM accounts WHERE id = ? AND platform = 'youtube'")
          .bind(requested)
          .first<{ id: string }>()
      : await db
          .prepare("SELECT id FROM accounts WHERE platform = 'youtube' ORDER BY sort_order LIMIT 1")
          .first<{ id: string }>();

    if (!account) {
      return NextResponse.json({
        ok: false,
        message:
          "Belum ada akun YouTube terdaftar. Tambahkan akun di menu Integrations lalu hubungkan lewat Google.",
      });
    }

    const accessToken = await resolveGoogleAccessToken(account.id);
    const videos = await fetchYouTubeVideos(accessToken);

    return NextResponse.json({
      ok: true,
      accountId: account.id,
      fetchedAt: new Date().toISOString(),
      videos,
    });
  } catch (error) {
    // Kegagalan Google ditampilkan apa adanya: pesannya menentukan tindakan
    // pengguna (hubungkan ulang, periksa izin, tunggu kuota).
    if (error instanceof GoogleApiError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 502 });
    }
    return errorResponse(error);
  }
}
