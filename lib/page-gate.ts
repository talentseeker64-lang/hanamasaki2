/**
 * Gerbang autentikasi untuk halaman HTML — penutup temuan T-5.
 *
 * Sebelumnya hanya endpoint API yang dijaga (`requireAdmin`); halaman yang
 * merender dataset yang sama masih terbuka bagi siapa pun yang tahu URL-nya.
 * Gerbang ini dipasang di `worker.ts`, **sebelum** permintaan sampai ke Next.js.
 * Penempatan itu disengaja: bila dipasang di layout, payload RSC halaman tetap
 * dapat ikut terkirim karena layout dan halaman dirender terpisah.
 *
 * Batas yang perlu diketahui pembaca:
 *
 * - Ini **bukan** akun pengguna. Pintu masuknya tetap satu secret bersama
 *   (`ADMIN_TOKEN`), hanya saja ditukar dengan cookie sesi bertanda tangan
 *   sehingga token tidak disimpan di browser dan tidak ikut tiap permintaan.
 *   Multi-pengguna, peran, dan pencabutan per-orang membutuhkan autentikasi
 *   sungguhan.
 * - Cookie sesi berisi masa berlaku yang ditandatangani HMAC-SHA256 dengan
 *   `ADMIN_TOKEN` sebagai kunci. Mengganti `ADMIN_TOKEN` otomatis mencabut
 *   seluruh sesi yang ada.
 * - Tidak ada pembatasan laju percobaan masuk. Pakai `ADMIN_TOKEN` yang panjang
 *   dan acak.
 * - Gagal-tertutup: selama `ADMIN_TOKEN` belum diatur, halaman menjawab 503,
 *   bukan terbuka.
 * - Jalur `/api/*` tidak disentuh di sini; masing-masing sudah punya penjaga
 *   sendiri (`requireAdmin`, `requireTrackKey`, atau status OAuth), dan skrip
 *   pelacak di situs pemasang harus tetap dapat mengirim peristiwa.
 */
import { timingSafeEqual } from "./crypto";

export const SESSION_COOKIE = "pa_session";
export const LOGIN_PATH = "/login";
export const LOGOUT_PATH = "/logout";
/** Masa berlaku sesi: 7 hari. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

/** Nilai cookie: `<kedaluwarsa-detik>.<tanda-tangan-hex>`. */
export async function createSessionValue(secret: string, nowSeconds: number): Promise<string> {
  const expires = nowSeconds + SESSION_TTL_SECONDS;
  return `${expires}.${await sign(secret, `session:${expires}`)}`;
}

export async function verifySessionValue(
  value: string | null | undefined,
  secret: string,
  nowSeconds: number,
): Promise<boolean> {
  if (!value) return false;
  const dot = value.indexOf(".");
  if (dot <= 0) return false;
  const expiresText = value.slice(0, dot);
  if (!/^\d{1,12}$/.test(expiresText)) return false;
  const expires = Number(expiresText);
  if (expires <= nowSeconds) return false;
  const expected = await sign(secret, `session:${expires}`);
  return timingSafeEqual(value.slice(dot + 1), expected);
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

/**
 * Jalur yang tidak memerlukan sesi. Semuanya tidak memuat dataset:
 * API (punya penjaga sendiri), aset statis, skrip pelacak, dan halaman masuk.
 */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/track.js" ||
    pathname === "/favicon.ico" ||
    pathname === LOGIN_PATH ||
    pathname === LOGOUT_PATH
  );
}

/** Tujuan setelah masuk hanya boleh berupa jalur di situs ini — cegah open redirect. */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (raw === LOGIN_PATH || raw.startsWith(`${LOGIN_PATH}?`) || raw === LOGOUT_PATH) return "/";
  return raw;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function page(status: number, body: string, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
      ...extra,
    },
  });
}

function loginPage(next: string, error: string | null, status = 200): Response {
  const message = error ? `<p class="err">${escapeHtml(error)}</p>` : "";
  return page(
    status,
    `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Masuk — PeakAlpha</title>
<style>
body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;display:grid;place-items:center;min-height:100vh;margin:0}
form{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;width:min(360px,90vw)}
h1{font-size:18px;margin:0 0 6px}p{font-size:13px;color:#64748b;margin:0 0 16px;line-height:1.5}
input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px}
button{margin-top:14px;width:100%;padding:10px;border:0;border-radius:8px;background:#0f172a;color:#fff;font-size:14px;cursor:pointer}
.err{color:#b91c1c}
</style></head><body>
<form method="post" action="${LOGIN_PATH}">
<h1>Masuk ke PeakAlpha</h1>
<p>Dataset ini hanya dapat dibuka dengan token admin.</p>
${message}
<input type="hidden" name="next" value="${escapeHtml(next)}">
<input type="password" name="token" placeholder="Token admin" autocomplete="current-password" autofocus required>
<button type="submit">Masuk</button>
</form></body></html>`,
  );
}

function sessionCookie(value: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function redirect(location: string, extra: Record<string, string> = {}): Response {
  return new Response(null, {
    status: 303,
    headers: { location, "cache-control": "no-store", ...extra },
  });
}

/**
 * Terapkan gerbang pada satu permintaan.
 *
 * @returns respons yang harus dikirim (masuk, keluar, penolakan), atau `null`
 * bila permintaan boleh diteruskan ke aplikasi.
 */
export async function pageGate(
  request: Request,
  adminToken: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (isPublicPath(pathname) && pathname !== LOGIN_PATH && pathname !== LOGOUT_PATH) {
    return null;
  }

  if (!adminToken) {
    return page(
      503,
      "<!doctype html><meta charset=utf-8><title>Dinonaktifkan</title>" +
        "<p>Halaman dinonaktifkan: secret ADMIN_TOKEN belum diatur pada Worker. " +
        "Jalankan: npx wrangler secret put ADMIN_TOKEN</p>",
    );
  }

  if (pathname === LOGOUT_PATH) {
    if (request.method !== "POST") return redirect(LOGIN_PATH);
    return redirect(LOGIN_PATH, { "set-cookie": sessionCookie("", 0) });
  }

  if (pathname === LOGIN_PATH) {
    if (request.method === "POST") {
      let token = "";
      let next = "/";
      try {
        const form = await request.formData();
        token = String(form.get("token") ?? "");
        next = safeNextPath(String(form.get("next") ?? ""));
      } catch {
        return loginPage("/", "Permintaan tidak valid.", 400);
      }
      if (!token || !timingSafeEqual(token, adminToken)) {
        return loginPage(next, "Token admin tidak valid.", 401);
      }
      const value = await createSessionValue(adminToken, nowSeconds);
      return redirect(next, { "set-cookie": sessionCookie(value, SESSION_TTL_SECONDS) });
    }
    return loginPage(safeNextPath(url.searchParams.get("next")), null);
  }

  const cookie = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (await verifySessionValue(cookie, adminToken, nowSeconds)) return null;

  // Permintaan RSC/prefetch dari router klien: kode status, bukan pengalihan
  // HTML, supaya tidak ada halaman login yang tertukar dengan payload RSC.
  if (request.headers.has("rsc") || request.headers.has("next-router-prefetch")) {
    return new Response("Perlu masuk.", {
      status: 401,
      headers: { "cache-control": "no-store" },
    });
  }
  return redirect(`${LOGIN_PATH}?next=${encodeURIComponent(safeNextPath(pathname + url.search))}`);
}
