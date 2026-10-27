/**
 * Helper sisi klien untuk seluruh operasi tulis.
 *
 * Worker ini tidak punya autentikasi pengguna, jadi setiap penulisan membawa
 * token bersama pada header `x-admin-token`. Token disimpan di localStorage
 * hanya demi kenyamanan; ini bukan pengganti autentikasi sungguhan.
 */

/** Kunci localStorage penyimpanan token admin. Dipakai juga oleh store React. */
export const ADMIN_TOKEN_STORAGE_KEY = "peakalpha.adminToken";

/** Nama header yang dibaca oleh requireAdmin di lib/api.ts. */
export const ADMIN_TOKEN_HEADER = "x-admin-token";

export function readAdminToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? "";
}

export function saveAdminToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
}

export type WriteOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Mengirim satu operasi tulis ke API.
 *
 * Semua kegagalan dikembalikan sebagai nilai, bukan dilempar, supaya pemanggil
 * dapat menampilkannya sebagai pesan di formulir tanpa try/catch berlapis.
 */
export async function sendWrite<T = unknown>(
  token: string,
  path: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
): Promise<WriteOutcome<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        "content-type": "application/json",
        [ADMIN_TOKEN_HEADER]: token,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: "Tidak dapat menghubungi server." };
  }

  const payload = (await response.json().catch(() => null)) as
    | (Record<string, unknown> & { error?: string })
    | null;

  if (!response.ok) {
    return {
      ok: false,
      error: payload?.error ?? `Permintaan gagal (HTTP ${response.status}).`,
    };
  }
  return { ok: true, data: payload as T };
}
