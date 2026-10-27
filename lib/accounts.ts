import type { ChannelAccount, ConnectionState, Platform, AccountInput } from "./types";
import {
  CONNECTION_STATES,
  PLATFORMS,
  readEnum,
  readOptionalString,
  readString,
  readStringArray,
} from "./validation";

/** Bentuk baris tabel `accounts` (snake_case). */
export interface AccountRow {
  id: string;
  platform: string;
  handle: string;
  display_name: string;
  followers: number;
  followers_start: number;
  connection: string;
  scopes: string;
  last_sync_at: string | null;
  limitation: string;
}

export function toAccount(row: AccountRow): ChannelAccount {
  return {
    id: row.id,
    platform: row.platform as Platform,
    handle: row.handle,
    displayName: row.display_name,
    followers: row.followers,
    followersStart: row.followers_start,
    connection: row.connection as ConnectionState,
    scopes: JSON.parse(row.scopes) as string[],
    lastSyncAt: row.last_sync_at,
    limitation: row.limitation,
  };
}

const PLATFORM_PREFIX: Record<Platform, string> = {
  instagram: "ig",
  tiktok: "tt",
  youtube: "yt",
  facebook: "fb",
};

/** Id akun yang dapat dibaca manusia, mis. `acc-ig-hanamasak-studio`. */
export function buildAccountId(platform: Platform, handle: string): string {
  const slug = handle
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `acc-${PLATFORM_PREFIX[platform]}-${slug || "akun"}`;
}

/**
 * Membaca masukan akun dari body JSON.
 *
 * Hanya identitas dan izin yang diterima. Metrik sengaja tidak dapat diisi
 * manual — angka itu harus berasal dari API platform.
 */
export function readAccountInput(body: Record<string, unknown>): AccountInput {
  return {
    platform: readEnum(body, "platform", PLATFORMS),
    handle: readString(body, "handle", 80),
    displayName: readString(body, "displayName", 120),
    connection: readEnum(body, "connection", CONNECTION_STATES),
    scopes: readStringArray(body, "scopes"),
    limitation: readOptionalString(body, "limitation", 400) ?? "",
  };
}
