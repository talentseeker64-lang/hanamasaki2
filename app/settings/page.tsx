import { Suspense } from "react";
import { Card, CardHeader, DataNotice, PageHeader, PageSkeleton } from "@/components/ui";
import { SettingsManager } from "@/components/SettingsManager";
import { getSettings } from "@/lib/settings";

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SettingsContent />
    </Suspense>
  );
}

async function SettingsContent() {
  const settings = await getSettings();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Settings & Team"
        title="Pengguna, izin akses, dan pengaturan organisasi"
        description="Kelola identitas ruang kerja, siapa yang dapat mengakses kanal, dan peringatan otomatis apa yang mereka terima. Data di halaman ini tersimpan di Cloudflare D1."
      />

      <SettingsManager settings={settings} />

      <Card>
        <CardHeader
          title="Keamanan dan data"
          description="Catatan penting sebelum aplikasi ini dipakai dengan data produksi."
        />
        <ul className="flex flex-col gap-2 px-5 py-5">
          {[
            "Kredensial platform disimpan terenkripsi AES-256-GCM dan tidak pernah dikembalikan lewat respons API.",
            "Endpoint tulis dilindungi token bersama (header x-admin-token); selama ADMIN_TOKEN belum diatur, seluruh penulisan ditolak.",
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
            Token admin pada halaman ini adalah penghalang sederhana, bukan autentikasi pengguna.
            Sebelum dipakai produksi, ganti dengan sesi login yang sesungguhnya dan pisahkan peran
            tiap pengguna.
          </DataNotice>
        </div>
      </Card>
    </div>
  );
}
