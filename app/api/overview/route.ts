import { NextResponse } from "next/server";
import { buildInsights, detectAnomalies } from "@/lib/ai";
import { requireAdmin } from "@/lib/api";
import { getDataset } from "@/lib/data";
import {
  apiSyncedPlatforms,
  kpiSummary,
  socialProvenance,
  trendPoints,
  webProvenance,
} from "@/lib/metrics";

/**
 * Kontrak API ringkasan lintas kanal. Dipakai oleh klien eksternal dan
 * pengujian; halaman dashboard membaca fungsi yang sama secara langsung.
 *
 * Endpoint ini mengembalikan angka bisnis, jadi tidak dibiarkan publik: pembaca
 * wajib menyertakan token admin seperti endpoint tulis. Halaman HTML yang
 * merender dataset yang sama masih dapat diakses; membatasinya memerlukan
 * autentikasi pengguna sungguhan yang belum ada di fase ini.
 */
export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const dataset = await getDataset();
  const synced = [...apiSyncedPlatforms(dataset)];
  const provenance =
    `Asal data per metrik — sosial: ${socialProvenance(dataset)}, website: ${webProvenance(dataset)}. ` +
    (synced.length === 0
      ? "Tidak ada kanal yang metrik hariannya berasal dari API platform."
      : `Metrik dari API platform tersedia untuk kanal: ${synced.join(", ")}.`);
  return NextResponse.json({
    range: dataset.range,
    history: dataset.history,
    generatedAt: dataset.generatedAt,
    disclaimer: provenance,
    kpi: kpiSummary(dataset),
    trend: trendPoints(dataset),
    insights: buildInsights(dataset),
    anomalies: detectAnomalies(dataset),
  });
}
