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

/**
 * Label status koneksi yang jujur untuk satu akun.
 *
 * `connection` hanyalah pilihan manual, dan `lastSyncAt` saja tidak cukup: alur
 * `recordFollowers` mengisinya walau metrik utama kanal belum pernah berhasil
 * diambil. Karena itu "Terhubung (terverifikasi)" hanya diberikan bila
 * `mainMetricsSynced` benar — yaitu saat baris metrik harian kanal ini benar-benar
 * berasal dari `platform-api`.
 */
export function connectionBadge(
  account: ChannelAccount,
  mainMetricsSynced: boolean,
): { label: string; className: string } {
  if (mainMetricsSynced) {
    return {
      label: "Terhubung (terverifikasi)",
      className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    };
  }
  if (account.connection === "connected") {
    return {
      label: "Terhubung (belum diverifikasi)",
      className: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    };
  }
  if (account.connection === "needs_review") {
    return {
      label: "Perlu ditinjau",
      className: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    };
  }
  return {
    label: "Belum terhubung",
    className: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  };
}

/** Interval Cron Trigger sinkronisasi di `wrangler.jsonc` (setiap 6 jam). */
export const SYNC_INTERVAL_HOURS = 6;

/**
 * Batas data dianggap kedaluwarsa: dua siklus cron tanpa sinkronisasi berhasil.
 *
 * Satu siklus yang terlewat masih ditoleransi (cron sempat gagal sesaat, atau
 * penjadwalan baru dipasang), tetapi dua kali berturut-turut berarti datanya
 * tidak lagi layak dibaca sebagai kondisi terkini.
 */
export const SYNC_STALE_AFTER_HOURS = SYNC_INTERVAL_HOURS * 2;

export type FreshnessState = "fresh" | "due" | "stale" | "never" | "unknown";

export interface SyncFreshness {
  state: FreshnessState;
  /** Label singkat untuk badge. */
  label: string;
  /** Keterangan tambahan, mis. "3 jam lalu"; kosong bila tidak berlaku. */
  detail: string;
  className: string;
  ageHours: number | null;
}

/**
 * Kesegaran data satu akun, diukur terhadap jadwal sinkronisasi.
 *
 * Dihitung dari `last_sync_at` dan interval Cron Trigger, bukan dari waktu
 * sekarang saja, supaya "segar" berarti "masih di dalam satu siklus jadwal".
 * Bila waktu tidak terbaca atau berada di masa depan, statusnya `unknown` —
 * lebih baik mengaku tidak tahu daripada menampilkan "segar" tanpa dasar.
 */
export function syncFreshness(
  lastSyncAt: string | null,
  now: Date = new Date(),
): SyncFreshness {
  const slate = "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
  if (!lastSyncAt) {
    return {
      state: "never",
      label: "Belum pernah disinkronkan",
      detail: "",
      className: slate,
      ageHours: null,
    };
  }

  const ageHours = (now.getTime() - Date.parse(lastSyncAt)) / 3_600_000;
  if (!Number.isFinite(ageHours) || ageHours < 0) {
    return {
      state: "unknown",
      label: "Waktu sinkronisasi tidak terbaca",
      detail: "",
      className: slate,
      ageHours: null,
    };
  }

  const detail = ageHours < 1 ? "baru saja" : `${Math.round(ageHours)} jam lalu`;
  if (ageHours <= SYNC_INTERVAL_HOURS) {
    return {
      state: "fresh",
      label: "Segar",
      detail,
      className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
      ageHours,
    };
  }
  if (ageHours <= SYNC_STALE_AFTER_HOURS) {
    return {
      state: "due",
      label: "Terlambat",
      detail,
      className: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
      ageHours,
    };
  }
  return {
    state: "stale",
    label: "Kedaluwarsa",
    detail,
    className: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
    ageHours,
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
