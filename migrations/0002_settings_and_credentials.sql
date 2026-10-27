-- Pengaturan organisasi, anggota tim, preferensi notifikasi, dan kredensial OAuth.
-- Jalankan dengan: npx wrangler d1 migrations apply karambit --remote

CREATE TABLE organization (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT NOT NULL,
  timezone TEXT NOT NULL,
  default_period TEXT NOT NULL
);

CREATE TABLE team_members (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- owner | admin | analyst | content_manager | agency
  role TEXT NOT NULL,
  scope TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  detail TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  sort_order INTEGER NOT NULL
);

-- Kredensial OAuth per akun.
--
-- Rahasia TIDAK pernah disimpan sebagai teks biasa: kolom `secrets` berisi
-- base64(iv 12 byte || ciphertext) hasil AES-256-GCM dengan kunci dari secret
-- Worker `CREDENTIALS_KEY`. Lihat lib/crypto.ts.
--
-- Tanpa FOREIGN KEY ke `accounts` dengan sengaja: seed dataset tidak menyentuh
-- tabel ini agar kredensial tidak hilang saat dataset di-reset, sedangkan
-- penghapusan akun lewat API sudah membersihkan barisnya secara eksplisit.
CREATE TABLE account_credentials (
  account_id TEXT PRIMARY KEY,
  -- Client ID platform. Bukan rahasia, sehingga aman dibaca apa adanya.
  client_id TEXT NOT NULL,
  -- JSON terenkripsi: clientSecret, accessToken, refreshToken, expiresAt.
  secrets TEXT NOT NULL,
  -- Versi kunci, untuk rotasi kunci di masa depan.
  key_version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
