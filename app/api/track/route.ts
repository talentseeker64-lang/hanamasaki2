import { NextResponse } from "next/server";
import { TRACK_KEY_HEADER, errorResponse, readJsonBody, requireTrackKey } from "@/lib/api";
import { getDb } from "@/lib/db";
import { TRACK_SOURCE_KIND, parseTrackBatch } from "@/lib/tracking";

/**
 * Penerima peristiwa pelacak website — Phase 4, item 1.
 *
 * Endpoint ini **beda dari seluruh endpoint tulis lain** dan perbedaannya
 * disengaja: pemanggilnya adalah skrip yang berjalan di browser pengunjung situs
 * pemasang, bukan operator yang memegang `ADMIN_TOKEN`. Karena itu tidak ada
 * `requireAdmin` di sini. Kunci `TRACK_KEY` tetap diwajibkan, tetapi kedudukannya
 * hanya penghalang pengiriman liar — ia ikut tertanam di skrip dan dapat dibaca
 * siapa pun. Jangan memperlakukannya sebagai identitas pengirim.
 *
 * Karena isi peristiwa tidak dapat dipercaya, dua hal ditegakkan di sisi server:
 *
 * 1. **Idempotensi.** `source_ref` (dari `id` yang dikirim klien) punya indeks
 *    unik. Pengiriman ulang peristiwa yang sama — percobaan ulang setelah koneksi
 *    terputus, misalnya — tidak menambah baris kedua. Angka kunjungan tidak dapat
 *    dinaikkan hanya dengan mengulang permintaan.
 * 2. **Kepemilikan data.** `tenant_id` diambil dari tabel `organization`. Bila
 *    organisasi belum ada, penulisan **ditolak** (HTTP 503) alih-alih menyimpan
 *    baris tanpa pemilik.
 *
 * `occurred_at` (jam browser) dan `received_at` (jam server) disimpan terpisah
 * supaya selisihnya dapat diperiksa. Nilai `source_kind` selalu `first-party`:
 * peristiwa ini diukur sistem kita sendiri, bukan diambil dari API platform.
 */

/** CORS: skrip pelacak berjalan di domain situs pemasang, bukan di domain ini. */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": `content-type, ${TRACK_KEY_HEADER}`,
  "Access-Control-Max-Age": "86400",
};

function withCors(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

/** Preflight dari browser. Tidak membaca basis data. */
export async function OPTIONS(): Promise<NextResponse> {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const denied = await requireTrackKey(request);
    if (denied) return withCors(denied);

    const body = await readJsonBody(request);
    const events = parseTrackBatch(body);

    const db = await getDb();
    const tenant = await db
      .prepare("SELECT id FROM organization ORDER BY id LIMIT 1")
      .first<{ id: string }>();
    if (!tenant?.id) {
      // Gagal-tertutup: tanpa pemilik, baris tidak ditulis sama sekali.
      return withCors(
        NextResponse.json(
          {
            error:
              "Data pelacak tidak dapat disimpan: pemilik data (tenant) belum ada. " +
              "Jalankan migrasi dan seed D1 terlebih dahulu.",
          },
          { status: 503 },
        ),
      );
    }

    const receivedAt = new Date().toISOString();
    const statements = events.map((event) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO site_events
             (id, tenant_id, occurred_at, received_at, event_type, path, referrer, session_id,
              utm_source, utm_medium, utm_campaign, utm_content, utm_term,
              value, currency, source_kind, source_ref)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          tenant.id,
          event.occurredAt,
          receivedAt,
          event.eventType,
          event.path,
          event.referrer,
          event.sessionId,
          event.utm.source,
          event.utm.medium,
          event.utm.campaign,
          event.utm.content,
          event.utm.term,
          event.value,
          event.currency,
          TRACK_SOURCE_KIND,
          event.sourceRef,
        ),
    );

    const results = await db.batch(statements);
    const accepted = results.reduce((total, result) => total + (result.meta.changes ?? 0), 0);

    return withCors(
      NextResponse.json({
        received: events.length,
        accepted,
        // Selisihnya adalah peristiwa yang sudah pernah diterima, bukan kegagalan.
        duplicates: events.length - accepted,
      }),
    );
  } catch (error) {
    return withCors(errorResponse(error));
  }
}
