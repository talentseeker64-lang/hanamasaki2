import { NextResponse } from "next/server";
import { type AccountRow, buildAccountId, readAccountInput, toAccount } from "@/lib/accounts";
import { errorResponse, readJsonBody, requireAdmin } from "@/lib/api";
import { getDb } from "@/lib/db";
import type { ChannelAccount } from "@/lib/types";

const SELECT_ACCOUNT = `SELECT id, platform, handle, display_name, followers, followers_start, connection, scopes, last_sync_at, limitation FROM accounts`;

/** Daftar akun yang dipantau. Tidak memuat rahasia kredensial. */
export async function GET() {
  try {
    const db = await getDb();
    const result = await db.prepare(`${SELECT_ACCOUNT} ORDER BY sort_order`).all<AccountRow>();
    return NextResponse.json({ accounts: (result.results ?? []).map(toAccount) });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Menambah akun baru.
 *
 * Metrik dimulai dari nol dan akan terisi saat sinkronisasi platform berjalan.
 * Kolom metrik sengaja tidak dapat diisi dari body permintaan.
 */
export async function POST(request: Request) {
  try {
    const denied = await requireAdmin(request);
    if (denied) return denied;

    const input = readAccountInput(await readJsonBody(request));
    const db = await getDb();
    const id = buildAccountId(input.platform, input.handle);

    const nextOrder = await db
      .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM accounts")
      .first<{ value: number }>();

    const result = await db
      .prepare(
        `INSERT INTO accounts (id, platform, handle, display_name, followers, followers_start, connection, scopes, last_sync_at, limitation, sort_order)
         VALUES (?, ?, ?, ?, 0, 0, ?, ?, NULL, ?, ?)
         ON CONFLICT (id) DO NOTHING`,
      )
      .bind(
        id,
        input.platform,
        input.handle,
        input.displayName,
        input.connection,
        JSON.stringify(input.scopes),
        input.limitation,
        nextOrder?.value ?? 0,
      )
      .run();

    if ((result.meta.changes ?? 0) === 0) {
      return NextResponse.json(
        { error: `Akun dengan id "${id}" sudah ada. Ubah handle atau sunting akun tersebut.` },
        { status: 409 },
      );
    }

    const account: ChannelAccount = {
      id,
      platform: input.platform,
      handle: input.handle,
      displayName: input.displayName,
      followers: 0,
      followersStart: 0,
      connection: input.connection,
      scopes: input.scopes,
      lastSyncAt: null,
      limitation: input.limitation,
    };
    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
