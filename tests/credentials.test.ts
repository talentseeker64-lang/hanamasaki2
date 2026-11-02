/**
 * Unit test untuk validator kredensial (Phase 1.3 item 13).
 *
 * Memuat regresi temuan **T-7**: `getCredentialsKey` dulu hanya memeriksa
 * keberadaan secret, bukan panjangnya setelah didekode base64, sehingga kesalahan
 * konfigurasi baru ketahuan saat enkripsi dijalankan. Uji di sini memastikan
 * pesan kegagalannya spesifik dan gagal cepat.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { getCredentialsKey } from "../lib/credentials";
import { decryptJson, encryptJson, timingSafeEqual } from "../lib/crypto";
import { withCloudflareEnv } from "./fake-cloudflare";

const KEY_32 = Buffer.alloc(32, 7).toString("base64");
const KEY_16 = Buffer.alloc(16, 7).toString("base64");
const OTHER_KEY_32 = Buffer.alloc(32, 9).toString("base64");

test("encryptJson menolak kunci yang panjangnya salah setelah didekode base64 (T-7)", async () => {
  await assert.rejects(
    () => encryptJson({ token: "x" }, KEY_16),
    /harus 32 byte setelah didekode base64, bukan 16 byte/,
  );
});

test("encryptJson menolak nilai yang bukan base64", async () => {
  await assert.rejects(() => encryptJson({ token: "x" }, "%%%bukan-base64%%%"), /bukan base64 yang valid/);
});

test("encryptJson dan decryptJson bolak-balik dengan kunci 32 byte", async () => {
  const value = { accessToken: "rahasia", refreshToken: null, expiresAt: "2026-10-30T00:00:00Z" };
  const payload = await encryptJson(value, KEY_32);
  assert.deepEqual(await decryptJson(payload, KEY_32), value);
});

test("encryptJson memakai IV baru setiap penyimpanan", async () => {
  const first = await encryptJson({ token: "sama" }, KEY_32);
  const second = await encryptJson({ token: "sama" }, KEY_32);
  assert.notEqual(first, second);
});

test("decryptJson menolak payload yang tidak dapat didekripsi kunci saat ini", async () => {
  const payload = await encryptJson({ token: "rahasia" }, KEY_32);
  await assert.rejects(() => decryptJson(payload, OTHER_KEY_32), /Gagal mendekripsi kredensial/);
});

test("decryptJson menolak blob yang terlalu pendek untuk memuat IV", async () => {
  const pendek = Buffer.alloc(4).toString("base64");
  await assert.rejects(() => decryptJson(pendek, KEY_32), /terlalu pendek/);
});

test("decryptJson menolak blob yang bukan base64", async () => {
  await assert.rejects(() => decryptJson("%%%bukan-base64%%%", KEY_32), /bukan base64 yang valid/);
});

test("timingSafeEqual membandingkan string tanpa memedulikan panjangnya", () => {
  assert.equal(timingSafeEqual("token-rahasia", "token-rahasia"), true);
  assert.equal(timingSafeEqual("token-rahasia", "token-rahasib"), false);
  assert.equal(timingSafeEqual("abc", "abcd"), false);
  assert.equal(timingSafeEqual("", ""), true);
  assert.equal(timingSafeEqual("abc", ""), false);
});

test("getCredentialsKey gagal cepat bila secret belum diatur", async () => {
  await withCloudflareEnv({}, async () => {
    await assert.rejects(() => getCredentialsKey(), /CREDENTIALS_KEY/);
  });
});

test("getCredentialsKey mengembalikan secret yang diatur pada Worker", async () => {
  await withCloudflareEnv({ CREDENTIALS_KEY: KEY_32 }, async () => {
    assert.equal(await getCredentialsKey(), KEY_32);
  });
});
