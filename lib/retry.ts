/**
 * Pengulangan panggilan jaringan dengan jeda bertingkat.
 *
 * Kegagalan sementara (jaringan terputus, HTTP 429, HTTP 5xx) tidak boleh
 * langsung menandai sumber sebagai `error`: satu permintaan gagal belum berarti
 * integrasinya rusak. Kegagalan permanen (izin dicabut, permintaan tidak sah)
 * sebaliknya tidak diulang — mengulanginya hanya membuang waktu dan kuota.
 */

export type FailureKind = "transient" | "permanent";

/**
 * Kode kegagalan jaringan yang layak dicoba ulang.
 *
 * `fetch` melempar `TypeError` tanpa kode saat koneksi gagal; kode ini muncul
 * dari lapisan socket di bawahnya dan dari runtime Workers.
 */
const TRANSIENT_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "EPIPE",
  "EAI_AGAIN",
  "ENOTFOUND",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
]);

/**
 * Menilai apakah sebuah kegagalan layak dicoba ulang.
 *
 * Bila tidak ada penanda yang dapat dipercaya, hasilnya `permanent` — lebih
 * aman menganggapnya permanen daripada mengulang kesalahan yang tidak akan
 * berubah hanya karena diulang.
 */
export function classifyFailure(error: unknown): FailureKind {
  // `fetch` melaporkan kegagalan jaringan sebagai TypeError tanpa status HTTP.
  if (error instanceof TypeError) return "transient";

  if (typeof error !== "object" || error === null) return "permanent";
  const record = error as { status?: unknown; code?: unknown };

  if (typeof record.status === "number") {
    const status = record.status;
    if (status === 408 || status === 425 || status === 429 || status >= 500) return "transient";
    return "permanent";
  }

  if (typeof record.code === "string" && TRANSIENT_CODES.has(record.code)) return "transient";

  return "permanent";
}

export interface RetryPolicy {
  /** Total percobaan, termasuk yang pertama. Minimal 1. */
  attempts?: number;
  /** Jeda dasar sebelum percobaan kedua, dalam milidetik. */
  baseDelayMs?: number;
  /** Batas jeda agar tidak tumbuh tanpa henti. */
  maxDelayMs?: number;
  /** Jeda yang dapat diganti saat pengujian supaya tidak benar-benar menunggu. */
  sleep?: (ms: number) => Promise<void>;
}

export const DEFAULT_ATTEMPTS = 3;
export const DEFAULT_BASE_DELAY_MS = 300;
export const DEFAULT_MAX_DELAY_MS = 2_000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Menjalankan `operation`, mengulanginya hanya bila kegagalannya sementara.
 *
 * Kesalahan terakhir selalu dilempar kembali sehingga pemanggil tetap melihat
 * pesan aslinya — bukan pesan generik "gagal setelah N percobaan".
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  policy: RetryPolicy = {},
): Promise<T> {
  const attempts = Math.max(1, policy.attempts ?? DEFAULT_ATTEMPTS);
  const baseDelay = Math.max(0, policy.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);
  const maxDelay = Math.max(baseDelay, policy.maxDelayMs ?? DEFAULT_MAX_DELAY_MS);
  const sleep = policy.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (classifyFailure(error) === "permanent" || attempt === attempts) throw error;
      await sleep(Math.min(maxDelay, baseDelay * 2 ** (attempt - 1)));
    }
  }

  // Tidak tercapai: loop selalu mengembalikan nilai atau melempar kesalahan.
  throw lastError;
}
