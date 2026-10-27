import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { saveCredentials } from "@/lib/credentials";
import { getDb } from "@/lib/db";
import { clearOAuthStateCookie, decodeOAuthState } from "@/lib/oauth-state";
import {
  GOOGLE_STATE_COOKIE,
  GoogleApiError,
  exchangeGoogleCode,
  fetchYouTubeChannel,
  getGoogleAppConfig,
  resolveGoogleRedirectUri,
} from "@/lib/youtube";

/**
 * Balikan dari dialog izin Google.
 *
 * Dipanggil peramban sebagai navigasi biasa, sehingga tidak dapat membawa header
 * `x-admin-token`. Otorisasinya berasal dari cookie httpOnly yang dipasang
 * `/api/oauth/google/start` setelah token admin diverifikasi.
 *
 * Urutannya "bukti dulu, simpan kemudian": token ditukar, lalu channel YouTube
 * benar-benar dibaca untuk membuktikan token hidup dan akun punya channel.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const deniedReason = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  const store = await cookies();
  const decoded = decodeOAuthState(store.get(GOOGLE_STATE_COOKIE)?.value);

  if (deniedReason) {
    return redirectToIntegrations(request, { google: "error", reason: deniedReason });
  }

  if (!decoded || !code || !state || decoded.state !== state) {
    return redirectToIntegrations(request, {
      google: "error",
      reason: "State OAuth tidak cocok atau sudah kedaluwarsa. Ulangi proses hubungkan akun.",
    });
  }

  const accountId = decoded.accountId;

  try {
    const config = await getGoogleAppConfig();
    const redirectUri = await resolveGoogleRedirectUri(request);

    const token = await exchangeGoogleCode(config, redirectUri, code);
    if (!token.refreshToken) {
      throw new GoogleApiError(
        "Google tidak mengirim refresh token. Cabut akses aplikasi ini di myaccount.google.com/permissions, lalu hubungkan ulang.",
      );
    }

    // Bukti: token benar-benar berlaku dan akun ini punya channel YouTube.
    const channel = await fetchYouTubeChannel(token.accessToken);

    const db = await getDb();
    const account = await db
      .prepare("SELECT id FROM accounts WHERE id = ?")
      .bind(accountId)
      .first<{ id: string }>();
    if (!account) {
      return redirectToIntegrations(request, {
        google: "error",
        reason: `Akun "${accountId}" sudah tidak ada.`,
      });
    }

    await saveCredentials(accountId, {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
    });

    await db
      .prepare(
        `UPDATE accounts
            SET connection = 'connected', followers = ?, last_sync_at = ?
          WHERE id = ?`,
      )
      .bind(channel.subscribers, new Date().toISOString(), accountId)
      .run();

    return redirectToIntegrations(request, {
      google: "ok",
      account: accountId,
      as: channel.title === "" ? channel.id : channel.title,
    });
  } catch (error) {
    const reason =
      error instanceof GoogleApiError
        ? error.message
        : "Terjadi kesalahan tak terduga saat menukar token dengan Google.";
    return redirectToIntegrations(request, { google: "error", reason });
  }
}

/**
 * Mengalihkan kembali ke halaman integrasi sambil menghapus cookie state.
 *
 * Cookie dihapus langsung pada respons, bukan lewat penyimpanan cookie global,
 * supaya perilakunya pasti meskipun respons ini dibuat manual.
 */
function redirectToIntegrations(request: Request, params: Record<string, string>): NextResponse {
  const target = new URL("/integrations", request.url);
  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value);
  }
  const response = NextResponse.redirect(target, 302);
  clearOAuthStateCookie(response, GOOGLE_STATE_COOKIE);
  return response;
}
