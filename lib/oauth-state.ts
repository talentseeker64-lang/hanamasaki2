import type { NextResponse } from "next/server";

/**
 * Penanganan `state` OAuth yang dipakai bersama semua penyedia.
 *
 * Nilai `state` disimpan pada cookie httpOnly yang hanya dimiliki peramban
 * admin — cookie inilah bukti bahwa balikan dari penyedia memang berasal dari
 * permintaan yang kita mulai, bukan dari tautan yang dibuat orang lain.
 */

export interface OAuthState {
  state: string;
  accountId: string;
}

/** Cukup untuk menyelesaikan dialog izin tanpa membiarkan cookie menggantung. */
export const OAUTH_STATE_TTL_SECONDS = 600;

export function encodeOAuthState(payload: OAuthState): string {
  return JSON.stringify(payload);
}

export function decodeOAuthState(raw: string | undefined): OAuthState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.state !== "string" || typeof parsed.accountId !== "string") return null;
    return { state: parsed.state, accountId: parsed.accountId };
  } catch {
    return null;
  }
}

export function setOAuthStateCookie(
  response: NextResponse,
  cookieName: string,
  payload: OAuthState,
  secure: boolean,
): void {
  response.cookies.set(cookieName, encodeOAuthState(payload), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_STATE_TTL_SECONDS,
    secure,
  });
}

export function clearOAuthStateCookie(response: NextResponse, cookieName: string): void {
  response.cookies.delete(cookieName);
}
