import { NextResponse } from "next/server";
import { type AccountRow, buildAccountId, readAccountInput, toAccount } from "@/lib/accounts";
import { errorResponse, readJsonBody, requireAdmin } from "@/lib/api";
import { getDb } from "@/lib/db";
import { tenantScope } from "@/lib/integrations";
import { currentTenantId } from "@/lib/sync";
import type { ChannelAccount } from "@/lib/types";

const SELECT_ACCOUNT = `SELECT id, platform, handle, display_name, followers, followers_start, connection, scopes, last_sync_at, limitation FROM accounts`;

/**
 * Daftar akun yang dipantau. Tidak memuat rahasia kredensial.
 *
 * Akun milik organisasi lain tidak ikut terbaca; baris tanpa pemilik
 * (`tenant_id` NULL) tetap ditampilkan karena belum ada yang mengklaimnya.
 */
export async function GET() {
  try {
    const db = await getDb();
    const tenantId = await tenantScope(db);
    const where = tenantId ? " WHERE (tenant_id = ? OR tenant_id IS NULL)" : "";
    const statement = db.prepare(`${SELECT_ACCOUNT}${where} ORDER BY sort_order`);
    const result = tenantId
      ? await statement.bind(tenantId).all<AccountRow>()
      : await statement.all<AccountRow>();
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
 *
 * Provenance dan kepemilikan diisi eksplisit: akun ini dibuat lewat aplikasi
 * (bukan dari API platform), jadi `source_kind` diisi `import`, dan `tenant_id`
 * diambil dari organisasi aktif. Bila organisasi belum ada, penulisan digagalkan
 * lebih awal daripada membuat baris tanpa pemilik.
 */
export async function POST(request: Request) {
  try {
    const denied = await requireAdmin(request);
    if (denied) return denied;

    const input = readAccountInput(await readJsonBody(request));
    const db = await getDb();
    const tenantId = await currentTenantId(db);
    const id = buildAccountId(input.platform, input.handle);

    const nextOrder = await db
      .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM accounts")
      .first<{ value: number }>();

    const result = await db
      .prepare(
        `INSERT INTO accounts (id, platform, handle, display_name, followers, followers_start, connection, scopes, last_sync_at, limitation, sort_order, source_kind, tenant_id)
         VALUES (?, ?, ?, ?, 0, 0, ?, ?, NULL, ?, ?, 'import', ?)
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
        tenantId,
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
