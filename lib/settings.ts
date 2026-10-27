import { connection } from "next/server";
import { getDb, rowsOf } from "./db";
import type {
  NotificationPreference,
  Organization,
  Settings,
  TeamMember,
  TeamRole,
} from "./types";

interface OrganizationRow {
  id: string;
  name: string;
  plan: string;
  timezone: string;
  default_period: string;
}

interface TeamRow {
  email: string;
  name: string;
  role: string;
  scope: string;
}

interface NotificationRow {
  id: string;
  label: string;
  detail: string;
  enabled: number;
}

function toOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    plan: row.plan,
    timezone: row.timezone,
    defaultPeriod: row.default_period,
  };
}

function toTeamMember(row: TeamRow): TeamMember {
  return { email: row.email, name: row.name, role: row.role as TeamRole, scope: row.scope };
}

function toNotification(row: NotificationRow): NotificationPreference {
  return { id: row.id, label: row.label, detail: row.detail, enabled: row.enabled === 1 };
}

/**
 * Membaca pengaturan organisasi dari D1 pada setiap request.
 *
 * Terpisah dari `getDataset()` karena ini konfigurasi ruang kerja, bukan data
 * analitik kanal.
 */
export async function getSettings(): Promise<Settings> {
  await connection();
  const db = await getDb();

  const [organizationResult, teamResult, notificationResult] = await db.batch([
    db.prepare("SELECT id, name, plan, timezone, default_period FROM organization LIMIT 1"),
    db.prepare("SELECT email, name, role, scope FROM team_members ORDER BY sort_order"),
    db.prepare("SELECT id, label, detail, enabled FROM notifications ORDER BY sort_order"),
  ]);

  const organization = rowsOf<OrganizationRow>(organizationResult)[0];
  if (!organization) {
    throw new Error(
      "Tabel organization masih kosong. Jalankan migrasi dan seed D1 terlebih dahulu.",
    );
  }

  return {
    organization: toOrganization(organization),
    team: rowsOf<TeamRow>(teamResult).map(toTeamMember),
    notifications: rowsOf<NotificationRow>(notificationResult).map(toNotification),
  };
}
