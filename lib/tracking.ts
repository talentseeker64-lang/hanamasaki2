/**
 * Penerimaan peristiwa pelacak website — Phase 4, item 1 (pelacakan website) dan
 * item 2 (atribusi UTM).
 *
 * Modul ini murni: seluruh fungsi hanya mengubah masukan menjadi bentuk yang
 * boleh disimpan, tanpa menyentuh D1. Dengan begitu kontrak penerimaan dapat
 * diuji tanpa runtime `workerd` yang tidak dapat berjalan di lingkungan ini.
 *
 * Aturan yang dijaga di sini, seluruhnya demi kejujuran angka:
 *
 * - Peristiwa yang jenisnya tidak dikenal **ditolak**, bukan ditebak menjadi
 *   `pageview`. Menebaknya akan menambah angka kunjungan yang tidak pernah
 *   terjadi.
 * - `value` hanya boleh menyertai peristiwa `order`. Nilai pada peristiwa lain
 *   tidak punya arti tunggal dan akan mengotori rata-rata nilai pesanan.
 * - `currency` wajib menyertai `value`. Menjumlahkan nilai lintas mata uang
 *   tanpa kode mata uang menghasilkan angka yang salah.
 * - Jam browser (`occurredAt`) disimpan apa adanya sebagai ISO UTC. Selisihnya
 *   dengan jam server adalah bukti, bukan gangguan — jadi tidak "diperbaiki".
 * - `id` (menjadi `source_ref`) wajib ada dan unik. Tanpa itu, pengiriman ulang
 *   peristiwa yang sama akan menambah baris kedua dan menaikkan angka.
 */
import type { SiteEvent, TrackingEventType, UtmParams } from "./types";
import {
  ValidationError,
  asRecord,
  readEnum,
  readOptionalString,
  readString,
} from "./validation";

/**
 * Jenis peristiwa yang dapat diterima.
 *
 * Daftarnya sengaja pendek dan masing-masing punya arti tunggal. Peristiwa yang
 * tidak dapat diukur langsung (mis. "minat") tidak disediakan: menyediakannya
 * hanya akan mendorong pengisian dengan tebakan.
 */
export const TRACK_EVENT_TYPES: readonly TrackingEventType[] = [
  "pageview",
  "product_view",
  "lead",
  "order",
];

/** Batas jumlah peristiwa dalam satu permintaan. */
export const TRACK_BATCH_LIMIT = 20;

/** Peristiwa yang sudah dinormalisasi dan siap ditulis ke `site_events`. */
export interface NormalizedTrackEvent {
  /** Kunci idempotensi dari pengirim; menjadi `site_events.source_ref`. */
  sourceRef: string;
  eventType: TrackingEventType;
  path: string;
  /** Jam browser, dinormalkan ke ISO UTC. */
  occurredAt: string;
  referrer: string | null;
  sessionId: string | null;
  utm: UtmParams;
  value: number | null;
  currency: string | null;
}

const EMPTY_UTM: UtmParams = {
  source: null,
  medium: null,
  campaign: null,
  content: null,
  term: null,
};

/** Waktu masuk harus dapat dibaca; selain itu ditolak, bukan diganti "sekarang". */
function normalizeOccurredAt(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    throw new ValidationError(
      'Kolom "occurredAt" harus berupa waktu yang valid, misalnya "2026-11-02T04:15:00.000Z".',
    );
  }
  return new Date(time).toISOString();
}

function readEventType(record: Record<string, unknown>): TrackingEventType {
  return readEnum(record, "type", TRACK_EVENT_TYPES);
}

/**
 * Nilai transaksi.
 *
 * `null` berarti peristiwanya bukan pesanan atau nilainya tidak dikirim — bukan
 * nol. Nilai yang dikirim pada peristiwa non-`order` ditolak karena tidak ada
 * cara jujur menafsirkannya.
 */
function readValue(
  record: Record<string, unknown>,
  eventType: TrackingEventType,
): number | null {
  const raw = record.value;
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    throw new ValidationError('Kolom "value" harus berupa angka.');
  }
  if (raw < 0) {
    throw new ValidationError('Kolom "value" tidak boleh bernilai negatif.');
  }
  if (eventType !== "order") {
    throw new ValidationError(
      `Kolom "value" hanya boleh dikirim pada peristiwa "order", bukan "${eventType}". ` +
        "Nilai pada peristiwa lain tidak punya arti tunggal dan akan mengotori rata-rata nilai pesanan.",
    );
  }
  return raw;
}

