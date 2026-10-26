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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const dataset = getDataset();
  return (
    <html lang="id" style={{ colorScheme: "light" }}>
      <body className="min-h-screen">
        <AppShell syncLabel={formatDateTime(dataset.generatedAt)}>{children}</AppShell>
      </body>
    </html>
  );
}
