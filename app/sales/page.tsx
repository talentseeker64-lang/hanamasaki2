import { headers } from "next/headers";
import { Suspense } from "react";
import {
  Card,
  CardHeader,
  PageHeader,
  PageSkeleton,
  ProvenanceBadge,
} from "@/components/ui";
import { getDataset } from "@/lib/data";
import { formatCompact, formatDateTime, formatNumber, formatPercent } from "@/lib/format";
import {
  FUNNEL_STATE_LABEL,
  SALES_SOURCE_RULE,
  campaignAttribution,
  mixesProvenance,
  salesFunnel,
  type SalesFunnelStage,
} from "@/lib/sales";
import { trackerSnippet, trackingCoverage } from "@/lib/tracking";

const STAGE_BADGE: Record<SalesFunnelStage["state"], string> = {
  measured: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  not_connected: "bg-slate-100 text-slate-500 ring-slate-200",
  unavailable: "bg-amber-50 text-amber-700 ring-amber-100",
};

/**
 * Origin yang dipakai pengunjung untuk membuka halaman ini — itulah alamat
 * Worker yang harus dipasang pada `src` skrip pelacak.
 */
async function requestOrigin(): Promise<string | null> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host");
  if (!host) return null;
  const proto = incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default function SalesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SalesContent />
    </Suspense>
  );
}

