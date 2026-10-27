import { NextResponse } from "next/server";
import { readAccountInput } from "@/lib/accounts";
import { errorResponse, readJsonBody, requireAdmin } from "@/lib/api";
import { getDb } from "@/lib/db";

/**
 * Memperbarui identitas dan izin akun.
 *
 * Body harus memuat seluruh kolom yang dapat disunting, bukan sebagian: ini
 * mencegah nilai lama tertimpa tanpa sengaja oleh permintaan yang tidak lengkap.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireAdmin(request);
    if (denied) return denied;

    const { id } = await params;
    const input = readAccountInput(await readJsonBody(request));
    const db = await getDb();

    const result = await db
      .prepare(
        `UPDATE accounts
            SET platform = ?, handle = ?, display_name = ?, connection = ?, scopes = ?, limitation = ?
          WHERE id = ?`,
      )
      .bind(
        input.platform,
        input.handle,
        input.displayName,
        input.connection,
        JSON.stringify(input.scopes),
        input.limitation,
        id,
      )
      .run();

    if ((result.meta.changes ?? 0) === 0) {
      return NextResponse.json({ error: `Akun "${id}" tidak ditemukan.` }, { status: 404 });
    }
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Menghapus akun beserta kredensialnya dalam satu transaksi. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireAdmin(request);
    if (denied) return denied;

    const { id } = await params;
    const db = await getDb();

    const [, accountResult] = await db.batch([
      db.prepare("DELETE FROM account_credentials WHERE account_id = ?").bind(id),
      db.prepare("DELETE FROM accounts WHERE id = ?").bind(id),
    ]);

    if ((accountResult.meta.changes ?? 0) === 0) {
      return NextResponse.json({ error: `Akun "${id}" tidak ditemukan.` }, { status: 404 });
    }
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return errorResponse(error);
  }
}