function readCurrency(record: Record<string, unknown>, value: number | null): string | null {
  const raw = readOptionalString(record, "currency", 3);
  if (value === null) {
    if (raw !== null) {
      throw new ValidationError(
        'Kolom "currency" hanya bermakna bersama "value" pada peristiwa "order".',
      );
    }
    return null;
  }
  if (raw === null) {
    throw new ValidationError(
      'Kolom "currency" wajib diisi bila "value" dikirim, supaya nominal lintas mata uang tidak dijumlahkan.',
    );
  }
  const code = raw.toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new ValidationError('Kolom "currency" harus berupa kode mata uang tiga huruf, mis. "IDR".');
  }
  return code;
}

/** Parameter kampanye; ketiadaannya dicatat sebagai `null`, bukan string kosong. */
function readUtm(record: Record<string, unknown>): UtmParams {
  const raw = record.utm;
  if (raw === undefined || raw === null) return { ...EMPTY_UTM };
  const utm = asRecord(raw);
  return {
    source: readOptionalString(utm, "source", 120),
    medium: readOptionalString(utm, "medium", 120),
    campaign: readOptionalString(utm, "campaign", 120),
    content: readOptionalString(utm, "content", 120),
    term: readOptionalString(utm, "term", 120),
  };
}

/** Mengubah satu peristiwa mentah menjadi bentuk yang boleh disimpan. */
export function parseTrackEvent(input: unknown): NormalizedTrackEvent {
  const record = asRecord(input);
  const sourceRef = readString(record, "id", 200);
  const eventType = readEventType(record);
  const path = readString(record, "path", 500);
  const occurredAt = normalizeOccurredAt(readString(record, "occurredAt", 40));
  const value = readValue(record, eventType);
  return {
    sourceRef,
    eventType,
    path,
    occurredAt,
    referrer: readOptionalString(record, "referrer", 500),
    sessionId: readOptionalString(record, "sessionId", 120),
    utm: readUtm(record),
    value,
    currency: readCurrency(record, value),
  };
}

/**
 * Mengurai seluruh isi permintaan pelacak.
 *
 * Seluruh peristiwa divalidasi lebih dulu; satu peristiwa yang tidak sah
 * membatalkan seluruh permintaan. Menyimpan sebagian akan membuat penerima
 * membalas "berhasil" untuk data yang sebenarnya ditolak.
 */
export function parseTrackBatch(body: unknown): NormalizedTrackEvent[] {
  const record = asRecord(body);
  const raw = record.events;
  if (!Array.isArray(raw)) {
    throw new ValidationError('Kolom "events" harus berupa daftar peristiwa.');
  }
  if (raw.length === 0) {
    throw new ValidationError('Kolom "events" tidak boleh kosong.');
  }
  if (raw.length > TRACK_BATCH_LIMIT) {
    throw new ValidationError(
      `Kolom "events" maksimal ${TRACK_BATCH_LIMIT} peristiwa per permintaan.`,
    );
  }

  const events = raw.map(parseTrackEvent);
  const seen = new Set<string>();
  for (const event of events) {
    if (seen.has(event.sourceRef)) {
      throw new ValidationError(
        `Nilai "id" ganda dalam satu permintaan: "${event.sourceRef}". Setiap peristiwa harus punya id unik.`,
      );
    }
    seen.add(event.sourceRef);
  }
  return events;
}

/** Label asal data untuk peristiwa pelacak; selalu data yang diukur sistem ini. */
export const TRACK_SOURCE_KIND = "first-party" as const;

/** Ringkasan cakupan pelacak, dipakai halaman penjualan untuk menyatakan batasnya. */
export interface TrackingCoverage {
  events: number;
  sessions: number;
  withUtm: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

/**
 * Cakupan peristiwa pelacak pada dataset.
 *
 * `withUtm` menghitung peristiwa yang punya minimal satu parameter kampanye —
 * sisanya tetap dicatat, tetapi tidak dapat dihubungkan ke kampanye mana pun.
 * Angka ini dipakai untuk menyatakan seberapa jauh atribusi UTM benar-benar
 * berlaku, bukan untuk menyembunyikan kunjungan yang tidak ber-UTM.
 */
export function trackingCoverage(events: SiteEvent[]): TrackingCoverage {
  const sessions = new Set<string>();
  let withUtm = 0;
  let firstSeen: string | null = null;
  let lastSeen: string | null = null;

  for (const event of events) {
    if (event.sessionId) sessions.add(event.sessionId);
    const { source, medium, campaign, content, term } = event.utm;
    if (source || medium || campaign || content || term) withUtm += 1;
    if (firstSeen === null || event.occurredAt < firstSeen) firstSeen = event.occurredAt;
    if (lastSeen === null || event.occurredAt > lastSeen) lastSeen = event.occurredAt;
  }

  return { events: events.length, sessions: sessions.size, withUtm, firstSeen, lastSeen };
}
