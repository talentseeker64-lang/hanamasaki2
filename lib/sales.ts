/**
 * Corong penjualan dan atribusi UTM — Phase 4, item 6 (dan dasar item 7).
 *
 * Modul ini murni: menerima `Dataset`, mengembalikan angka. Tidak ada akses D1 —
 * sama seperti `lib/metrics.ts` dan `lib/fyp.ts`, sehingga dapat diuji tanpa
 * runtime `workerd`.
 *
 * Prinsip yang mengikat seluruh isi berkas ini:
 *
 * - **Setiap angka menyebut sumbernya.** Tahap yang terukur membawa
 *   `provenance`; tahap yang belum terhubung membawa `null` dan sebuah alasan
 *   yang dapat diperiksa. Tidak ada jalan bagi sebuah angka untuk muncul tanpa
 *   asal yang jelas.
 * - **Belum terhubung bukan nol.** Tahap yang belum punya sumber data
 *   berstatus `not_connected` dengan `value: null` — bukan `0`. Mengisi nol akan
 *   membuat corong tampak "kosong" padahal artinya "tidak diketahui".
 * - **Transaksi bukan berasal dari browser.** Pelacak website boleh mengirim
 *   peristiwa `lead` dan `order`, dan peristiwa itu benar-benar tersimpan sebagai
 *   bukti. Tetapi ia **tidak** dipakai sebagai catatan transaksi maupun
 *   pendapatan: catatan itu harus berasal dari sistem e-commerce
 *   (Phase 4 item 4 dan 5) yang belum terhubung. Karena itu tahap `orders` dan
 *   `revenue` tetap `not_connected` walau peristiwa itu ada — jumlahnya
 *   dilaporkan terpisah sebagai sinyal, bukan sebagai penjualan.
 * - **Tidak ada pengganti ilustratif.** `web_daily.conversions` dari seed sengaja
 *   tidak dipakai sebagai taksiran pesanan, sesuai larangan di roadmap.
 */
import { platformAggregates, safeDiv, socialProvenance, sum } from "./metrics";
import type { DataProvenance, Dataset, SiteEvent, TrackingEventType } from "./types";

export type FunnelStageState = "measured" | "not_connected" | "unavailable";

export const FUNNEL_STATE_LABEL: Record<FunnelStageState, string> = {
  measured: "Terukur",
  not_connected: "Belum terhubung",
  unavailable: "Tidak tersedia",
};

export interface SalesFunnelStage {
  key: string;
  label: string;
  /** Diisi hanya bila `state === "measured"`; selain itu selalu `null`. */
  value: number | null;
  state: FunnelStageState;
  /** Asal angka; `null` bila tahapnya tidak terukur. */
  provenance: DataProvenance | null;
  /** Sumber angka atau alasan ketiadaannya. Selalu terisi. */
  note: string;
  /** Rasio terhadap tahap tepat sebelumnya, hanya bila keduanya terukur. */
  stepRate: number | null;
  /** Rasio terhadap tahap terukur pertama. */
  totalRate: number | null;
}

/** Kalimat yang wajib ikut ditampilkan bersama seluruh corong. */
export const SALES_SOURCE_RULE =
  "Setiap tahap menyebut sumbernya. Tahap yang belum terhubung ditandai apa adanya dan tidak diisi taksiran — angka yang tidak punya asal tidak boleh tampil sebagai hasil penjualan.";

function countEvents(events: SiteEvent[], type: TrackingEventType): number {
  return events.filter((event) => event.eventType === type).length;
}

interface RawStage {
  key: string;
  label: string;
  value: number | null;
  state: FunnelStageState;
  provenance: DataProvenance | null;
  note: string;
}

/**
 * Corong dari tayangan konten sampai pendapatan.
 *
 * Urutan tahapnya tetap, tetapi isinya bergantung pada apa yang benar-benar
 * terhubung. Yang belum terhubung tidak dihilangkan dari daftar: ia justru
 * ditampilkan supaya lubangnya terlihat, bukan tersembunyi.
 */
