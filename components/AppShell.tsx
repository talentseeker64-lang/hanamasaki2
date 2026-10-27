"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PLATFORM_BRAND, PLATFORM_ORDER, PlatformIcon } from "@/components/ui";
import type { Platform } from "@/lib/types";

interface NavChild {
  href: string;
  label: string;
  platform: Platform;
}

interface NavItem {
  href: string;
  label: string;
  hint: string;
  icon: string;
  /** Submenu opsional; dipakai untuk memecah data per kanal sosial. */
  children?: NavChild[];
}

const NAV: NavItem[] = [
  {
    href: "/",
    label: "Overview",
    hint: "Ringkasan semua kanal",
    icon: "M3 12h4l3 7 4-14 3 7h4",
  },
  {
    href: "/social",
    label: "Social Media",
    hint: "Statistik per platform",
    icon: "M4 19V5m0 14h16M8 15v-4m4 4V7m4 8v-6",
    children: PLATFORM_ORDER.map((platform) => ({
      href: `/social/${platform}`,
      label: PLATFORM_BRAND[platform].label,
      platform,
    })),
  },
  {
    href: "/comments",
    label: "Comments AI",
    hint: "Sentimen dan topik",
    icon: "M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12Z",
  },
  {
    href: "/website",
    label: "Website Analytics",
    hint: "Trafik dan konversi",
    icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c2.5 2.4 3.8 5.4 3.8 9S14.5 18.6 12 21m0-18c-2.5 2.4-3.8 5.4-3.8 9S9.5 18.6 12 21M3.5 9h17m-17 6h17",
  },
  {
    href: "/insights",
    label: "AI Insights",
    hint: "Rekomendasi dan prediksi",
    icon: "M12 3v3m0 12v3M4.2 7.5l2.6 1.5m10.4 6 2.6 1.5M4.2 16.5l2.6-1.5m10.4-6 2.6-1.5M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  },
  {
    href: "/reports",
    label: "Reports",
    hint: "Laporan otomatis",
    icon: "M7 3h7l5 5v13H7V3Zm7 0v5h5M10 13h7M10 17h7",
  },
  {
    href: "/integrations",
    label: "Integrations",
    hint: "Koneksi akun dan website",
    icon: "M9 7V4m6 3V4M6 7h12v4a6 6 0 0 1-12 0V7Zm6 10v4m-3 0h6",
  },
  {
    href: "/settings",
    label: "Settings & Team",
    hint: "Pengguna dan izin",
    icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-3-2-.6-.6-1.4 1-1.8-1.6-1.6-1.8 1-1.4-.6L13 4h-2l-.6 2-1.4.6-1.8-1L5.6 7.2l1 1.8-.6 1.4L4 11v2l2 .6.6 1.4-1 1.8 1.6 1.6 1.8-1 1.4.6L11 20h2l.6-2 1.4-.6 1.8 1 1.6-1.6-1-1.8.6-1.4L20 13v-1Z",
  },
];

/** Cocokkan pathname ke menu induk, anak menu, atau judul bawaan aplikasi. */
function titleForPath(pathname: string): string {
  for (const item of NAV) {
    if (pathname === item.href) return item.label;
    const child = item.children?.find((entry) => entry.href === pathname);
    if (child) return `${item.label} · ${child.label}`;
    if (item.href !== "/" && pathname.startsWith(`${item.href}/`)) return item.label;
  }
  return "PeakAlpha";
}

export default function AppShell({
  children,
  syncLabel,
}: {
  children: React.ReactNode;
  syncLabel: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 px-2">
      {NAV.map((item) => {
        const active =
          pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
        return (
          <div key={item.href}>
            <Link
              href={item.href}
              onClick={() => setOpen(false)}
              className={`group flex items-start gap-3 rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`mt-0.5 size-4 shrink-0 ${active ? "text-indigo-600" : "text-slate-400"}`}
                aria-hidden
              >
                <path d={item.icon} />
              </svg>
              <span className="min-w-0">
                <span className={`block font-medium ${active ? "text-indigo-700" : ""}`}>
                  {item.label}
                </span>
                <span className="block truncate text-[11px] text-slate-400">{item.hint}</span>
              </span>
            </Link>

            {item.children ? (
              <ul className="mb-1 mt-0.5 flex flex-col gap-0.5 pl-6">
                {item.children.map((child) => {
                  const childActive = pathname === child.href;
                  return (
                    <li key={child.href}>
                      <Link
                        href={child.href}
                        onClick={() => setOpen(false)}
                        className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] transition ${
                          childActive
                            ? "bg-slate-100 font-medium text-slate-900"
                            : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                        }`}
                      >
                        <PlatformIcon
                          platform={child.platform}
                          className={`size-3.5 shrink-0 ${childActive ? "" : "opacity-80"}`}
                        />
                        {child.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <Brand />
        {nav}
        <SidebarFooter syncLabel={syncLabel} />
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/30"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="relative z-50 flex w-72 flex-col border-r border-slate-200 bg-white">
            <Brand />
            {nav}
            <SidebarFooter syncLabel={syncLabel} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/85 px-4 py-3 backdrop-blur lg:px-8">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 lg:hidden"
            aria-label="Buka navigasi"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4">
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">
              {titleForPath(pathname)}
            </p>
            <p className="text-xs text-slate-500">Periode aktif: 30 hari terakhir</p>
          </div>
          <span className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100 sm:inline-flex">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Tersinkron {syncLabel}
          </span>
          <span className="hidden rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-100 md:inline-flex">
            Data ilustratif
          </span>
        </header>
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="px-5 pb-5 pt-6">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
          PA
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">PeakAlpha</p>
          <p className="text-[11px] text-slate-400">Social Media Operations</p>
        </div>
      </div>
    </div>
  );
}

function SidebarFooter({ syncLabel }: { syncLabel: React.ReactNode }) {
  return (
    <div className="border-t border-slate-100 px-5 py-4">
      <p className="text-[11px] leading-relaxed text-slate-400">
        Semua angka pada versi ini berasal dari dataset ilustratif yang dibangkitkan secara
        deterministik. Terakhir disinkronkan {syncLabel}.
      </p>
    </div>
  );
}
