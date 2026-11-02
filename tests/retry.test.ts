/**
 * Unit test untuk `lib/retry.ts` (Phase 2 item 3).
 *
 * Aturan yang diuji adalah pembedaan antara kegagalan sementara dan permanen:
 * hanya kegagalan sementara yang boleh diulang. `sleep` selalu diganti tiruan
 * supaya pengujian tidak benar-benar menunggu jeda backoff.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { classifyFailure, withRetry } from "../lib/retry";

/* ------------------------------------------------------------------ */
/* Klasifikasi kegagalan                                               */
/* ------------------------------------------------------------------ */

test("classifyFailure menilai kegagalan jaringan fetch sebagai sementara", () => {
  assert.equal(classifyFailure(new TypeError("fetch failed")), "transient");
});

test("classifyFailure menilai 408, 425, 429, dan 5xx sebagai sementara", () => {
  for (const status of [408, 425, 429, 500, 502, 503]) {
    assert.equal(classifyFailure({ status }), "transient", `status ${status}`);
  }
});

test("classifyFailure menilai 4xx lain sebagai permanen", () => {
  for (const status of [400, 401, 403, 404, 422]) {
    assert.equal(classifyFailure({ status }), "permanent", `status ${status}`);
  }
});

test("classifyFailure mengenali kode soket yang layak diulang", () => {
  assert.equal(classifyFailure({ code: "ECONNRESET" }), "transient");
  assert.equal(classifyFailure({ code: "UND_ERR_SOCKET" }), "transient");
});

test("classifyFailure menganggap kegagalan tanpa penanda sebagai permanen", () => {
  assert.equal(classifyFailure(new Error("izin ditolak")), "permanent");
  assert.equal(classifyFailure(null), "permanent");
  assert.equal(classifyFailure("boom"), "permanent");
  assert.equal(classifyFailure({ code: "SOMETHING_ELSE" }), "permanent");
});

/* ------------------------------------------------------------------ */
/* Pengulangan                                                         */
/* ------------------------------------------------------------------ */

test("withRetry tidak menunggu bila percobaan pertama berhasil", async () => {
  const delays: number[] = [];
  let calls = 0;
  const value = await withRetry(
    async () => {
      calls += 1;
      return "ok";
    },
    { sleep: async (ms) => void delays.push(ms) },
  );

  assert.equal(value, "ok");
  assert.equal(calls, 1);
  assert.deepEqual(delays, []);
});

test("withRetry mengulang kegagalan sementara dengan jeda bertingkat", async () => {
  const delays: number[] = [];
  let calls = 0;
  const value = await withRetry(
    async () => {
      calls += 1;
      if (calls < 3) throw new TypeError("fetch failed");
      return calls;
    },
    { sleep: async (ms) => void delays.push(ms) },
  );

  assert.equal(value, 3);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [300, 600]);
});

test("withRetry tidak mengulang kegagalan permanen", async () => {
  const delays: number[] = [];
  let calls = 0;
  await assert.rejects(
    () =>
      withRetry(
        async () => {
          calls += 1;
          throw { status: 403 };
        },
        { sleep: async (ms) => void delays.push(ms) },
      ),
    (error: unknown) => (error as { status: number }).status === 403,
  );

  assert.equal(calls, 1, "permintaan yang ditolak izin tidak boleh diulang");
  assert.deepEqual(delays, []);
});

test("withRetry melempar kesalahan terakhir setelah percobaan habis", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withRetry(
        async () => {
          calls += 1;
          throw new TypeError(`gagal-${calls}`);
        },
        { attempts: 2, sleep: async () => {} },
      ),
    /gagal-2/,
  );

  assert.equal(calls, 2, "pesan asli kegagalan terakhir harus tetap terlihat");
});

test("withRetry membatasi jeda agar tidak tumbuh tanpa henti", async () => {
  const delays: number[] = [];
  let calls = 0;
  await assert.rejects(() =>
    withRetry(
      async () => {
        calls += 1;
        throw new TypeError("x");
      },
      { attempts: 4, baseDelayMs: 300, maxDelayMs: 500, sleep: async (ms) => void delays.push(ms) },
    ),
  );

  assert.equal(calls, 4);
  assert.deepEqual(delays, [300, 500, 500]);
});

test("withRetry menjalankan operasi sekali saja bila attempts diisi 1", async () => {
  let calls = 0;
  await assert.rejects(() =>
    withRetry(
      async () => {
        calls += 1;
        throw new TypeError("x");
      },
      { attempts: 1, sleep: async () => {} },
    ),
  );

  assert.equal(calls, 1);
});
