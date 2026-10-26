const numberId = new Intl.NumberFormat("id-ID");

const decimalId = (digits: number) =>
  new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const compactId = new Intl.NumberFormat("id-ID", {
  notation: "compact",
  maximumFractionDigits: 2,
});

const dateShortId = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const dateLongId = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const dateTimeId = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

export function formatNumber(value: number): string {
  return numberId.format(Math.round(value));
}

export function formatCompact(value: number): string {
  return compactId.format(Math.round(value));
}

export function formatPercent(value: number, digits = 1): string {
  return `${decimalId(digits).format(value)}%`;
}

export function formatDelta(value: number, digits = 1): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${decimalId(digits).format(Math.abs(value))}%`;
}

export function formatPoints(value: number, digits = 1): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${decimalId(digits).format(Math.abs(value))} poin`;
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes === 0) return `${rest} dtk`;
  return `${minutes}m ${rest}s`;
}

export function formatDateShort(date: string): string {
  return dateShortId.format(new Date(`${date}T00:00:00Z`));
}

export function formatDateLong(date: string): string {
  return dateLongId.format(new Date(`${date}T00:00:00Z`));
}

export function formatDateTime(iso: string): string {
  return dateTimeId.format(new Date(iso));
}

export function platformLabel(platform: string): string {
  switch (platform) {
    case "instagram":
      return "Instagram";
    case "tiktok":
      return "TikTok";
    case "youtube":
      return "YouTube";
    case "facebook":
      return "Facebook";
    case "website":
      return "Website";
    default:
      return platform;
  }
}
