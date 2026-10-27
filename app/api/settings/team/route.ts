import { NextResponse } from "next/server";
import { errorResponse, readJsonBody, requireAdmin } from "@/lib/api";
import { getDb } from "@/lib/db";
import { TEAM_ROLES, ValidationError, readEmail, readEnum, readString } from "@/lib/validation";

/** Menambah anggota tim baru. Email bersifat unik dan dipakai sebagai kunci. */
export async function POST(request: Request) {
  try {
    const denied = await requireAdmin(request);
    if (denied) return denied;

    const body = await readJsonBody(request);
    const email = readEmail(body);
    const name = readString(body, "name", 120);
    const role = readEnum(body, "role", TEAM_ROLES);
    const scope = readString(body, "scope", 200);

    const db = await getDb();
    const nextOrder = await db
      .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM team_members")
      .first<{ value: number }>();

    const result = await db
      .prepare(
        `INSERT INTO team_members (email, name, role, scope, sort_order)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (email) DO NOTHING`,
      )
      .bind(email, name, role, scope, nextOrder?.value ?? 0)
      .run();

    if ((result.meta.changes ?? 0) === 0) {
      return NextResponse.json(
        { error: `Anggota dengan email "${email}" sudah ada.` },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, email }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Memperbarui nama, peran, dan cakupan akses. Email tidak dapat diubah. */
export async function PATCH(request: Request) {
  try {
    const denied = await requireAdmin(request);
    if (denied) return denied;

    const body = await readJsonBody(request);
    const email = readEmail(body);
    const name = readString(body, "name", 120);
    const role = readEnum(body, "role", TEAM_ROLES);
    const scope = readString(body, "scope", 200);

    const db = await getDb();
    const result = await db
      .prepare("UPDATE team_members SET name = ?, role = ?, scope = ? WHERE email = ?")
      .bind(name, role, scope, email)
      .run();

    if ((result.meta.changes ?? 0) === 0) {
      return NextResponse.json(
        { error: `Anggota dengan email "${email}" tidak ditemukan.` },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, email });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Menghapus anggota tim. Email dikirim sebagai parameter kueri. */
export async function DELETE(request: Request) {
  try {
    const denied = await requireAdmin(request);
    if (denied) return denied;

    const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase();
    if (!email) {
      throw new ValidationError('Parameter kueri "email" wajib diisi.');
    }

    const db = await getDb();
    const result = await db.prepare("DELETE FROM team_members WHERE email = ?").bind(email).run();

    if ((result.meta.changes ?? 0) === 0) {
      return NextResponse.json(
        { error: `Anggota dengan email "${email}" tidak ditemukan.` },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, email });
  } catch (error) {
    return errorResponse(error);
  }
}
