import { Suspense } from "react";
import { Card, CardHeader, DataNotice, PageHeader, PageSkeleton, PlatformBadge } from "@/components/ui";
import { getDataset } from "@/lib/data";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { ConnectionState } from "@/lib/types";

const CONNECTION_STYLE: Record<ConnectionState, { label: string; className: string }> = {
  connected: {
    label: "Terhubung",
    className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
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

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <IntegrationsContent />
    </Suspense>
  );
}

async function IntegrationsContent() {
  const dataset = await getDataset();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Integrations"
        title="Koneksi akun media sosial dan website"
        description="Setiap platform memiliki aturan akses data yang berbeda. Beberapa metrik hanya tersedia untuk akun yang terhubung dan telah memberikan izin, dan beberapa endpoint memerlukan persetujuan aplikasi."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {dataset.accounts.map((account) => {
          const style = CONNECTION_STYLE[account.connection];
          const gained = account.followers - account.followersStart;
          return (
            <Card key={account.id}>
              <CardHeader
                title={account.displayName}
                description={account.handle}
                action={
                  <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${style.className}`}>
                    {style.label}
                  </span>
                }
              />
              <div className="flex flex-col gap-4 px-5 py-5">
                <div className="flex items-center gap-2">
                  <PlatformBadge platform={account.platform} />
                  <span className="text-xs text-slate-400">{account.id}</span>
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <div>
                    <dt className="text-[11px] text-slate-400">Pengikut saat ini</dt>
                    <dd className="text-sm font-semibold tabular-nums text-slate-800">
                      {formatNumber(account.followers)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-slate-400">Bertambah di dataset</dt>
                    <dd className="text-sm font-semibold tabular-nums text-emerald-600">
                      +{formatNumber(gained)}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-[11px] text-slate-400">Sinkronisasi terakhir</dt>
                    <dd className="text-sm text-slate-700">
                      {account.lastSyncAt ? formatDateTime(account.lastSyncAt) : "Belum tersinkron"}
                    </dd>
                  </div>
                </dl>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Izin (scopes)</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {account.scopes.map((scope) => (
                      <span
                        key={scope}
                        className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600"
                      >
                        {scope}
                      </span>
                    ))}
                  </div>
                </div>
                <DataNotice>{account.limitation}</DataNotice>
              </div>
            </Card>
          );
        })}
      </div>

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
                Terhubung
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
                Terhubung
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
