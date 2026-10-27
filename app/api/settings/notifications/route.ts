import { NextResponse } from "next/server";
import { errorResponse, readJsonBody, requireAdmin } from "@/lib/api";
import { getDb } from "@/lib/db";
import { readBoolean, readString } from "@/lib/validation";

/** Menyalakan atau mematikan satu preferensi notifikasi. */
export async function PATCH(request: Request) {
  try {
    const denied = await requireAdmin(request);
    if (denied) return denied;

    const body = await readJsonBody(request);
    const id = readString(body, "id", 60);
    const enabled = readBoolean(body, "enabled");

    const db = await getDb();
    const result = await db
      .prepare("UPDATE notifications SET enabled = ? WHERE id = ?")
      .bind(enabled ? 1 : 0, id)
      .run();

    if ((result.meta.changes ?? 0) === 0) {
      return NextResponse.json(
        { error: `Preferensi notifikasi "${id}" tidak ditemukan.` },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, id, enabled });
  } catch (error) {
    return errorResponse(error);
  }
}