export function salesFunnel(dataset: Dataset): SalesFunnelStage[] {
  const totals = platformAggregates(dataset);
  const views = sum(totals.map((row) => row.views));
  const linkClicks = sum(totals.map((row) => row.linkClicks));
  const social = socialProvenance(dataset);

  const events = dataset.events;
  const trackerConnected = events.length > 0;
  const pageviews = countEvents(events, "pageview");
  const productViews = countEvents(events, "product_view");
  const leadSignals = countEvents(events, "lead");
  const orderSignals = countEvents(events, "order");

  const raw: RawStage[] = [
    {
      key: "views",
      label: "Tayangan konten sosial",
      value: views,
      state: "measured",
      provenance: social,
      note: "Jumlah tayangan seluruh kanal sosial pada periode aktif.",
    },
    {
      key: "clicks",
      label: "Klik tautan keluar",
      value: linkClicks,
      state: "measured",
      provenance: social,
      note: "Klik tautan dari konten sosial, sebagaimana dilaporkan platform kanal.",
    },
    trackerConnected
      ? {
          key: "visits",
          label: "Kunjungan halaman website",
          value: pageviews,
          state: "measured",
          provenance: "first-party",
          note: `${events.length} peristiwa diterima pelacak website ini.`,
        }
      : {
          key: "visits",
          label: "Kunjungan halaman website",
          value: null,
          state: "not_connected",
          provenance: null,
          note:
            "Belum ada satu pun peristiwa diterima pelacak. Kosong di sini berarti belum ada yang terukur — bukan berarti tidak ada kunjungan.",
        },
    productViews > 0
      ? {
          key: "product_views",
          label: "Halaman produk dilihat",
          value: productViews,
          state: "measured",
          provenance: "first-party",
          note: 'Peristiwa `product_view` yang dikirim pelacak dari halaman produk.',
        }
      : {
          key: "product_views",
          label: "Halaman produk dilihat",
          value: null,
          state: "not_connected",
          provenance: null,
          note: trackerConnected
            ? 'Pelacak aktif, tetapi belum ada satu pun peristiwa `product_view`. Pastikan halaman produk memanggil peakalpha.track("product_view").'
            : 'Belum ada peristiwa `product_view` karena pelacak website belum mengirim apa pun.',
        },
    {
      key: "leads",
      label: "Prospek (leads)",
      value: null,
      state: "not_connected",
      provenance: null,
      note:
        "Menunggu integrasi WhatsApp Business atau CRM (Phase 4 item 3). " +
        signalNote(leadSignals, "lead", "prospek"),
    },
    {
      key: "orders",
      label: "Pesanan",
      value: null,
      state: "not_connected",
      provenance: null,
      note:
        "Menunggu integrasi marketplace dan verifikasi aksesnya (Phase 4 item 4). " +
        "Pesanan bukan diambil dari pelacak browser karena itu bukan catatan transaksi. " +
        signalNote(orderSignals, "order", "pesanan"),
    },
    {
      key: "revenue",
      label: "Pendapatan",
      value: null,
      state: "not_connected",
      provenance: null,
      note:
        "Menunggu sistem transaksi sebagai sumber tunggal pendapatan (Phase 4 item 5). " +
        "Tanpa sumber itu, angka pendapatan tidak dapat direkonsiliasi dan tidak boleh ditaksir.",
    },
  ];

  const baseValue = raw.find((stage) => stage.value !== null)?.value ?? null;

  return raw.map((stage, index) => {
    if (stage.value === null) {
      return { ...stage, stepRate: null, totalRate: null };
    }
    const previous = index > 0 ? raw[index - 1].value : null;
    return {
      ...stage,
      stepRate: previous === null ? null : safeDiv(stage.value, previous) * 100,
      totalRate: baseValue === null ? null : safeDiv(stage.value, baseValue) * 100,
    };
  });
}

/** Menyebut jumlah sinyal yang diterima tanpa mengangkatnya menjadi transaksi. */
function signalNote(count: number, type: string, businessWord: string): string {
  if (count === 0) return `Tidak ada peristiwa \`${type}\` yang diterima.`;
  return (
    `Terdapat ${count} peristiwa \`${type}\` dari pelacak situs, dan itu memang diterima sebagai bukti — ` +
    `tetapi ia bukan catatan ${businessWord} dan sengaja tidak dihitung di tahap ini.`
  );
}

/* ------------------------------------------------------------------ */
/* Atribusi UTM                                                        */
/* ------------------------------------------------------------------ */

export interface CampaignAttribution {
  /** `null` berarti kunjungan tanpa parameter kampanye — bukan "kampanye lain". */
  campaign: string | null;
  /** Isi `utm_content`; dipakai untuk mengaitkan kunjungan dengan konten. */
  contentRef: string | null;
  visits: number;
  productViews: number;
  leadSignals: number;
  orderSignals: number;
  firstSeen: string;
  lastSeen: string;
}

/**
 * Kunjungan dikelompokkan per kampanye dan per penanda konten.
 *
 * Kunjungan tanpa UTM tidak dibuang dan tidak dipaksakan masuk ke kampanye
 * tertentu: ia membentuk kelompok tersendiri dengan `campaign: null`. Itu penting
 * karena sebagian besar kunjungan biasanya memang tanpa UTM, dan menyembunyikannya
 * akan membuat atribusi tampak lebih lengkap daripada kenyataannya.
 */
export function campaignAttribution(events: SiteEvent[]): CampaignAttribution[] {
  const groups = new Map<string, CampaignAttribution>();

  for (const event of events) {
    const campaign = event.utm.campaign;
    const contentRef = event.utm.content;
    const key = `${campaign ?? ""}\u0000${contentRef ?? ""}`;
    const bucket =
      groups.get(key) ??
      ({
        campaign,
        contentRef,
        visits: 0,
        productViews: 0,
        leadSignals: 0,
        orderSignals: 0,
        firstSeen: event.occurredAt,
        lastSeen: event.occurredAt,
      } satisfies CampaignAttribution);

    if (event.eventType === "pageview") bucket.visits += 1;
    if (event.eventType === "product_view") bucket.productViews += 1;
    if (event.eventType === "lead") bucket.leadSignals += 1;
    if (event.eventType === "order") bucket.orderSignals += 1;
    if (event.occurredAt < bucket.firstSeen) bucket.firstSeen = event.occurredAt;
    if (event.occurredAt > bucket.lastSeen) bucket.lastSeen = event.occurredAt;

    groups.set(key, bucket);
  }

  return [...groups.values()].sort(
    (a, b) => b.visits - a.visits || (a.campaign ?? "").localeCompare(b.campaign ?? ""),
  );
}

/**
 * Apakah corong mencampur asal data yang berbeda.
 *
 * Dipakai halaman penjualan untuk memperingatkan bahwa sebagian tahap masih
 * ilustratif sementara tahap lain sudah terukur — angka yang tercampur tidak
 * boleh dibaca sebagai satu rangkaian yang setara.
 */
export function mixesProvenance(stages: SalesFunnelStage[]): boolean {
  const kinds = new Set(
    stages
      .filter((stage) => stage.state === "measured" && stage.provenance !== null)
      .map((stage) => stage.provenance),
  );
  return kinds.size > 1;
}
