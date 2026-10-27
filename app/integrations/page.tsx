import { Suspense } from "react";
import { Card, CardHeader, DataNotice, PageHeader, PageSkeleton } from "@/components/ui";
import { AccountsManager } from "@/components/AccountsManager";
import { listCredentialSummaries } from "@/lib/credentials";
import { getDataset } from "@/lib/data";
import type { ConnectionState } from "@/lib/types";

// Status ini diisi manual oleh admin, bukan hasil verifikasi OAuth. Karena itu
// "connected" sengaja tidak diberi warna hijau dan labelnya menyatakan bahwa
// koneksinya belum diverifikasi.
const CONNECTION_STYLE: Record<ConnectionState, { label: string; className: string }> = {
  connected: {
    label: "Terhubung (belum diverifikasi)",
    className: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  },
  needs_review: {
    label: "Perlu ditinjau",
    className: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  },
  not_connected: {
    label: "Belum terhubung",
    className: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  },
};

const DATA_SOURCE_NOTES: Array<{
  source: string;
  metrics: string;
  requirement: string;
  note: string;
}> = [
  {
    source: "Instagram",
    metrics: "Tayangan, jangkauan, interaksi, komentar, kunjungan profil",
    requirement: "Akun Business/Creator + izin insights Instagram",
    note: "Jangkauan (viewer unik) hanya tersedia untuk akun Business/Creator yang terhubung.",
  },
  {
    source: "TikTok",
    metrics: "Tayangan video, interaksi, statistik akun",
    requirement: "Izin video.list dan user.info.stats",
    note: "Definisi video views berbeda dari platform lain, sehingga tidak dapat dibandingkan langsung.",
  },
  {
    source: "YouTube",
    metrics: "Tayangan, suka, komentar, pelanggan, analitik",
    requirement: "youtube.readonly + yt-analytics.readonly",
    note: "Data analitik YouTube tertunda hingga 48 jam, sehingga angka 24 jam terakhir bersifat sementara.",
  },
  {
    source: "Facebook",
    metrics: "Page insights dan interaksi",
    requirement: "pages_read_engagement + read_insights",
    note: "Izin insights perlu ditinjau ulang setelah perubahan review aplikasi.",
  },
  {
    source: "Website",
    metrics: "Sesi, pengguna, tampilan halaman, sumber trafik, konversi",
    requirement: "Integrasi analytics atau pelacakan yang dipasang benar",
    note: "Konversi adalah target bisnis yang dilaporkan situs, bukan transaksi yang diverifikasi.",
  },
  {
    source: "Google Search Console",
    metrics: "Klik organik, impresi, CTR, posisi rata-rata",
    requirement: "Verifikasi kepemilikan properti + izin baca",
    note: "Data pencarian hanya mencakup kueri yang melewati ambang minimum privasi Google.",
  },
];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function IntegrationsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <IntegrationsContent searchParams={searchParams} />
    </Suspense>
  );
}

function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Menerjemahkan hasil balikan OAuth menjadi pesan yang dapat dibaca.
 *
 * Callback OAuth dijalankan sebagai navigasi peramban, jadi hasilnya hanya bisa
 * dikirim lewat parameter URL — bukan lewat body respons.
 */
function buildOAuthNotice(
  params: Record<string, string | string[] | undefined>,
): { tone: "ok" | "error"; text: string } | null {
  const metaStatus = firstValue(params.meta);
  const googleStatus = firstValue(params.google);

  if (metaStatus === "ok") {
    const account = firstValue(params.account) ?? "akun";
    const verified = firstValue(params.as);
    return {
      tone: "ok",
      text:
        `Koneksi Meta terverifikasi${verified ? ` sebagai ${verified}` : ""}. ` +
        `Akun "${account}" kini memakai token yang sudah diuji lewat panggilan API Meta.`,
    };
  }

  if (googleStatus === "ok") {
    const account = firstValue(params.account) ?? "akun";
    const verified = firstValue(params.as);
    return {
      tone: "ok",
      text:
        `Koneksi Google terverifikasi${verified ? ` untuk channel ${verified}` : ""}. ` +
        `Akun "${account}" kini memakai token yang sudah diuji lewat panggilan YouTube Data API.`,
    };
  }

  const status = metaStatus ?? googleStatus;
  if (status === "error") {
    const provider = metaStatus === "error" ? "Meta" : "Google";
    return {
      tone: "error",
      text: `Koneksi ${provider} gagal: ${firstValue(params.reason) ?? "penyebab tidak diketahui."}`,
    };
  }

  return null;
}

async function IntegrationsContent({ searchParams }: { searchParams: SearchParams }) {
  const [dataset, credentials, params] = await Promise.all([
    getDataset(),
    listCredentialSummaries(),
    searchParams,
  ]);
  const notice = buildOAuthNotice(params);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Integrations"
        title="Koneksi akun media sosial dan website"
        description="Tambah, ubah, dan hubungkan akun yang dipantau. Metrik pengikut dan tayangan tidak diisi manual — angka itu terisi saat sinkronisasi platform berjalan."
      />

      <AccountsManager
        accounts={dataset.accounts}
        credentials={credentials}
        notice={notice}
      />

      <Card>
        <CardHeader
          title="Website analytics dan Search Console"
          description="Untuk data website, integrasi ini memakai penyedia analytics dan Search Console yang sudah ada, bukan sistem pelacakan yang dibangun dari nol."
        />
        <div className="grid gap-4 px-5 py-5 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">Website Analytics</p>
              <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${CONNECTION_STYLE.connected.className}`}>
                Belum diverifikasi
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Menyediakan sesi, pengguna, tampilan halaman, sumber trafik, rasio pentalan, dan
              konversi. Properti contoh: hanamasak.example.com
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">Google Search Console</p>
              <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${CONNECTION_STYLE.connected.className}`}>
                Belum diverifikasi
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Menyediakan klik organik, impresi, CTR, dan posisi rata-rata per kata kunci untuk
              memantau dampak pencarian terhadap trafik.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Ketersediaan data per sumber"
          description="Ringkasan apa yang dapat diambil, syarat aksesnya, dan catatan penting sebelum menafsirkan angkanya."
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-medium">Sumber</th>
                <th className="px-5 py-3 font-medium">Metrik yang dapat ditargetkan</th>
                <th className="px-5 py-3 font-medium">Syarat akses</th>
                <th className="px-5 py-3 font-medium">Catatan</th>
              </tr>
            </thead>
            <tbody>
              {DATA_SOURCE_NOTES.map((row) => (
                <tr key={row.source} className="border-b border-slate-50 last:border-b-0">
                  <td className="px-5 py-3 font-medium text-slate-800">{row.source}</td>
                  <td className="px-5 py-3 text-slate-600">{row.metrics}</td>
                  <td className="px-5 py-3 text-slate-600">{row.requirement}</td>
                  <td className="px-5 py-3 text-slate-500">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 px-5 py-4">
          <DataNotice>
            Jangan mengasumsikan semua data publik dapat diambil secara bebas. Mulai dari integrasi
            yang paling dibutuhkan, lalu tambah kanal lain setelah izin dan kualitas datanya
            terbukti andal.
          </DataNotice>
        </div>
      </Card>
    </div>
  );
}
