"use client";

import { useState, useSyncExternalStore } from "react";
import { Card, CardHeader, DataNotice } from "@/components/ui";
import { ADMIN_TOKEN_STORAGE_KEY, readAdminToken, saveAdminToken } from "@/lib/admin-client";

/** Gaya bersama untuk seluruh formulir tulis, agar tampilannya seragam. */
export const INPUT_CLASS =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";
export const LABEL_CLASS = "text-[11px] font-medium uppercase tracking-wide text-slate-500";
export const PRIMARY_BUTTON_CLASS =
  "rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50";
export const SECONDARY_BUTTON_CLASS =
  "rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
export const DANGER_BUTTON_CLASS =
  "rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col">
      <span className={LABEL_CLASS}>{label}</span>
      <span className="mt-1">{children}</span>
    </label>
  );
}

const emptyToken = "";
const tokenListeners = new Set<() => void>();
let tokenCache: string | null = null;

/**
 * Membaca token admin dari localStorage sebagai store eksternal.
 *
 * Memakai useSyncExternalStore agar render pertama klien sama dengan server
 * (tokenCache masih null → Snapshot kosong), lalu token yang tersimpan
 * dimuat pada langganan pertama tanpa setState sinkron di dalam efek.
 */
function subscribeToken(callback: () => void): () => void {
  if (tokenListeners.size === 0) {
    window.addEventListener("storage", handleStorage);
  }
  tokenListeners.add(callback);
  return () => {
    tokenListeners.delete(callback);
    if (tokenListeners.size === 0) {
      window.removeEventListener("storage", handleStorage);
    }
  };
}

function handleStorage(event: StorageEvent) {
  if (event.key !== ADMIN_TOKEN_STORAGE_KEY) return;
  tokenCache = null;
  for (const listener of tokenListeners) listener();
}

function getSnapshot(): string {
  if (tokenCache === null) {
    tokenCache = readAdminToken();
  }
  return tokenCache;
}

export function useAdminToken(): readonly [string, (value: string) => void] {
  const token = useSyncExternalStore(subscribeToken, getSnapshot, () => emptyToken);
  const setToken = (value: string) => {
    tokenCache = value;
    saveAdminToken(value);
    for (const listener of tokenListeners) listener();
  };
  return [token, setToken] as const;
}

export function AdminTokenCard({
  token,
  onChange,
}: {
  token: string;
  onChange: (value: string) => void;
}) {
  const [saved, setSaved] = useState(false);

  return (
    <Card>
      <CardHeader
        title="Token admin"
        description="Setiap operasi tulis wajib menyertakan token bersama pada header x-admin-token. Tanpa token yang benar, endpoint tulis menolak permintaan."
      />
      <div className="flex flex-col gap-3 px-5 py-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className={LABEL_CLASS}>Token admin</span>
            <input
              type="password"
              value={token}
              onChange={(event) => {
                onChange(event.target.value);
                setSaved(false);
              }}
              placeholder="Tempel nilai secret ADMIN_TOKEN"
              className={`mt-1 ${INPUT_CLASS}`}
              autoComplete="off"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              const trimmed = token.trim();
              saveAdminToken(trimmed);
              onChange(trimmed);
              setSaved(true);
            }}
            className={PRIMARY_BUTTON_CLASS}
          >
            Simpan token
          </button>
        </div>
        <DataNotice>
          {saved
            ? "Token disimpan di localStorage peramban ini. Ini bukan autentikasi pengguna — hanya penghalang agar Worker publik tidak dapat ditulis sembarang orang."
            : "Token hanya disimpan di peramban Anda dan tidak pernah dikirim ke mana pun selain API aplikasi ini."}
        </DataNotice>
      </div>
    </Card>
  );
}

/** Pita pesan hasil operasi tulis. */
export function FeedbackBanner({
  feedback,
}: {
  feedback: { tone: "ok" | "error"; text: string } | null;
}) {
  if (!feedback) return null;
  return (
    <p
      className={`rounded-lg px-4 py-3 text-sm ring-1 ${
        feedback.tone === "ok"
          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
          : "bg-rose-50 text-rose-700 ring-rose-200"
      }`}
    >
      {feedback.text}
    </p>
  );
}
