import { Card, CardHeader, DataNotice, PageHeader } from "@/components/ui";

const TEAM: Array<{ name: string; email: string; role: string; scope: string }> = [
  { name: "Andi Pratama", email: "andi@hanamasak.example", role: "Pemilik", scope: "Semua kanal dan pengaturan" },
  { name: "Rani Kusuma", email: "rani@hanamasak.example", role: "Admin", scope: "Semua kanal, tanpa tagihan" },
  { name: "Dwi Santoso", email: "dwi@hanamasak.example", role: "Analis", scope: "Semua kanal, hanya baca" },
  { name: "Bela Anggraini", email: "bela@hanamasak.example", role: "Pengelola konten", scope: "Instagram, TikTok" },
  { name: "Yusuf Ramadhan", email: "yusuf@hanamasak.example", role: "Agensi", scope: "Instagram, TikTok, laporan" },
];

const ROLE_STYLE: Record<string, string> = {
  Pemilik: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
  Admin: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  Analis: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  "Pengelola konten": "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  Agensi: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
};

const NOTIFICATIONS: Array<{ label: string; detail: string; enabled: boolean }> = [
  {
    label: "Ringkasan harian",
    detail: "Rekap performa 24 jam terakhir setiap pukul 08.00 WIB.",
    enabled: true,
  },
  {
    label: "Peringatan penurunan trafik",
    detail: "Dikirim bila sesi website turun lebih dari 15% dibanding 7 hari sebelumnya.",
    enabled: true,
  },
  {
    label: "Peringatan lonjakan performa",
    detail: "Dikirim bila tayangan sosial naik lebih dari 25% dalam sehari.",
    enabled: false,
  },
  {
    label: "Keluhan belum tertangani",
    detail: "Dikirim bila ada keluhan dengan jumlah suka tinggi tanpa balasan lebih dari 24 jam.",
    enabled: true,
  },
  {
    label: "Laporan mingguan ke klien",
    detail: "Laporan otomatis setiap Senin pagi untuk klien agensi.",
    enabled: false,
  },
];

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Settings & Team"
        title="Pengguna, izin akses, dan pengaturan organisasi"
        description="Kelola siapa yang dapat mengakses kanal, apa yang boleh mereka ubah, dan peringatan otomatis apa yang mereka terima. Susunan tim pada halaman ini adalah contoh tampilan, bukan data akun nyata."
      />

      <Card>
        <CardHeader title="Organisasi" description="Identitas dan pengaturan dasar ruang kerja." />
        <dl className="grid gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">Nama organisasi</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">Hanamasak Studio</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Paket</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">Tim (5 kursi)</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Zona waktu</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">Asia/Jakarta (WIB)</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Periode default</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">30 hari terakhir</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardHeader
          title="Anggota tim dan peran"
          description="Peran menentukan kanal mana yang terlihat dan tindakan apa yang diizinkan."
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-medium">Nama</th>
                <th className="px-5 py-3 font-medium">Peran</th>
                <th className="px-5 py-3 font-medium">Cakupan akses</th>
              </tr>
            </thead>
            <tbody>
              {TEAM.map((member) => (
                <tr key={member.email} className="border-b border-slate-50 last:border-b-0">
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-800">{member.name}</p>
                    <p className="text-xs text-slate-400">{member.email}</p>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                        ROLE_STYLE[member.role] ?? "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {member.role}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{member.scope}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Preferensi notifikasi"
          description="Peringatan dikirim melalui email dan kanal tim. Status di bawah ini hanya tampilan, belum tersimpan."
        />
        <ul className="flex flex-col divide-y divide-slate-100">
          {NOTIFICATIONS.map((item) => (
            <li key={item.label} className="flex items-start justify-between gap-4 px-5 py-4">
              <div>
                <p className="text-sm font-medium text-slate-800">{item.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{item.detail}</p>
              </div>
              <span
                className={`mt-0.5 shrink-0 rounded-full px-3 py-1 text-[11px] font-medium ${
                  item.enabled
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                    : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                }`}
              >
                {item.enabled ? "Aktif" : "Nonaktif"}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader
          title="Keamanan dan data"
          description="Catatan penting sebelum aplikasi ini dipakai dengan data produksi."
        />
        <ul className="flex flex-col gap-2 px-5 py-5">
          {[
            "Token akses platform harus disimpan terenkripsi dan tidak pernah ditulis ke log aplikasi.",
            "Setiap webhook dari platform harus diverifikasi tanda tangannya sebelum diproses.",
            "Data historis disimpan untuk kebutuhan analisis tren; sediakan kebijakan retensi dan penghapusan.",
            "Pisahkan data antarorganisasi pada tingkat kueri agar tidak ada kebocoran antar-tenant.",
          ].map((item) => (
            <li key={item} className="flex gap-2 text-sm leading-relaxed text-slate-700">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-indigo-400" />
              {item}
            </li>
          ))}
        </ul>
        <div className="border-t border-slate-100 px-5 py-4">
          <DataNotice>
            Versi ini belum memiliki autentikasi, penyimpanan token, maupun manajemen sesi. Halaman
            pengaturan berfungsi sebagai acuan struktur untuk tahap berikutnya.
          </DataNotice>
        </div>
      </Card>
    </div>
  );
}
