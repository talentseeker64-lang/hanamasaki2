import type { DataSourceKind, Platform } from "./types";

/**
 * Kontrak penyedia data pemasaran.
 *
 * Setiap sumber (sosial, website, UTM, …) diakses lewat antarmuka yang sama,
 * sehingga mesin analisis tidak perlu berubah setiap kali ada integrasi baru.
 *
 * Berbeda dari usulan awal pada brief, tidak ada `connect()`: alur izin tetap
 * ditangani rute `app/api/oauth/.../start` dan `.../callback`. Provider yang
 * mengurus izinnya sendiri akan menduplikasi penanganan `state`, cookie, dan
 * enkripsi.
 */

/** Rentang tanggal yang diminta saat sinkronisasi. */
export interface SyncRange {
  start: string;
  end: string;
}

/**
 * Hasil satu eksekusi sinkronisasi.
 *
 * `written` ditambahkan supaya hasilnya dapat diperiksa — bukan hanya
 * dilaporkan berhasil/gagal. `sourceKind` menegaskan bahwa angka yang ditulis
 * berasal dari API, bukan dari generator ilustratif.
 */
export interface ProviderSyncResult {
  sourceKind: DataSourceKind;
  status: "ok" | "skipped" | "error";
  message: string;
  /** Jumlah baris metrik yang benar-benar tertulis. */
  written: number;
}

export interface MarketingDataProvider {
  readonly platform: Platform;
  readonly sourceKind: DataSourceKind;
  /** Memeriksa apakah kredensial masih sah, tanpa menulis data. */
  validateConnection(): Promise<boolean>;
  syncMetrics(range: SyncRange): Promise<ProviderSyncResult>;
  /** Melepas kredensial tersimpan agar sinkronisasi tidak lagi berjalan. */
  disconnect(): Promise<void>;
}

/**
 * Kelompok penyedia yang sudah diimplementasikan, dipakai alur sinkronisasi
 * untuk menentukan penyedia mana yang menangani sebuah platform.
 */
export function providerNameOf(platform: Platform): "meta" | "google" | null {
  if (platform === "instagram" || platform === "facebook") return "meta";
  if (platform === "youtube") return "google";
  return null;
}
