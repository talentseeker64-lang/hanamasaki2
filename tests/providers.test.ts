/**
 * Unit test untuk `lib/providers.ts` (Phase 2 item 4).
 *
 * Yang diuji hanya pemetaan platform ke penyedia: kontrak `MarketingDataProvider`
 * sengaja tidak diuji lewat objek tiruan, karena implementasinya hidup di
 * `lib/sync.ts` dan diuji di sana.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { providerNameOf } from "../lib/providers";

test("providerNameOf memetakan kanal Meta ke penyedia meta", () => {
  assert.equal(providerNameOf("instagram"), "meta");
  assert.equal(providerNameOf("facebook"), "meta");
});

test("providerNameOf memetakan YouTube ke penyedia google", () => {
  assert.equal(providerNameOf("youtube"), "google");
});

test("providerNameOf mengembalikan null untuk platform yang belum punya penyedia", () => {
  assert.equal(providerNameOf("tiktok"), null);
});
