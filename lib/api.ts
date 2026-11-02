import { NextResponse } from "next/server";
import { timingSafeEqual } from "./crypto";
import { getEnv } from "./db";
import { ValidationError, asRecord } from "./validation";

/** Nama header yang membawa token admin pada setiap permintaan tulis. */
export const ADMIN_TOKEN_HEADER = "x-admin-token";

/** Nama header yang membawa kunci pelacak website. */
export const TRACK_KEY_HEADER = "x-track-key";

/** Ubah pengecualian menjadi respons JSON tanpa membocorkan isi permintaan. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error(
    "[api] kegagalan tak terduga:",
    error instanceof Error ? `${error.name}: ${error.message}` : "penyebab tidak diketahui",
  );
  return NextResponse.json({ error: "Terjadi kesalahan pada server." }, { status: 500 });
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ValidationError("Body permintaan bukan JSON yang valid.");
  }
  return asRecord(body);
}

/**
 * Penjaga seluruh endpoint tulis.
 *
 * Worker ini dapat diakses publik tanpa autentikasi pengguna, sehingga setiap
 * operasi tulis wajib menyertakan token bersama pada header `x-admin-token`.
 *
 * Gagal-tertutup: selama secret `ADMIN_TOKEN` belum diatur, semua penulisan
 * ditolak dengan HTTP 503 — bukan dibiarkan terbuka.
 *
 * @returns respons penolakan, atau `null` bila permintaan boleh dilanjutkan.
 */
export async function requireAdmin(request: Request): Promise<NextResponse | null> {
  const env = await getEnv();
  const expected = env.ADMIN_TOKEN;
  if (!expected) {
    return NextResponse.json(
      {
        error:
          "Endpoint tulis dinonaktifkan: secret ADMIN_TOKEN belum diatur pada Worker. " +
          "Jalankan: npx wrangler secret put ADMIN_TOKEN",
      },
      { status: 503 },
    );
  }

  const provided = request.headers.get(ADMIN_TOKEN_HEADER);
  if (!provided || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: "Token admin tidak valid." }, { status: 401 });
  }
  return null;
}

/**
 * Penjaga endpoint penerima peristiwa pelacak website.
 *
 * Berbeda dari `requireAdmin`, penjagaan ini **bukan** autentikasi: kunci yang
 * dipakai ikut tertanam di skrip pelacak pada situs pemasang, sehingga siapa pun
 * yang membaca halaman itu dapat melihatnya. Fungsinya hanya menghalangi
 * pengiriman liar dari luar, bukan membuktikan identitas pengirim. Karena itu
 * kepercayaan tetap tidak diberikan pada isi peristiwa — pengulangan dibatasi
 * oleh kunci idempotensi, bukan oleh kunci ini.
 *
 * Gagal-tertutup: selama secret `TRACK_KEY` belum diatur, seluruh penerimaan
 * ditolak dengan HTTP 503 — bukan dibiarkan terbuka.
 */
export async function requireTrackKey(request: Request): Promise<NextResponse | null> {
  const env = await getEnv();
  const expected = env.TRACK_KEY;
  if (!expected) {
    return NextResponse.json(
      {
        error:
          "Endpoint pelacak dinonaktifkan: secret TRACK_KEY belum diatur pada Worker. " +
          "Jalankan: npx wrangler secret put TRACK_KEY",
      },
      { status: 503 },
    );
  }

  const provided = request.headers.get(TRACK_KEY_HEADER);
  if (!provided || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: "Kunci pelacak tidak valid." }, { status: 401 });
  }
  return null;
}
