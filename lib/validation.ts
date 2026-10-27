import type { ConnectionState, Platform, TeamRole } from "./types";

/**
 * Nilai yang diizinkan untuk kolom bertipe enum.
 *
 * D1 tidak punya tipe enum, jadi validasi nilai hanya bisa dilakukan di sini.
 * Daftar ini juga dipakai oleh UI agar pilihannya tidak pernah berbeda.
 */
export const PLATFORMS: Platform[] = ["instagram", "tiktok", "youtube", "facebook"];
export const CONNECTION_STATES: ConnectionState[] = ["connected", "needs_review", "not_connected"];
export const TEAM_ROLES: TeamRole[] = ["owner", "admin", "analyst", "content_manager", "agency"];

/** Kesalahan masukan yang aman ditampilkan ke klien (tidak memuat rahasia). */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ValidationError("Body JSON harus berupa objek.");
  }
  return body as Record<string, unknown>;
}

export function readString(
  record: Record<string, unknown>,
  field: string,
  maxLength = 500,
): string {
  const value = record[field];
  if (typeof value !== "string") {
    throw new ValidationError(`Kolom "${field}" harus berupa teks.`);
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new ValidationError(`Kolom "${field}" wajib diisi.`);
  }
  if (trimmed.length > maxLength) {
    throw new ValidationError(`Kolom "${field}" maksimal ${maxLength} karakter.`);
  }
  return trimmed;
}

export function readOptionalString(
  record: Record<string, unknown>,
  field: string,
  maxLength = 500,
): string | null {
  const value = record[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new ValidationError(`Kolom "${field}" harus berupa teks.`);
  }
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.length > maxLength) {
    throw new ValidationError(`Kolom "${field}" maksimal ${maxLength} karakter.`);
  }
  return trimmed;
}

export function readEnum<T extends string>(
  record: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
): T {
  const value = record[field];
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ValidationError(`Kolom "${field}" harus salah satu dari: ${allowed.join(", ")}.`);
  }
  return value as T;
}

export function readStringArray(
  record: Record<string, unknown>,
  field: string,
  { maxItems = 20, maxItemLength = 100 }: { maxItems?: number; maxItemLength?: number } = {},
): string[] {
  const value = record[field];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ValidationError(`Kolom "${field}" harus berupa daftar teks.`);
  }
  if (value.length > maxItems) {
    throw new ValidationError(`Kolom "${field}" maksimal ${maxItems} item.`);
  }
  return value.map((item) => {
    if (typeof item !== "string") {
      throw new ValidationError(`Setiap item pada "${field}" harus berupa teks.`);
    }
    const trimmed = item.trim();
    if (trimmed === "") {
      throw new ValidationError(`Item pada "${field}" tidak boleh kosong.`);
    }
    if (trimmed.length > maxItemLength) {
      throw new ValidationError(
        `Setiap item pada "${field}" maksimal ${maxItemLength} karakter.`,
      );
    }
    return trimmed;
  });
}

export function readBoolean(record: Record<string, unknown>, field: string): boolean {
  const value = record[field];
  if (typeof value !== "boolean") {
    throw new ValidationError(`Kolom "${field}" harus bernilai true atau false.`);
  }
  return value;
}

export function readEmail(record: Record<string, unknown>, field = "email"): string {
  const email = readString(record, field, 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError(`Kolom "${field}" bukan alamat email yang valid.`);
  }
  return email;
}
