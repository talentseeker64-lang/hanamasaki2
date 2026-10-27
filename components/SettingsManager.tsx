"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui";
import {
  AdminTokenCard,
  DANGER_BUTTON_CLASS,
  FeedbackBanner,
  Field,
  INPUT_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  useAdminToken,
} from "@/components/form";
import { sendWrite } from "@/lib/admin-client";
import type { Settings, TeamMember, TeamRole } from "@/lib/types";
import { TEAM_ROLES } from "@/lib/validation";

const ROLE_LABEL: Record<TeamRole, string> = {
  owner: "Pemilik",
  admin: "Admin",
  analyst: "Analis",
  content_manager: "Pengelola konten",
  agency: "Agensi",
};

const ROLE_STYLE: Record<TeamRole, string> = {
  owner: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
  admin: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  analyst: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  content_manager: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  agency: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
};

interface OrganizationDraft {
  name: string;
  plan: string;
  timezone: string;
  defaultPeriod: string;
}

const EMPTY_TEAM: TeamMember = { email: "", name: "", role: "analyst", scope: "" };

export function SettingsManager({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [token, setToken] = useAdminToken();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const [organization, setOrganization] = useState<OrganizationDraft>({
    name: settings.organization.name,
    plan: settings.organization.plan,
    timezone: settings.organization.timezone,
    defaultPeriod: settings.organization.defaultPeriod,
  });

  const [addingMember, setAddingMember] = useState(false);
  const [memberDraft, setMemberDraft] = useState<TeamMember>(EMPTY_TEAM);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TeamMember>(EMPTY_TEAM);

  // Status notifikasi dipegang lokal agar sakelar terasa responsif; nilai
  // server tetap menjadi sumber kebenaran setelah refresh selesai.
  const [notificationState, setNotificationState] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(settings.notifications.map((item) => [item.id, item.enabled])),
  );

  async function submit(
    path: string,
    method: "POST" | "PATCH" | "DELETE",
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

  async function handleSaveOrganization() {
    await submit("/api/settings", "PATCH", organization, "Pengaturan organisasi disimpan.");
  }

  async function handleAddMember() {
    const done = await submit(
      "/api/settings/team",
      "POST",
      { ...memberDraft, email: memberDraft.email.trim().toLowerCase() },
      "Anggota tim ditambahkan.",
    );
    if (done) {
      setMemberDraft(EMPTY_TEAM);
      setAddingMember(false);
    }
  }

  async function handleUpdateMember(email: string) {
    const done = await submit(
      "/api/settings/team",
      "PATCH",
      { ...editDraft, email },
      "Perubahan anggota disimpan.",
    );
    if (done) setEditingEmail(null);
  }

  async function handleDeleteMember(member: TeamMember) {
    if (!window.confirm(`Hapus ${member.name} (${member.email}) dari tim?`)) return;
    await submit(
      `/api/settings/team?email=${encodeURIComponent(member.email)}`,
      "DELETE",
      undefined,
      "Anggota tim dihapus.",
    );
  }

  async function handleToggleNotification(id: string, next: boolean) {
    setNotificationState((state) => ({ ...state, [id]: next }));
    const done = await submit(
      "/api/settings/notifications",
      "PATCH",
      { id, enabled: next },
      next ? "Notifikasi diaktifkan." : "Notifikasi dinonaktifkan.",
    );
    if (!done) {
      setNotificationState((state) => ({ ...state, [id]: !next }));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <AdminTokenCard token={token} onChange={setToken} />

      <FeedbackBanner feedback={feedback} />

      <Card>
        <CardHeader
          title="Organisasi"
          description="Identitas dan pengaturan dasar ruang kerja. Nilainya tersimpan di D1."
        />
        <div className="flex flex-col gap-4 px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Nama organisasi">
              <input
                type="text"
                value={organization.name}
                onChange={(event) =>
                  setOrganization({ ...organization, name: event.target.value })
                }
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Paket">
              <input
                type="text"
                value={organization.plan}
                onChange={(event) =>
                  setOrganization({ ...organization, plan: event.target.value })
                }
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Zona waktu">
              <input
                type="text"
                value={organization.timezone}
                onChange={(event) =>
                  setOrganization({ ...organization, timezone: event.target.value })
                }
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Periode default">
              <input
                type="text"
                value={organization.defaultPeriod}
                onChange={(event) =>
                  setOrganization({ ...organization, defaultPeriod: event.target.value })
                }
                className={INPUT_CLASS}
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSaveOrganization}
              disabled={busy}
              className={PRIMARY_BUTTON_CLASS}
            >
              {busy ? "Menyimpan…" : "Simpan organisasi"}
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Anggota tim dan peran"
          description="Peran menentukan kanal mana yang terlihat dan tindakan apa yang diizinkan."
          action={
            <button
              type="button"
              onClick={() => {
                setAddingMember((value) => !value);
                setMemberDraft(EMPTY_TEAM);
              }}
              className={addingMember ? SECONDARY_BUTTON_CLASS : PRIMARY_BUTTON_CLASS}
            >
              {addingMember ? "Batal" : "Tambah anggota"}
            </button>
          }
        />

        {addingMember ? (
          <div className="border-b border-slate-100 px-5 py-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Email">
                <input
                  type="email"
                  value={memberDraft.email}
                  onChange={(event) =>
                    setMemberDraft({ ...memberDraft, email: event.target.value })
                  }
                  placeholder="nama@contoh.com"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Nama">
                <input
                  type="text"
                  value={memberDraft.name}
                  onChange={(event) => setMemberDraft({ ...memberDraft, name: event.target.value })}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Peran">
                <select
                  value={memberDraft.role}
                  onChange={(event) =>
                    setMemberDraft({ ...memberDraft, role: event.target.value as TeamRole })
                  }
                  className={INPUT_CLASS}
                >
                  {TEAM_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Cakupan akses">
                <input
                  type="text"
                  value={memberDraft.scope}
                  onChange={(event) => setMemberDraft({ ...memberDraft, scope: event.target.value })}
                  placeholder="Semua kanal, hanya baca"
                  className={INPUT_CLASS}
                />
              </Field>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleAddMember}
                disabled={busy}
                className={PRIMARY_BUTTON_CLASS}
              >
                {busy ? "Menyimpan…" : "Simpan anggota"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-medium">Nama</th>
                <th className="px-5 py-3 font-medium">Peran</th>
                <th className="px-5 py-3 font-medium">Cakupan akses</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {settings.team.map((member) => {
                const isEditing = editingEmail === member.email;
                return (
                  <tr key={member.email} className="border-b border-slate-50 last:border-b-0">
                    {isEditing ? (
                      <td colSpan={4} className="px-5 py-4">
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                          <Field label="Email (tetap)">
                            <input
                              type="text"
                              value={member.email}
                              readOnly
                              className={`${INPUT_CLASS} bg-slate-50 text-slate-500`}
                            />
                          </Field>
                          <Field label="Nama">
                            <input
                              type="text"
                              value={editDraft.name}
                              onChange={(event) =>
                                setEditDraft({ ...editDraft, name: event.target.value })
                              }
                              className={INPUT_CLASS}
                            />
                          </Field>
                          <Field label="Peran">
                            <select
                              value={editDraft.role}
                              onChange={(event) =>
                                setEditDraft({ ...editDraft, role: event.target.value as TeamRole })
                              }
                              className={INPUT_CLASS}
                            >
                              {TEAM_ROLES.map((role) => (
                                <option key={role} value={role}>
                                  {ROLE_LABEL[role]}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Cakupan akses">
                            <input
                              type="text"
                              value={editDraft.scope}
                              onChange={(event) =>
                                setEditDraft({ ...editDraft, scope: event.target.value })
                              }
                              className={INPUT_CLASS}
                            />
                          </Field>
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingEmail(null)}
                            className={SECONDARY_BUTTON_CLASS}
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateMember(member.email)}
                            disabled={busy}
                            className={PRIMARY_BUTTON_CLASS}
                          >
                            {busy ? "Menyimpan…" : "Simpan"}
                          </button>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-5 py-3">
                          <p className="font-medium text-slate-800">{member.name}</p>
                          <p className="text-xs text-slate-400">{member.email}</p>
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-semibold ${ROLE_STYLE[member.role]}`}
                          >
                            {ROLE_LABEL[member.role]}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-slate-600">{member.scope}</td>
                        <td className="px-5 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingEmail(member.email);
                                setEditDraft(member);
                              }}
                              className={SECONDARY_BUTTON_CLASS}
                            >
                              Sunting
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteMember(member)}
                              disabled={busy}
                              className={DANGER_BUTTON_CLASS}
                            >
                              Hapus
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Preferensi notifikasi"
          description="Peringatan dikirim melalui email dan kanal tim. Status ini tersimpan di D1."
        />
        <ul className="flex flex-col divide-y divide-slate-100">
          {settings.notifications.map((item) => {
            const enabled = notificationState[item.id] ?? item.enabled;
            return (
              <li key={item.id} className="flex items-start justify-between gap-4 px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-slate-800">{item.label}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{item.detail}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  disabled={busy}
                  onClick={() => handleToggleNotification(item.id, !enabled)}
                  className={`mt-0.5 shrink-0 rounded-full px-3 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    enabled
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                      : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                  }`}
                >
                  {enabled ? "Aktif" : "Nonaktif"}
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
