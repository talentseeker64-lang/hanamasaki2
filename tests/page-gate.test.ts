/**
 * Unit test untuk `lib/page-gate.ts` (A4 — penutup temuan T-5).
 *
 * Gerbang ini fungsi murni atas `Request`, jadi diuji tanpa D1 maupun `workerd`.
 * Yang dikunci: halaman tanpa sesi tidak pernah diteruskan ke aplikasi, API dan
 * skrip pelacak tetap lewat, dan sesi tidak dapat dipalsukan atau diperpanjang.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionValue,
  isPublicPath,
  pageGate,
  safeNextPath,
  verifySessionValue,
} from "../lib/page-gate";

const TOKEN = "token-rahasia-panjang-untuk-uji";
const NOW = 1_800_000_000;
const ORIGIN = "https://worker.example.dev";

function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, { headers });
}

async function loginRequest(token: string, next = "/sales"): Promise<Request> {
  return new Request(`${ORIGIN}/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token, next }).toString(),
  });
}

test("halaman tanpa sesi dialihkan ke /login dan tidak diteruskan", async () => {
  const response = await pageGate(get("/sales?range=7"), TOKEN, NOW);
  assert.ok(response);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/login?next=%2Fsales%3Frange%3D7");
});

test("permintaan RSC tanpa sesi mendapat 401, bukan HTML login", async () => {
  const response = await pageGate(get("/sales?_rsc=x", { rsc: "1" }), TOKEN, NOW);
  assert.equal(response?.status, 401);
});

test("tanpa ADMIN_TOKEN, halaman gagal-tertutup dengan 503", async () => {
  const response = await pageGate(get("/"), undefined, NOW);
  assert.equal(response?.status, 503);
  const login = await pageGate(get("/login"), undefined, NOW);
  assert.equal(login?.status, 503);
});

test("API, aset, dan skrip pelacak diteruskan tanpa sesi", async () => {
  for (const path of ["/api/track", "/api/overview", "/api/oauth/meta/callback", "/_next/static/a.js", "/track.js", "/favicon.ico"]) {
    assert.equal(await pageGate(get(path), TOKEN, NOW), null, path);
  }
  assert.equal(isPublicPath("/apix"), false);
  assert.equal(isPublicPath("/sales"), false);
});

test("token benar menghasilkan cookie sesi HttpOnly dan alihan ke tujuan", async () => {
  const response = await pageGate(await loginRequest(TOKEN), TOKEN, NOW);
  assert.equal(response?.status, 303);
  assert.equal(response.headers.get("location"), "/sales");
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);

  const value = cookie.split(";")[0].slice(`${SESSION_COOKIE}=`.length);
  const passed = await pageGate(get("/sales", { cookie: `${SESSION_COOKIE}=${value}` }), TOKEN, NOW + 60);
  assert.equal(passed, null);
});

test("token salah ditolak 401 tanpa cookie", async () => {
  const response = await pageGate(await loginRequest("salah"), TOKEN, NOW);
  assert.equal(response?.status, 401);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("sesi kedaluwarsa, dipalsukan, atau dari token lain ditolak", async () => {
  const value = await createSessionValue(TOKEN, NOW);
  assert.equal(await verifySessionValue(value, TOKEN, NOW + 1), true);
  assert.equal(await verifySessionValue(value, TOKEN, NOW + SESSION_TTL_SECONDS), false);
  assert.equal(await verifySessionValue(value, "token-lain", NOW + 1), false);

  // Memperpanjang masa berlaku tanpa tanda tangan baru harus gagal.
  const [, signature] = value.split(".");
  assert.equal(await verifySessionValue(`${NOW + 10 * SESSION_TTL_SECONDS}.${signature}`, TOKEN, NOW + 1), false);
  assert.equal(await verifySessionValue("sampah", TOKEN, NOW), false);
  assert.equal(await verifySessionValue(null, TOKEN, NOW), false);
});

test("mengganti ADMIN_TOKEN mencabut sesi yang sudah terbit", async () => {
  const value = await createSessionValue(TOKEN, NOW);
  const response = await pageGate(get("/", { cookie: `${SESSION_COOKIE}=${value}` }), "token-baru", NOW + 1);
  assert.equal(response?.status, 303);
});

test("safeNextPath menolak open redirect", () => {
  assert.equal(safeNextPath("https://jahat.example"), "/");
  assert.equal(safeNextPath("//jahat.example"), "/");
  assert.equal(safeNextPath("/\\jahat.example"), "/");
  assert.equal(safeNextPath("/login"), "/");
  assert.equal(safeNextPath("/sales?x=1"), "/sales?x=1");
  assert.equal(safeNextPath(null), "/");
});

test("keluar menghapus cookie", async () => {
  const response = await pageGate(new Request(`${ORIGIN}/logout`, { method: "POST" }), TOKEN, NOW);
  assert.equal(response?.status, 303);
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);
});