async function SalesContent() {
  const dataset = await getDataset();
  const stages = salesFunnel(dataset);
  const coverage = trackingCoverage(dataset.events);
  const campaigns = campaignAttribution(dataset.events);
  const mixed = mixesProvenance(stages);
  const snippet = trackerSnippet(await requestOrigin());

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Sales & Conversion"
        title="Dari konten ke pesanan"
        description="Corong ini menyusun tahap demi tahap dari tayangan konten sampai pendapatan. Tahap yang belum punya sumber data ditampilkan sebagai belum terhubung — bukan diisi taksiran, dan bukan diisi nol."
      />

      <section className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Aturan yang berlaku
        </p>
        <p className="mt-1 text-sm leading-relaxed text-slate-700">{SALES_SOURCE_RULE}</p>
      </section>

      {mixed ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
            Perhatian: asal data tidak seragam
          </p>
          <p className="mt-1 text-sm leading-relaxed text-amber-900">
            Sebagian tahap masih berasal dari dataset ilustratif, sementara tahap lain sudah diukur
            langsung oleh sistem ini. Rangkaian angka di bawah karena itu <strong>belum</strong>{" "}
            dapat dibaca sebagai satu perjalanan pelanggan yang sesungguhnya. Penanda asal ada di
            setiap tahap.
          </p>
        </section>
      ) : null}

      <Card className="p-0">
        <CardHeader
          title={`Corong penjualan · ${dataset.range.days} hari terakhir`}
          description="Rasio dihitung hanya di antara tahap yang keduanya terukur. Bila ada tahap yang belum terhubung di antaranya, rasionya dikosongkan alih-alih disambungkan melewati lubang."
        />
        <ul className="divide-y divide-slate-100">
          {stages.map((stage) => (
            <StageRow key={stage.key} stage={stage} />
          ))}
        </ul>
      </Card>

      <Card className="p-0">
        <CardHeader
          title="Pelacak website"
          description="Peristiwa kunjungan yang benar-benar diterima endpoint POST /api/track. Selama belum ada peristiwa, tahap kunjungan dan halaman produk pada corong di atas tetap berstatus belum terhubung."
        />
        <div className="grid gap-4 px-5 pb-5 pt-3 sm:grid-cols-4">
          <Stat label="Peristiwa diterima" value={formatNumber(coverage.events)} />
          <Stat label="Sesi terpisah" value={formatNumber(coverage.sessions)} />
          <Stat label="Peristiwa ber-UTM" value={formatNumber(coverage.withUtm)} />
          <Stat
            label="Peristiwa terakhir"
            value={coverage.lastSeen ? formatDateTime(coverage.lastSeen) : "—"}
            small
          />
        </div>
        <div className="border-t border-slate-100 px-5 py-4">
          <p className="text-xs leading-relaxed text-slate-500">
            Pasang skrip berikut di situs pemasang, lalu ganti nilainya dengan kunci pelacak yang
            diatur pada Worker. Kunci itu terbaca siapa pun yang membuka halaman, sehingga hanya
            berfungsi sebagai penghalang pengiriman liar — bukan autentikasi.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 px-4 py-3 text-[11px] leading-relaxed text-slate-100">
            {snippet}
          </pre>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Halaman produk dapat menambahkan{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">
              {`peakalpha.track("product_view")`}
            </code>
            . Peristiwa <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">lead</code>{" "}
            dan <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">order</code> juga
            diterima dan disimpan, tetapi tidak dihitung sebagai prospek atau penjualan — catatan
            itu harus berasal dari sistem e-commerce.
          </p>
        </div>
      </Card>

      <Card className="p-0">
        <CardHeader
          title="Kunjungan per kampanye UTM"
          description="Kunjungan tanpa parameter kampanye tetap ditampilkan sebagai kelompoknya sendiri, bukan digabungkan ke kampanye mana pun."
        />
        {campaigns.length === 0 ? (
          <p className="px-5 pb-5 pt-3 text-sm text-slate-500">
            Belum ada peristiwa ber-UTM maupun tanpa UTM. Tabel ini terisi begitu endpoint pelacak
            menerima kunjungan.
          </p>
        ) : (
          <div className="overflow-x-auto px-5 pb-5 pt-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="pb-2 font-medium">Kampanye</th>
                  <th className="pb-2 font-medium">utm_content</th>
                  <th className="pb-2 text-right font-medium">Kunjungan</th>
                  <th className="pb-2 text-right font-medium">Halaman produk</th>
                  <th className="pb-2 text-right font-medium">Sinyal lead</th>
                  <th className="pb-2 text-right font-medium">Sinyal pesanan</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((row) => (
                  <tr key={`${row.campaign ?? ""}|${row.contentRef ?? ""}`} className="border-t border-slate-100">
                    <td className="py-2 text-slate-700">
                      {row.campaign ?? <span className="text-slate-400">Tanpa kampanye</span>}
                    </td>
                    <td className="py-2 font-mono text-xs text-slate-500">
                      {row.contentRef ?? "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-900">
                      {formatNumber(row.visits)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-900">
                      {formatNumber(row.productViews)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-500">
                      {formatNumber(row.leadSignals)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-500">
                      {formatNumber(row.orderSignals)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
              Kolom bertanda “sinyal” adalah peristiwa yang dilaporkan pelacak di browser. Angka itu
              ditampilkan sebagai bukti apa yang diterima, bukan sebagai jumlah prospek atau
              penjualan.
            </p>
          </div>
        )}
      </Card>

      <Card className="p-0">
        <CardHeader
          title="Yang belum terhubung"
          description="Daftar ini sengaja ikut ditampilkan: lubang yang terlihat lebih berguna daripada tahap yang terisi angka tanpa asal."
        />
        <ul className="flex flex-col gap-2 px-5 pb-5 pt-3">
          {stages
            .filter((stage) => stage.state !== "measured")
            .map((stage) => (
              <li
                key={stage.key}
                className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600 ring-1 ring-slate-100"
              >
                <span className="font-semibold text-slate-700">{stage.label}</span> — {stage.note}
              </li>
            ))}
        </ul>
      </Card>
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 font-semibold tabular-nums text-slate-900 ${small ? "text-sm" : "text-xl"}`}>
        {value}
      </p>
    </div>
  );
}

function StageRow({ stage }: { stage: SalesFunnelStage }) {
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-medium text-slate-900">{stage.label}</span>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${STAGE_BADGE[stage.state]}`}
          >
            {FUNNEL_STATE_LABEL[stage.state]}
          </span>
          {stage.state === "measured" && stage.provenance ? (
            <ProvenanceBadge provenance={stage.provenance} />
          ) : null}
        </div>
        <div className="flex items-baseline gap-4">
          <span className="text-lg font-semibold tabular-nums text-slate-900">
            {stage.value === null ? "—" : formatCompact(stage.value)}
          </span>
          <span className="text-xs tabular-nums text-slate-400">
            {stage.stepRate === null ? "rasio tahap: —" : `${formatPercent(stage.stepRate)} dari tahap sebelumnya`}
          </span>
        </div>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{stage.note}</p>
    </li>
  );
}
