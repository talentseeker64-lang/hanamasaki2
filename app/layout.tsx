import { Suspense } from "react";
import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import { getDataset } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import "./globals.css";

export const metadata: Metadata = {
  title: "PeakAlpha — Social Media Operations Platform",
  description:
    "Dashboard analitik media sosial dan website dengan analisis konten, sentimen komentar, dan rekomendasi otomatis.",
};

/**
 * Penanda dinamis: waktu sinkronisasi dibaca dari D1 pada saat request.
 * Dipisah dari layout agar kerangka halaman tetap dapat diprerender statis.
 */
async function SyncLabel() {
  const dataset = await getDataset();
  return <>{formatDateTime(dataset.generatedAt)}</>;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" style={{ colorScheme: "light" }}>
      <body className="min-h-screen">
        <AppShell
          syncLabel={
            <Suspense fallback="…">
              <SyncLabel />
            </Suspense>
          }
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
