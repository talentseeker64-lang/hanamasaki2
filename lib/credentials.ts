import { connection } from "next/server";
import { decryptJson, encryptJson } from "./crypto";
import { getDb, getEnv } from "./db";
import type { CredentialSummary } from "./types";

/** Rahasia satu akun. Tidak pernah dikembalikan lewat respons HTTP. */
export interface CredentialInput {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}

interface CredentialRow {
  account_id: string;
  client_id: string;
  updated_at: string;
}

/** Kunci enkripsi dari secret Worker. Gagal cepat bila belum diatur. */
export async function getCredentialsKey(): Promise<string> {
  const env = await getEnv();
  const key = env.CREDENTIALS_KEY;
  if (!key) {
    throw new Error(
      'Secret "CREDENTIALS_KEY" belum diatur pada Worker. ' +
        "Jalankan: npx wrangler secret put CREDENTIALS_KEY",
    );
  }
  return key;
}

/** Daftar kredensial tanpa rahasia, untuk ditampilkan di halaman integrasi. */
export async function listCredentialSummaries(): Promise<CredentialSummary[]> {
  await connection();
  const db = await getDb();
  const result = await db
    .prepare("SELECT account_id, client_id, updated_at FROM account_credentials ORDER BY account_id")
    .all<CredentialRow>();

  return (result.results ?? []).map((row) => ({
    accountId: row.account_id,
    clientId: row.client_id,
    updatedAt: row.updated_at,
  }));
}

/** Menyimpan (atau mengganti) kredensial satu akun dalam bentuk terenkripsi. */
export async function saveCredentials(
  accountId: string,
  input: CredentialInput,
): Promise<void> {
  const key = await getCredentialsKey();
  const db = await getDb();

  const secrets = await encryptJson(
    {
      clientSecret: input.clientSecret,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      expiresAt: input.expiresAt,
    },
    key,
  );

  await db
    .prepare(
      `INSERT INTO account_credentials (account_id, client_id, secrets, key_version, updated_at)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT (account_id) DO UPDATE SET
         client_id = excluded.client_id,
         secrets = excluded.secrets,
         key_version = excluded.key_version,
         updated_at = excluded.updated_at`,
    )
    .bind(accountId, input.clientId, secrets, new Date().toISOString())
    .run();
}

export async function deleteCredentials(accountId: string): Promise<void> {
  const db = await getDb();
  await db.prepare("DELETE FROM account_credentials WHERE account_id = ?").bind(accountId).run();
}

/**
 * Membaca lalu mendekripsi kredensial satu akun.
 *
 * Hanya untuk tugas sinkronisasi platform (Tahap 2). Jangan pernah
 * mengembalikan hasilnya lewat respons HTTP.
 */
export async function readCredentials(accountId: string): Promise<CredentialInput | null> {
  const key = await getCredentialsKey();
  const db = await getDb();

  const row = await db
    .prepare("SELECT client_id, secrets FROM account_credentials WHERE account_id = ?")
    .bind(accountId)
    .first<{ client_id: string; secrets: string }>();
  if (!row) return null;

  const payload = await decryptJson<{
    clientSecret: string;
    accessToken: string;
    refreshToken: string | null;
    expiresAt: string | null;
  }>(row.secrets, key);

  return {
    clientId: row.client_id,
    clientSecret: payload.clientSecret,
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    expiresAt: payload.expiresAt,
  };
}
