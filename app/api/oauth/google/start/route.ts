import { NextResponse } from "next/server";
import { errorResponse, readJsonBody, requireAdmin } from "@/lib/api";
import { getDb } from "@/lib/db";
import { setOAuthStateCookie } from "@/lib/oauth-state";
import { readString } from "@/lib/validation";
import {
  GOOGLE_STATE_COOKIE,
  GoogleApiError,
  buildGoogleAuthorizeUrl,
  getGoogleAppConfig,
  resolveGoogleRedirectUri,
} from "@/lib/youtube";

/**
 * Memulai alur otorisasi Google untuk akun YouTube.
 *
 * Memakai POST ber-header token (bukan redirect langsung) agar token admin tidak
 * pernah muncul di URL, riwayat peramban, atau log server. `state` disimpan pada
 * cookie httpOnly yang hanya dimiliki peramban admin.
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
    if (account.platform !== "youtube") {
      return NextResponse.json(
        { error: "Alur Google OAuth hanya untuk akun berplatform YouTube." },
        { status: 400 },
      );
    }

    const config = await getGoogleAppConfig();
    const redirectUri = await resolveGoogleRedirectUri(request);
    const state = crypto.randomUUID();

    const response = NextResponse.json({
      authorizeUrl: buildGoogleAuthorizeUrl(config, redirectUri, state),
      redirectUri,
    });
    setOAuthStateCookie(
      response,
      GOOGLE_STATE_COOKIE,
      { state, accountId },
      new URL(request.url).protocol === "https:",
    );
    return response;
  } catch (error) {
    if (error instanceof GoogleApiError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return errorResponse(error);
  }
}
