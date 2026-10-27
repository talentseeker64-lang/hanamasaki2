import { NextResponse } from "next/server";
import { errorResponse, readJsonBody, requireAdmin } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { readString } from "@/lib/validation";

/** Pengaturan organisasi, anggota tim, dan preferensi notifikasi. */
export async function GET() {
  try {
    return NextResponse.json(await getSettings());
  } catch (error) {
    return errorResponse(error);
  }
}

/** Memperbarui identitas organisasi. Body harus memuat seluruh kolom. */
export async function PATCH(request: Request) {
  try {
    const denied = await requireAdmin(request);
    if (denied) return denied;

    const body = await readJsonBody(request);
    const name = readString(body, "name", 120);
    const plan = readString(body, "plan", 80);
    const timezone = readString(body, "timezone", 60);
    const defaultPeriod = readString(body, "defaultPeriod", 60);

    const db = await getDb();
    const result = await db
      .prepare(
        "UPDATE organization SET name = ?, plan = ?, timezone = ?, default_period = ? WHERE id = 'current'",
      )
      .bind(name, plan, timezone, defaultPeriod)
      .run();

    if ((result.meta.changes ?? 0) === 0) {
      return NextResponse.json(
        { error: 'Baris organisasi dengan id "current" belum ada di D1.' },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
