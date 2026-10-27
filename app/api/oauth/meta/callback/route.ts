import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { saveCredentials } from "@/lib/credentials";
import { getDb } from "@/lib/db";
import { clearOAuthStateCookie, decodeOAuthState } from "@/lib/oauth-state";
import {
  MetaApiError,
  META_STATE_COOKIE,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchIdentity,
  fetchPageProfile,
  findFirstPage,
  findInstagramTarget,
  getMetaAppConfig,
  resolveRedirectUri,
} from "@/lib/meta";

/**
 * Balikan dari dialog OAuth Meta.
 *
 * Rute ini dipanggil peramban sebagai navigasi biasa, sehingga tidak dapat
 * membawa header `x-admin-token`. Otorisasinya berasal dari cookie httpOnly
 * yang dipasang `/api/oauth/meta/start` setelah token admin diverifikasi.
 *
 * Urutan yang dijalankan sengaja "bukti dulu, simpan kemudian": token ditukar,
 * lalu `/me` benar-benar dipanggil untuk membuktikan token hidup. Kredensial
 * hanya disimpan bila panggilan itu berhasil.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const deniedReason = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  const store = await cookies();
  const decoded = decodeOAuthState(store.get(META_STATE_COOKIE)?.value);

  if (deniedReason) {
    return redirectToIntegrations(request, { meta: "error", reason: deniedReason });
  }

  if (!decoded || !code || !state || decoded.state !== state) {
    return redirectToIntegrations(request, {
      meta: "error",
      reason: "State OAuth tidak cocok atau sudah kedaluwarsa. Ulangi proses hubungkan akun.",
    });
  }

  const accountId = decoded.accountId;

  try {
    const config = await getMetaAppConfig();
    const redirectUri = await resolveRedirectUri(request);

    const shortLived = await exchangeCodeForToken(config, redirectUri, code);
    const longLived = await exchangeForLongLivedToken(config, shortLived.accessToken);

    // Bukti pertama: token benar-benar berlaku.
    const identity = await fetchIdentity(longLived.accessToken);

    const db = await getDb();
    const account = await db
      .prepare("SELECT id, platform FROM accounts WHERE id = ?")
      .bind(accountId)
      .first<{ id: string; platform: string }>();
    if (!account) {
      return redirectToIntegrations(request, {
        meta: "error",
        reason: `Akun "${accountId}" sudah tidak ada.`,
      });
    }

    // Bukti kedua: sumber data yang diminta memang dapat dibaca token ini.
    let followers = 0;
    let verifiedAs = identity.name === "" ? identity.id : identity.name;

    if (account.platform === "instagram") {
      const target = await findInstagramTarget(longLived.accessToken);
      if (!target) {
        throw new MetaApiError(
          "Token valid, tetapi tidak ada akun Instagram Business yang tertaut ke halaman Facebook Anda. " +
            "Ubah akun Instagram menjadi Business/Creator dan tautkan ke sebuah Halaman, lalu ulangi.",
        );
      }
      followers = target.followers;
      verifiedAs = target.username === "" ? target.igUserId : `@${target.username}`;
    } else {
      const page = await findFirstPage(longLived.accessToken);
      if (!page) {
        throw new MetaApiError(
          "Token valid, tetapi tidak ada Halaman Facebook yang dapat diakses. Pastikan akun Anda mengelola minimal satu Halaman.",
        );
      }
      const profile = await fetchPageProfile(page.pageId, page.pageToken);
      followers = profile.followers;
      verifiedAs = profile.name === "" ? page.pageName : profile.name;
    }

    await saveCredentials(accountId, {
      clientId: config.appId,
      clientSecret: config.appSecret,
      accessToken: longLived.accessToken,
      refreshToken: null,
      expiresAt: longLived.expiresAt,
    });

    await db
      .prepare(
        `UPDATE accounts
            SET connection = 'connected', followers = ?, last_sync_at = ?
          WHERE id = ?`,
      )
      .bind(followers, new Date().toISOString(), accountId)
      .run();

    return redirectToIntegrations(request, { meta: "ok", account: accountId, as: verifiedAs });
  } catch (error) {
    const reason =
      error instanceof MetaApiError
        ? error.message
        : "Terjadi kesalahan tak terduga saat menukar token dengan Meta.";
    return redirectToIntegrations(request, { meta: "error", reason });
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
  clearOAuthStateCookie(response, META_STATE_COOKIE);
  return response;
}
