import { NextResponse } from "next/server";
import { errorResponse, readJsonBody, requireAdmin } from "@/lib/api";
import { deleteCredentials, saveCredentials } from "@/lib/credentials";
import { getDb } from "@/lib/db";
import { ValidationError, readOptionalString, readString } from "@/lib/validation";

/**
 * Menyimpan kredensial OAuth satu akun.
 *
 * Rahasia ditulis ke D1 dalam bentuk terenkripsi AES-256-GCM dan tidak pernah
 * dikembalikan oleh endpoint mana pun — respons hanya berisi penanda keberhasilan.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireAdmin(request);
    if (denied) return denied;

    const { id } = await params;
    const body = await readJsonBody(request);

    const expiresAt = readOptionalString(body, "expiresAt", 40);
    if (expiresAt && Number.isNaN(Date.parse(expiresAt))) {
      throw new ValidationError('Kolom "expiresAt" harus berupa tanggal ISO 8601.');
    }

    const input = {
      clientId: readString(body, "clientId", 200),
      clientSecret: readString(body, "clientSecret", 500),
      accessToken: readString(body, "accessToken", 2000),
      refreshToken: readOptionalString(body, "refreshToken", 2000),
      expiresAt,
    };

    const db = await getDb();
    const account = await db
      .prepare("SELECT id FROM accounts WHERE id = ?")
      .bind(id)
      .first<{ id: string }>();
    if (!account) {
      return NextResponse.json({ error: `Akun "${id}" tidak ditemukan.` }, { status: 404 });
    }

    await saveCredentials(id, input);
    return NextResponse.json({ ok: true, accountId: id });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Menghapus kredensial satu akun tanpa menghapus akunnya. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireAdmin(request);
    if (denied) return denied;

    const { id } = await params;
    await deleteCredentials(id);
    return NextResponse.json({ ok: true, accountId: id });
  } catch (error) {
    return errorResponse(error);
  }
}
