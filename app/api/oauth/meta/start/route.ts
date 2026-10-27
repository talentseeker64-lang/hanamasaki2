import { NextResponse } from "next/server";
import { errorResponse, readJsonBody, requireAdmin } from "@/lib/api";
import { getDb } from "@/lib/db";
import { setOAuthStateCookie } from "@/lib/oauth-state";
import {
  MetaApiError,
  META_STATE_COOKIE,
  buildAuthorizeUrl,
  getMetaAppConfig,
  resolveRedirectUri,
} from "@/lib/meta";
import { readString } from "@/lib/validation";

/**
 * Memulai alur otorisasi Meta untuk satu akun.
 *
 * Sengaja memakai POST ber-header token (bukan redirect langsung) agar token
 * admin tidak pernah muncul di URL, riwayat peramban, atau log server. Nilai
 * `state` disimpan pada cookie httpOnly yang hanya dimiliki peramban admin —
 * cookie itulah yang membuktikan balikan dari Meta sah.
 */
export async function POST(request: Request) {
  try {
    const denied = await requireAdmin(request);
    if (denied) return denied;

    const body = await readJsonBody(request);
    const accountId = readString(body, "accountId", 120);

    const db = await getDb();
    const account = await db
      .prepare("SELECT id, platform FROM accounts WHERE id = ?")
      .bind(accountId)
      .first<{ id: string; platform: string }>();
    if (!account) {
      return NextResponse.json({ error: `Akun "${accountId}" tidak ditemukan.` }, { status: 404 });
    }
    if (account.platform !== "instagram" && account.platform !== "facebook") {
      return NextResponse.json(
        {
          error:
            "OAuth Meta hanya tersedia untuk akun Instagram dan Facebook. " +
            "Akun YouTube memakai alur Google, sedangkan TikTok belum diimplementasikan.",
        },
        { status: 400 },
      );
    }

    const config = await getMetaAppConfig();
    const redirectUri = await resolveRedirectUri(request);
    const state = crypto.randomUUID();

    const response = NextResponse.json({
      authorizeUrl: buildAuthorizeUrl(config, redirectUri, state),
      redirectUri,
    });
    setOAuthStateCookie(
      response,
      META_STATE_COOKIE,
      { state, accountId },
      new URL(request.url).protocol === "https:",
    );
    return response;
  } catch (error) {
    if (error instanceof MetaApiError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return errorResponse(error);
  }
}
