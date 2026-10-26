import { NextResponse } from "next/server";
import { buildInsights, detectAnomalies } from "@/lib/ai";
import { getDataset } from "@/lib/data";
import { kpiSummary, trendPoints } from "@/lib/metrics";

/**
 * Kontrak API ringkasan lintas kanal. Dipakai oleh klien eksternal dan
 * pengujian; halaman dashboard membaca fungsi yang sama secara langsung.
 */
export async function GET() {
  const dataset = getDataset();
  return NextResponse.json({
    range: dataset.range,
    history: dataset.history,
    generatedAt: dataset.generatedAt,
    disclaimer:
      "Dataset ilustratif yang dibangkitkan secara deterministik, bukan data akun nyata.",
    kpi: kpiSummary(dataset),
    trend: trendPoints(dataset),
    insights: buildInsights(dataset),
    anomalies: detectAnomalies(dataset),
  });
}
