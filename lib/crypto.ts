/**
 * Enkripsi rahasia kredensial OAuth dengan AES-256-GCM.
 *
 * Kunci berasal dari secret Worker `CREDENTIALS_KEY`: base64 dari 32 byte acak.
 * Format keluaran: base64(iv 12 byte || ciphertext || tag 16 byte). IV acak baru
 * dibuat setiap penyimpanan, sehingga menyimpan nilai yang sama dua kali tetap
 * menghasilkan ciphertext yang berbeda.
 */

const KEY_BYTES = 32;
const IV_BYTES = 12;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function importKey(base64Key: string): Promise<CryptoKey> {
  let keyBytes: Uint8Array<ArrayBuffer>;
  try {
    keyBytes = fromBase64(base64Key.trim());
  } catch {
    throw new Error("Secret CREDENTIALS_KEY bukan base64 yang valid.");
  }
  if (keyBytes.length !== KEY_BYTES) {
    throw new Error(
      `Secret CREDENTIALS_KEY harus 32 byte setelah didekode base64, bukan ${keyBytes.length} byte.`,
    );
  }
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Enkripsi nilai apa pun yang dapat diserialkan JSON menjadi satu string base64. */
export async function encryptJson(value: unknown, base64Key: string): Promise<string> {
  const key = await importKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  const combined = new Uint8Array(IV_BYTES + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), IV_BYTES);
  return toBase64(combined);
}

/** Kebalikan dari encryptJson. Dipakai oleh tugas sinkronisasi platform, bukan oleh HTTP. */
export async function decryptJson<T>(payload: string, base64Key: string): Promise<T> {
  const key = await importKey(base64Key);

  let combined: Uint8Array<ArrayBuffer>;
  try {
    combined = fromBase64(payload);
  } catch {
    throw new Error("Blob kredensial bukan base64 yang valid.");
  }
  if (combined.length <= IV_BYTES) {
    throw new Error("Blob kredensial terlalu pendek untuk memuat IV dan ciphertext.");
  }

  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: combined.subarray(0, IV_BYTES) },
      key,
      combined.subarray(IV_BYTES),
    );
  } catch {
    throw new Error(
      "Gagal mendekripsi kredensial. Kunci CREDENTIALS_KEY kemungkinan berubah sejak data disimpan.",
    );
  }
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

/** Perbandingan waktu-tetap, agar token tidak dapat ditebak lewat selisih waktu respons. */
export function timingSafeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}
