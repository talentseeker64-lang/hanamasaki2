import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Cache Components (dan Partial Prerendering) sengaja TIDAK diaktifkan.
// Dokumentasi Next 16 menyatakan fitur ini "requires the Node.js runtime";
// Cloudflare Workers (workerd) bukan Node.js, sehingga prerender PPR menggantung
// dan runtime Workers membunuh request dengan error 1101. Sebagai gantinya,
// halaman dirender dinamis penuh per request — lihat `connection()` di lib/data.ts.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

// Menyiapkan binding Cloudflare agar tersedia saat `next dev` di lokal.
// Hanya diperlukan di mode development; saat `next build` pemanggilan ini
// tidak berguna dan menyalakan runtime Miniflare yang tidak perlu.
if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev();
}
