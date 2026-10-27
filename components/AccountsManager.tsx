"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, DataNotice } from "@/components/ui";
import {
  AdminTokenCard,
  DANGER_BUTTON_CLASS,
  FeedbackBanner,
  INPUT_CLASS as INPUT,
  LABEL_CLASS as LABEL,
  PRIMARY_BUTTON_CLASS as PRIMARY_BUTTON,
  SECONDARY_BUTTON_CLASS as SECONDARY_BUTTON,
  useAdminToken,
} from "@/components/form";
import { sendWrite } from "@/lib/admin-client";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { ChannelAccount, ConnectionState, CredentialSummary, Platform } from "@/lib/types";
import { CONNECTION_STATES, PLATFORMS } from "@/lib/validation";

const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  facebook: "Facebook",
};

const CONNECTION_LABEL: Record<ConnectionState, string> = {
  connected: "Terhubung",
  needs_review: "Perlu ditinjau",
  not_connected: "Belum terhubung",
};

const CONNECTION_STYLE: Record<ConnectionState, string> = {
  connected: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  needs_review: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  not_connected: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

interface AccountDraft {
  platform: Platform;
  handle: string;
  displayName: string;
  connection: ConnectionState;
  scopes: string;
  limitation: string;
}

interface CredentialDraft {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

const EMPTY_ACCOUNT: AccountDraft = {
  platform: "instagram",
  handle: "",
  displayName: "",
  connection: "not_connected",
  scopes: "",
  limitation: "",
};

const EMPTY_CREDENTIAL: CredentialDraft = {
  clientId: "",
  clientSecret: "",
  accessToken: "",
  refreshToken: "",
  expiresAt: "",
};

function toDraft(account: ChannelAccount): AccountDraft {
  return {
    platform: account.platform,
    handle: account.handle,
    displayName: account.displayName,
    connection: account.connection,
    scopes: account.scopes.join(", "),
    limitation: account.limitation,
  };
}

/** "a, b , c" -> ["a","b","c"]; string kosong -> []. */
function parseScopes(value: string): string[] {
  return value
    .split(",")
    .map((scope) => scope.trim())
    .filter((scope) => scope !== "");
}

function toAccountPayload(draft: AccountDraft) {
  return {
    platform: draft.platform,
    handle: draft.handle,
    displayName: draft.displayName,
    connection: draft.connection,
    scopes: parseScopes(draft.scopes),
    limitation: draft.limitation,
  };
}

function toCredentialPayload(draft: CredentialDraft) {
  return {
    clientId: draft.clientId,
    clientSecret: draft.clientSecret,
    accessToken: draft.accessToken,
    refreshToken: draft.refreshToken.trim() === "" ? null : draft.refreshToken,
    expiresAt: draft.expiresAt.trim() === "" ? null : draft.expiresAt,
  };
}

export function AccountsManager({
  accounts,
  credentials,
}: {
  accounts: ChannelAccount[];
  credentials: CredentialSummary[];
}) {
  const router = useRouter();
  const [token, setToken] = useAdminToken();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<AccountDraft>(EMPTY_ACCOUNT);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<AccountDraft>(EMPTY_ACCOUNT);

  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [credentialDraft, setCredentialDraft] = useState<CredentialDraft>(EMPTY_CREDENTIAL);

  const credentialOf = (accountId: string) =>
    credentials.find((item) => item.accountId === accountId);

  async function submit(
    path: string,
    method: "POST" | "PATCH" | "PUT" | "DELETE",
    body: unknown,
    successText: string,
  ): Promise<boolean> {
    setBusy(true);
    setFeedback(null);
    const outcome = await sendWrite(token, path, method, body);
    setBusy(false);

    if (!outcome.ok) {
      setFeedback({ tone: "error", text: outcome.error });
      return false;
    }
    setFeedback({ tone: "ok", text: successText });
    router.refresh();
    return true;
  }

  async function handleCreate() {
    const done = await submit("/api/accounts", "POST", toAccountPayload(createDraft), "Akun baru ditambahkan.");
    if (done) {
      setCreateDraft(EMPTY_ACCOUNT);
      setCreating(false);
    }
  }

  async function handleUpdate(id: string) {
    const done = await submit(
      `/api/accounts/${encodeURIComponent(id)}`,
      "PATCH",
      toAccountPayload(editDraft),
      "Perubahan akun disimpan.",
    );
    if (done) setEditingId(null);
  }

  async function handleDelete(account: ChannelAccount) {
    if (!window.confirm(`Hapus akun "${account.displayName}" beserta kredensialnya?`)) return;
    await submit(
      `/api/accounts/${encodeURIComponent(account.id)}`,
      "DELETE",
      undefined,
      "Akun dihapus.",
    );
  }

  async function handleSaveCredential(id: string) {
    const done = await submit(
      `/api/accounts/${encodeURIComponent(id)}/credentials`,
      "PUT",
      toCredentialPayload(credentialDraft),
      "Kredensial terenkripsi disimpan.",
    );
    if (done) {
      setCredentialId(null);
      setCredentialDraft(EMPTY_CREDENTIAL);
    }
  }

  async function handleDeleteCredential(id: string) {
    if (!window.confirm("Hapus kredensial tersimpan untuk akun ini?")) return;
    await submit(
      `/api/accounts/${encodeURIComponent(id)}/credentials`,
      "DELETE",
      undefined,
      "Kredensial dihapus.",
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <AdminTokenCard token={token} onChange={setToken} />

      <FeedbackBanner feedback={feedback} />

      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-slate-900">
          Akun yang dipantau ({accounts.length})
        </h2>
        <button
          type="button"
          onClick={() => {
            setCreating((value) => !value);
            setCreateDraft(EMPTY_ACCOUNT);
          }}
          className={creating ? SECONDARY_BUTTON : PRIMARY_BUTTON}
        >
          {creating ? "Batal" : "Tambah akun"}
        </button>
      </div>

      {creating ? (
        <Card>
          <CardHeader
            title="Akun baru"
            description="Hanya identitas dan izin yang diisi di sini. Metrik pengikut dan tayangan akan terisi saat sinkronisasi platform berjalan."
          />
          <div className="flex flex-col gap-4 px-5 py-5">
            <AccountFields draft={createDraft} onChange={setCreateDraft} />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleCreate}
                disabled={busy}
                className={PRIMARY_BUTTON}
              >
                {busy ? "Menyimpan…" : "Simpan akun"}
              </button>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {accounts.map((account) => {
          const credential = credentialOf(account.id);
          const isEditing = editingId === account.id;
          const isEditingCredential = credentialId === account.id;

          return (
            <Card key={account.id}>
              <CardHeader
                title={account.displayName}
                description={account.handle}
                action={
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold ${CONNECTION_STYLE[account.connection]}`}
                  >
                    {CONNECTION_LABEL[account.connection]}
                  </span>
                }
              />
              <div className="flex flex-col gap-4 px-5 py-5">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    {PLATFORM_LABEL[account.platform]}
                  </span>
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
                    <dt className="text-[11px] text-slate-400">Sinkronisasi terakhir</dt>
                    <dd className="text-sm text-slate-700">
                      {account.lastSyncAt ? formatDateTime(account.lastSyncAt) : "Belum tersinkron"}
                    </dd>
                  </div>
                </dl>

                <div>
                  <p className={LABEL}>Izin (scopes)</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {account.scopes.length === 0 ? (
                      <span className="text-xs text-slate-400">Belum ada izin tercatat.</span>
                    ) : (
                      account.scopes.map((scope) => (
                        <span
                          key={scope}
                          className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600"
                        >
                          {scope}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <p className={LABEL}>Kredensial OAuth</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {credential
                      ? `Tersimpan (client ID ${credential.clientId}, diperbarui ${formatDateTime(credential.updatedAt)}). Rahasia tidak pernah ditampilkan kembali.`
                      : "Belum ada kredensial tersimpan."}
                  </p>
                </div>

                <DataNotice>{account.limitation || "Tidak ada catatan keterbatasan data."}</DataNotice>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(isEditing ? null : account.id);
                      setEditDraft(toDraft(account));
                      if (!isEditing) setCredentialId(null);
                    }}
                    className={SECONDARY_BUTTON}
                  >
                    {isEditing ? "Tutup" : "Sunting akun"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCredentialId(isEditingCredential ? null : account.id);
                      setCredentialDraft(EMPTY_CREDENTIAL);
                      if (!isEditingCredential) setEditingId(null);
                    }}
                    className={SECONDARY_BUTTON}
                  >
                    {isEditingCredential ? "Tutup" : "Atur kredensial"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(account)}
                    disabled={busy}
                    className={DANGER_BUTTON_CLASS}
                  >
                    Hapus
                  </button>
                </div>

                {isEditing ? (
                  <div className="flex flex-col gap-4 rounded-lg border border-slate-200 p-4">
                    <AccountFields draft={editDraft} onChange={setEditDraft} />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleUpdate(account.id)}
                        disabled={busy}
                        className={PRIMARY_BUTTON}
                      >
                        {busy ? "Menyimpan…" : "Simpan perubahan"}
                      </button>
                    </div>
                  </div>
                ) : null}

                {isEditingCredential ? (
                  <div className="flex flex-col gap-4 rounded-lg border border-slate-200 p-4">
                    <p className="text-xs leading-relaxed text-slate-500">
                      Nilai rahasia dikirim ke API lalu disimpan terenkripsi (AES-256-GCM). Nilai
                      lama akan diganti seluruhnya, dan tidak dapat ditampilkan kembali setelah
                      tersimpan.
                    </p>
                    <CredentialFields draft={credentialDraft} onChange={setCredentialDraft} />
                    <div className="flex flex-wrap justify-end gap-2">
                      {credential ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteCredential(account.id)}
                          disabled={busy}
                          className={DANGER_BUTTON_CLASS}
                        >
                          Hapus kredensial
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleSaveCredential(account.id)}
                        disabled={busy}
                        className={PRIMARY_BUTTON}
                      >
                        {busy ? "Menyimpan…" : "Simpan kredensial"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function AccountFields({
  draft,
  onChange,
}: {
  draft: AccountDraft;
  onChange: (draft: AccountDraft) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label>
        <span className={LABEL}>Platform</span>
        <select
          value={draft.platform}
          onChange={(event) =>
            onChange({ ...draft, platform: event.target.value as Platform })
          }
          className={`mt-1 ${INPUT}`}
        >
          {PLATFORMS.map((platform) => (
            <option key={platform} value={platform}>
              {PLATFORM_LABEL[platform]}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span className={LABEL}>Status koneksi</span>
        <select
          value={draft.connection}
          onChange={(event) =>
            onChange({ ...draft, connection: event.target.value as ConnectionState })
          }
          className={`mt-1 ${INPUT}`}
        >
          {CONNECTION_STATES.map((state) => (
            <option key={state} value={state}>
              {CONNECTION_LABEL[state]}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span className={LABEL}>Nama tampilan</span>
        <input
          type="text"
          value={draft.displayName}
          onChange={(event) => onChange({ ...draft, displayName: event.target.value })}
          placeholder="Hanamasak Studio"
          className={`mt-1 ${INPUT}`}
        />
      </label>

      <label>
        <span className={LABEL}>Handle</span>
        <input
          type="text"
          value={draft.handle}
          onChange={(event) => onChange({ ...draft, handle: event.target.value })}
          placeholder="@hanamasak.studio"
          className={`mt-1 ${INPUT}`}
        />
      </label>

      <label className="sm:col-span-2">
        <span className={LABEL}>Izin (pisahkan dengan koma)</span>
        <input
          type="text"
          value={draft.scopes}
          onChange={(event) => onChange({ ...draft, scopes: event.target.value })}
          placeholder="instagram_basic, instagram_manage_insights"
          className={`mt-1 ${INPUT}`}
        />
      </label>

      <label className="sm:col-span-2">
        <span className={LABEL}>Catatan keterbatasan data</span>
        <textarea
          value={draft.limitation}
          onChange={(event) => onChange({ ...draft, limitation: event.target.value })}
          rows={2}
          placeholder="Catatan tentang metrik yang tidak tersedia dari API platform ini."
          className={`mt-1 ${INPUT}`}
        />
      </label>
    </div>
  );
}

function CredentialFields({
  draft,
  onChange,
}: {
  draft: CredentialDraft;
  onChange: (draft: CredentialDraft) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="sm:col-span-2">
        <span className={LABEL}>Client ID</span>
        <input
          type="text"
          value={draft.clientId}
          onChange={(event) => onChange({ ...draft, clientId: event.target.value })}
          className={`mt-1 ${INPUT}`}
          autoComplete="off"
        />
      </label>

      <label className="sm:col-span-2">
        <span className={LABEL}>Client secret</span>
        <input
          type="password"
          value={draft.clientSecret}
          onChange={(event) => onChange({ ...draft, clientSecret: event.target.value })}
          className={`mt-1 ${INPUT}`}
          autoComplete="new-password"
        />
      </label>

      <label className="sm:col-span-2">
        <span className={LABEL}>Access token</span>
        <input
          type="password"
          value={draft.accessToken}
          onChange={(event) => onChange({ ...draft, accessToken: event.target.value })}
          className={`mt-1 ${INPUT}`}
          autoComplete="new-password"
        />
      </label>

      <label>
        <span className={LABEL}>Refresh token (opsional)</span>
        <input
          type="password"
          value={draft.refreshToken}
          onChange={(event) => onChange({ ...draft, refreshToken: event.target.value })}
          className={`mt-1 ${INPUT}`}
          autoComplete="new-password"
        />
      </label>

      <label>
        <span className={LABEL}>Kedaluwarsa (ISO 8601, opsional)</span>
        <input
          type="text"
          value={draft.expiresAt}
          onChange={(event) => onChange({ ...draft, expiresAt: event.target.value })}
          placeholder="2026-11-30T00:00:00Z"
          className={`mt-1 ${INPUT}`}
          autoComplete="off"
        />
      </label>
    </div>
  );
}
