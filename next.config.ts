import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
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
