import type { NotificationPreference, Organization, TeamMember } from "./types";

/**
 * Nilai awal pengaturan organisasi.
 *
 * Dipakai oleh scripts/generate-seed.ts untuk menghasilkan seed D1. Setelah
 * seed diterapkan, sumber kebenarannya adalah tabel D1 — bukan berkas ini.
 */

export const ORGANIZATION: Organization = {
  id: "current",
  name: "Hanamasak Studio",
  plan: "Tim (5 kursi)",
  timezone: "Asia/Jakarta (WIB)",
  defaultPeriod: "30 hari terakhir",
};

export const TEAM_MEMBERS: TeamMember[] = [
  {
    email: "andi@hanamasak.example",
    name: "Andi Pratama",
    role: "owner",
    scope: "Semua kanal dan pengaturan",
  },
  {
    email: "rani@hanamasak.example",
    name: "Rani Kusuma",
    role: "admin",
    scope: "Semua kanal, tanpa tagihan",
  },
  {
    email: "dwi@hanamasak.example",
    name: "Dwi Santoso",
    role: "analyst",
    scope: "Semua kanal, hanya baca",
  },
  {
    email: "bela@hanamasak.example",
    name: "Bela Anggraini",
    role: "content_manager",
    scope: "Instagram, TikTok",
  },
  {
    email: "yusuf@hanamasak.example",
    name: "Yusuf Ramadhan",
    role: "agency",
    scope: "Instagram, TikTok, laporan",
  },
];

export const NOTIFICATIONS: NotificationPreference[] = [
  {
    id: "daily-summary",
    label: "Ringkasan harian",
    detail: "Rekap performa 24 jam terakhir setiap pukul 08.00 WIB.",
    enabled: true,
  },
  {
    id: "traffic-drop",
    label: "Peringatan penurunan trafik",
    detail: "Dikirim bila sesi website turun lebih dari 15% dibanding 7 hari sebelumnya.",
    enabled: true,
  },
  {
    id: "performance-spike",
    label: "Peringatan lonjakan performa",
    detail: "Dikirim bila tayangan sosial naik lebih dari 25% dalam sehari.",
    enabled: false,
  },
  {
    id: "unanswered-complaints",
    label: "Keluhan belum tertangani",
    detail: "Dikirim bila ada keluhan dengan jumlah suka tinggi tanpa balasan lebih dari 24 jam.",
    enabled: true,
  },
  {
    id: "weekly-client-report",
    label: "Laporan mingguan ke klien",
    detail: "Laporan otomatis setiap Senin pagi untuk klien agensi.",
    enabled: false,
  },
];
