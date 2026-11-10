#!/usr/bin/env node
/**
 * Uji pemasangan pelacak pada Worker yang sudah di-deploy (A2).
 *
 * Pemakaian:
 *   TRACK_KEY=<kunci> node scripts/verify-tracker.mjs https://<worker>
 *
 * Yang diperiksa, berurutan:
 *   1. GET  /track.js   — skrip tersaji dari origin Worker.
 *   2. OPTIONS /api/track — preflight CORS dari domain lain diizinkan.
 *   3. POST /api/track  — satu peristiwa diterima (accepted = 1).
 *   4. POST ulang      — peristiwa yang sama tidak menambah baris (duplicates = 1).
 *   5. POST tanpa kunci — ditolak.
 *
 * Skrip ini membuktikan jalur HTTP. Bukti bahwa baris benar-benar ada di D1
 * tetap harus diperiksa dengan perintah yang dicetak di akhir.
 * Peristiwa uji memakai path `/__verify-tracker` agar mudah dibedakan.
 */
const origin = (process.argv[2] ?? "").replace(/\/+$/, "");
const key = process.env.TRACK_KEY;
if (!origin || !key) {
  console.error("Pemakaian: TRACK_KEY=<kunci> node scripts/verify-tracker.mjs https://<worker>");
  process.exit(2);
}

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "LULUS" : "GAGAL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed += 1;
}

const eventId = `verify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const payload = JSON.stringify({
  events: [
    {
      id: eventId,
      type: "pageview",
      path: "/__verify-tracker",
      occurredAt: new Date().toISOString(),
      referrer: null,
      sessionId: "verify-session",
      utm: { source: "verify", medium: "script", campaign: "a2" },
      value: null,
      currency: null,
    },
  ],
});
const post = (headers) =>
  fetch(`${origin}/api/track`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: payload,
  });

const script = await fetch(`${origin}/track.js`);
const scriptText = await script.text();
check("GET /track.js", script.ok && scriptText.includes("peakalpha"), `HTTP ${script.status}`);
check(
  "track.js menurunkan endpoint dari src",
  scriptText.includes("resolveEndpoint"),
  "versi lama memakai '/api/track' relatif dan mengirim ke domain pemasang",
);

const preflight = await fetch(`${origin}/api/track`, {
  method: "OPTIONS",
  headers: {
    origin: "https://situs-lain.example",
    "access-control-request-method": "POST",
    "access-control-request-headers": "content-type, x-track-key",
  },
});
check(
  "preflight CORS",
  preflight.status === 204 && preflight.headers.get("access-control-allow-origin") === "*",
  `HTTP ${preflight.status}`,
);

const first = await post({ "x-track-key": key });
const firstBody = await first.json().catch(() => ({}));
check("POST pertama diterima", first.ok && firstBody.accepted === 1, JSON.stringify(firstBody));

const second = await post({ "x-track-key": key });
const secondBody = await second.json().catch(() => ({}));
check("POST ulang tidak menambah baris", second.ok && secondBody.duplicates === 1, JSON.stringify(secondBody));

const denied = await post({});
check("POST tanpa kunci ditolak", denied.status === 401 || denied.status === 403, `HTTP ${denied.status}`);

console.log("\nBukti di basis data (jalankan sendiri):");
console.log(
  `  npx wrangler d1 execute karambit --remote --command "SELECT event_type, path, source_kind, received_at FROM site_events WHERE source_ref LIKE '%${eventId}%' OR path = '/__verify-tracker'"`,
);
console.log("Hapus baris uji setelahnya:");
console.log(`  npx wrangler d1 execute karambit --remote --command "DELETE FROM site_events WHERE path = '/__verify-tracker'"`);
process.exit(failed ? 1 : 0);
