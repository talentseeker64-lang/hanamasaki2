import { RANGE_DAYS, WINDOW } from "./data";
import {
  formatCompact,
  formatDateShort,
  formatDelta,
  formatNumber,
  formatPercent,
  formatPoints,
  platformLabel,
} from "./format";
import {
  INTENT_LABEL,
  bestLag,
  commentAnalysis,
  engagementRateOf,
  kpiSummary,
  pctChange,
  performanceByFormat,
  performanceByHour,
  performanceByTopic,
  performanceByWeekday,
  platformAggregates,
  safeDiv,
  sum,
  topContent,
  trendPoints,
  webTotals,
  windowContent,
  windowSum,
} from "./metrics";
import type {
  CopilotAnswer,
  CopilotFactor,
  Dataset,
  Evidence,
  Insight,
  Severity,
} from "./types";

/* ------------------------------------------------------------------ */
/* Utilitas statistik                                                  */
/* ------------------------------------------------------------------ */

function mean(values: number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(sum(values.map((value) => (value - m) ** 2)) / (values.length - 1));
}

/** Regresi linear sederhana: mengembalikan kemiringan dan titik potong. */
function linearFit(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0 };
  const meanX = (n - 1) / 2;
  const meanY = mean(values);
  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    numerator += (index - meanX) * (value - meanY);
    denominator += (index - meanX) ** 2;
  });
  const slope = denominator === 0 ? 0 : numerator / denominator;
  return { slope, intercept: meanY - slope * meanX };
}

export function forecastSeries(values: number[], horizon: number): number[] {
  const { slope, intercept } = linearFit(values);
  return Array.from({ length: horizon }, (_, index) =>
    Math.max(0, Math.round(intercept + slope * (values.length + index))),
  );
}

export interface Anomaly {
  id: string;
  date: string;
  metric: string;
  value: number;
  baseline: number;
  zScore: number;
  severity: Severity;
  direction: "naik" | "turun";
}

/* ------------------------------------------------------------------ */
/* Deteksi anomali                                                     */
/* ------------------------------------------------------------------ */

export function detectAnomalies(dataset: Dataset): Anomaly[] {
  const anomalies: Anomaly[] = [];

  const dailySocial = new Map<string, number>();
  for (const row of dataset.social) {
    dailySocial.set(row.date, (dailySocial.get(row.date) ?? 0) + row.views);
  }
  const socialSeries = [...dailySocial.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const baselineSocial = socialSeries
    .slice(-RANGE_DAYS * 2, -RANGE_DAYS)
    .map((entry) => entry[1]);
  const socialMean = mean(baselineSocial);
  const socialSd = stdDev(baselineSocial);

  const webBaseline = dataset.web.slice(-RANGE_DAYS * 2, -RANGE_DAYS).map((row) => row.sessions);
  const webMean = mean(webBaseline);
  const webSd = stdDev(webBaseline);

  for (const [date, value] of socialSeries.slice(-RANGE_DAYS)) {
    if (socialSd === 0) break;
    const zScore = (value - socialMean) / socialSd;
    if (Math.abs(zScore) >= 2) {
      anomalies.push({
        id: `social-${date}`,
        date,
        metric: "Tayangan sosial harian",
        value,
        baseline: socialMean,
        zScore,
        severity: Math.abs(zScore) >= 2.5 ? "high" : "medium",
        direction: zScore > 0 ? "naik" : "turun",
      });
    }
  }

  for (const row of dataset.web.slice(-RANGE_DAYS)) {
    if (webSd === 0) break;
    const zScore = (row.sessions - webMean) / webSd;
    if (Math.abs(zScore) >= 2) {
      anomalies.push({
        id: `web-${row.date}`,
        date: row.date,
        metric: "Sesi website harian",
        value: row.sessions,
        baseline: webMean,
        zScore,
        severity: Math.abs(zScore) >= 2.5 ? "high" : "medium",
        direction: zScore > 0 ? "naik" : "turun",
      });
    }
  }

  return anomalies.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore)).slice(0, 6);
}

/* ------------------------------------------------------------------ */
/* Diagnosis utama: kenapa trafik website turun padahal views naik      */
/* ------------------------------------------------------------------ */

export interface TrafficDiagnosis {
  headline: string;
  body: string[];
  factors: CopilotFactor[];
  actions: string[];
  confidence: CopilotAnswer["confidence"];
  dataPoints: string[];
}

export function diagnoseTrafficGap(dataset: Dataset): TrafficDiagnosis {
  const recent = platformAggregates(dataset, WINDOW);
  const viewsNow = sum(recent.map((row) => row.views));
  const viewsPrev = sum(recent.map((row) => row.viewsPrev));
  const clicksNow = sum(recent.map((row) => row.linkClicks));
  const clicksPrev = sum(recent.map((row) => row.linkClicksPrev));

  const sessionsNow = windowSum(
    dataset.web.map((row) => row.sessions),
    WINDOW,
  );
  const sessionsPrev = windowSum(
    dataset.web.map((row) => row.sessions),
    WINDOW,
    WINDOW,
  );

  const instagram = recent.find((row) => row.platform === "instagram");
  const organic = dataset.sources.find((row) => row.channel === "organic");
  const promoPage = dataset.pages.find((page) => page.path === "/promo-oktober");
  const totals = webTotals(dataset);
  const socialSources = dataset.sources.filter((row) => row.channel === "social");
  const socialSessionsNow = sum(socialSources.map((row) => row.sessions));
  const socialSessionsPrev = sum(socialSources.map((row) => row.sessionsPrev));

  const viewsDelta = pctChange(viewsNow, viewsPrev);
  const clicksDelta = pctChange(clicksNow, clicksPrev);
  const sessionsDelta = pctChange(sessionsNow, sessionsPrev);

  const ctrNow = safeDiv(clicksNow, viewsNow) * 100;
  const ctrPrev = safeDiv(clicksPrev, viewsPrev) * 100;

  const correlated = (() => {
    const points = trendPoints(dataset, RANGE_DAYS * 2);
    const lag = bestLag(
      points.map((point) => point.socialViews),
      points.map((point) => point.webSessions),
    );
    return lag;
  })();

  const factors: CopilotFactor[] = [];

  if (instagram) {
    factors.push({
      label: "Klik tautan keluar tidak ikut naik bersama tayangan Instagram",
      detail: `Tayangan Instagram naik ${formatDelta(pctChange(instagram.views, instagram.viewsPrev))}, tetapi klik tautan keluar justru ${formatDelta(pctChange(instagram.linkClicks, instagram.linkClicksPrev))}. Rasio klik turun dari ${formatPercent(instagram.linkCtrPrev, 2)} ke ${formatPercent(instagram.linkCtr, 2)} dari tayangan. Artinya audiens menonton, tetapi tidak melanjutkan ke website.`,
      evidence: [
        {
          label: "Tayangan Instagram (7 hari)",
          value: formatCompact(instagram.views),
          change: pctChange(instagram.views, instagram.viewsPrev),
        },
        {
          label: "Klik tautan keluar (7 hari)",
          value: formatCompact(instagram.linkClicks),
          change: pctChange(instagram.linkClicks, instagram.linkClicksPrev),
        },
        {
          label: "Rasio klik / tayangan",
          value: `${formatPercent(instagram.linkCtrPrev, 2)} → ${formatPercent(instagram.linkCtr, 2)}`,
          change: pctChange(instagram.linkCtr, instagram.linkCtrPrev),
        },
      ],
    });
  }

  if (organic) {
    const droppedQuery = [...dataset.search].sort(
      (a, b) => pctChange(a.clicks, a.clicksPrev) - pctChange(b.clicks, b.clicksPrev),
    )[0];
    factors.push({
      label: "Trafik pencarian organik menurun di periode yang sama",
      detail: `Sesi dari Google Organic ${formatDelta(pctChange(organic.sessions, organic.sessionsPrev))}. Penurunan terbesar berasal dari kata kunci “${droppedQuery.query}” yang posisinya bergeser dari ${droppedQuery.positionPrev} ke ${droppedQuery.position}. Karena organic adalah kanal terbesar, penurunan ini berdampak paling besar ke total sesi.`,
      evidence: [
        {
          label: "Sesi Google Organic",
          value: formatNumber(organic.sessions),
          change: pctChange(organic.sessions, organic.sessionsPrev),
        },
        {
          label: `Posisi “${droppedQuery.query}”`,
          value: `${droppedQuery.positionPrev} → ${droppedQuery.position}`,
        },
        {
          label: "Kontribusi organic terhadap sesi",
          value: formatPercent(safeDiv(organic.sessions, totals.sessions) * 100),
        },
      ],
    });
  }

  if (promoPage) {
    factors.push({
      label: "Konversi halaman kampanye melemah",
      detail: `Halaman ${promoPage.path} menerima ${formatNumber(promoPage.views30)} kunjungan, tetapi konversinya ${formatDelta(pctChange(promoPage.conversions7, promoPage.conversions7Prev))} pada 7 hari terakhir. Penurunan konversi berarti sebagian penurunan angka konversi tidak hanya disebabkan oleh trafik yang menurun.`,
      evidence: [
        {
          label: "Konversi /promo-oktober (7 hari)",
          value: formatNumber(promoPage.conversions7),
          change: pctChange(promoPage.conversions7, promoPage.conversions7Prev),
        },
        {
          label: "Rasio pentalan halaman",
          value: formatPercent(promoPage.exitRate),
        },
        {
          label: "Rata-rata durasi kunjungan",
          value: `${promoPage.avgSeconds} detik`,
        },
      ],
    });
  }

  factors.push({
    label: "Komposisi sumber trafik bergeser",
    detail: `Sesi dari media sosial ${formatDelta(pctChange(socialSessionsNow, socialSessionsPrev))} sementara total sesi ${formatDelta(sessionsDelta)}. Korelasi tayangan sosial dengan sesi website pada jeda ${correlated.lag} hari adalah ${correlated.r.toFixed(2)}, sehingga perubahan sosial tidak langsung menjelaskan seluruh pergerakan trafik.`,
    evidence: [
      {
        label: "Sesi dari media sosial (7 hari)",
        value: formatNumber(socialSessionsNow),
        change: pctChange(socialSessionsNow, socialSessionsPrev),
      },
      {
        label: "Total sesi website (7 hari)",
        value: formatNumber(sessionsNow),
        change: sessionsDelta,
      },
      {
        label: "Korelasi sosial → sesi",
        value: `r = ${correlated.r.toFixed(2)} (jeda ${correlated.lag} hari)`,
      },
    ],
  });

  const headline = `Tayangan sosial naik ${formatDelta(viewsDelta)}, tetapi sesi website ${formatDelta(sessionsDelta)} karena klik tautan keluar turun ${formatDelta(clicksDelta)} dan trafik organic ikut melemah.`;

  const body = [
    `Pada 7 hari terakhir, tayangan sosial mencapai ${formatCompact(viewsNow)} (${formatDelta(viewsDelta)}). Kenaikan ini tidak diikuti oleh klik tautan keluar yang hanya ${formatCompact(clicksNow)} (${formatDelta(clicksDelta)}), sehingga rasio klik terhadap tayangan turun dari ${formatPercent(ctrPrev, 2)} ke ${formatPercent(ctrNow, 2)}.`,
    `Penurunan klik menjelaskan sebagian penurunan sesi website, yaitu dari ${formatNumber(sessionsPrev)} menjadi ${formatNumber(sessionsNow)} sesi (${formatDelta(sessionsDelta)}). Karena trafik organic juga turun ${organic ? formatDelta(pctChange(organic.sessions, organic.sessionsPrev)) : "—"}, ada dua penyebab yang berjalan bersamaan, bukan satu penyebab tunggal.`,
    `Angka konversi turun lebih dalam daripada sesi (${formatDelta(pctChange(totals.conversions, totals.conversionsPrev))} vs ${formatDelta(pctChange(totals.sessions, totals.sessionsPrev))}), yang menandakan masalah tambahan pada tahap akhir perjalanan pengunjung, bukan hanya pada jumlah kunjungan.`,
  ];

  const actions = [
    "Periksa tautan di bio dan deskripsi: pastikan tautan kampanye masih aktif, cepat dibuka, dan mengarah ke halaman yang sesuai.",
    "Uji dua versi CTA pada 3 konten terbaik untuk memulihkan rasio klik tanpa menambah tayangan.",
    "Perbaiki halaman /promo-oktober: perpendek jalur menuju tombol utama dan sinkronkan pesan dengan konten sosial terbaru.",
    "Tinjau ulang kata kunci yang posisinya turun dan perbarui halaman terkait sebelum menambah anggaran iklan.",
  ];

  const dataPoints = [
    `Tayangan sosial 7 hari: ${formatNumber(viewsNow)} vs ${formatNumber(viewsPrev)}`,
    `Klik tautan keluar 7 hari: ${formatNumber(clicksNow)} vs ${formatNumber(clicksPrev)}`,
    `Sesi website 7 hari: ${formatNumber(sessionsNow)} vs ${formatNumber(sessionsPrev)}`,
    `Sumber: ${dataset.social.length} baris metrik sosial, ${dataset.web.length} baris metrik website`,
  ];

  const confidence =
    Math.abs(correlated.r) > 0.4 && Math.abs(sessionsDelta) > 4 ? "tinggi" : "sedang";

  return { headline, body, factors, actions, confidence, dataPoints };
}

/* ------------------------------------------------------------------ */
/* Insight terprioritas                                                */
/* ------------------------------------------------------------------ */

function severityFromChange(change: number, threshold = 12): Severity {
  const magnitude = Math.abs(change);
  if (magnitude >= threshold * 2) return "high";
  if (magnitude >= threshold) return "medium";
  if (magnitude >= threshold / 2) return "low";
  return "info";
}

export function buildInsights(dataset: Dataset): Insight[] {
  const insights: Insight[] = [];
  const kpi = kpiSummary(dataset);
  const diagnosis = diagnoseTrafficGap(dataset);
  const comments = commentAnalysis(dataset);
  const formats = performanceByFormat(dataset);
  const hours = performanceByHour(dataset);
  const topics = performanceByTopic(dataset);
  const weekdays = performanceByWeekday(dataset);
  const anomalies = detectAnomalies(dataset);
  const contentCount = windowContent(dataset).length;

  const viewsChange = pctChange(kpi.totalViews, kpi.totalViewsPrev);
  const sessionsChange = pctChange(kpi.sessions, kpi.sessionsPrev);

  insights.push({
    id: "ins-views",
    title: `Tayangan sosial ${formatDelta(viewsChange)} pada ${RANGE_DAYS} hari terakhir`,
    severity: "info",
    category: "Monitoring",
    narrative: `Total tayangan lintas kanal mencapai ${formatCompact(kpi.totalViews)} (${formatDelta(viewsChange)}). Kenaikan ini perlu dibaca bersama rasio interaksi ${formatPercent(kpi.engagementRate)} (${formatPoints(kpi.engagementRate - kpi.engagementRatePrev)}) agar tidak menyesatkan.`,
    evidence: [
      {
        label: `Tayangan ${RANGE_DAYS} hari`,
        value: formatNumber(kpi.totalViews),
        change: viewsChange,
      },
      {
        label: "Rasio interaksi",
        value: formatPercent(kpi.engagementRate),
      },
      {
        label: "Interaksi periode sebelumnya",
        value: formatPercent(kpi.engagementRatePrev),
      },
    ],
    actions: [
      "Bandingkan kanal dengan pertumbuhan tayangan tertinggi sebelum menaikkan frekuensi unggahan.",
      "Pantau apakah kenaikan tayangan diikuti kenaikan pengikut, bukan hanya impresi.",
    ],
  });

  insights.push({
    id: "ins-gap",
    title: "Tayangan naik tidak otomatis menjadi kunjungan website",
    severity: "high",
    category: "Lintas kanal",
    narrative: diagnosis.headline,
    evidence: diagnosis.factors[0]?.evidence ?? [],
    actions: diagnosis.actions.slice(0, 3),
  });

  insights.push({
    id: "ins-sessions",
    title: `Sesi website ${formatDelta(sessionsChange)} pada ${RANGE_DAYS} hari terakhir`,
    severity: severityFromChange(sessionsChange, 8),
    category: "Website",
    narrative: `Website menerima ${formatNumber(kpi.sessions)} sesi (${formatDelta(sessionsChange)}). Tingkat konversi ${formatPercent(kpi.conversions / kpi.sessions * 100)} dengan ${formatNumber(kpi.conversions)} konversi (${formatDelta(pctChange(kpi.conversions, kpi.conversionsPrev))}).`,
    evidence: [
      { label: "Sesi website", value: formatNumber(kpi.sessions), change: sessionsChange },
      { label: "Pengunjung baru", value: formatNumber(webTotals(dataset).newUsers) },
      {
        label: "Tingkat konversi",
        value: formatPercent(kpi.conversions / kpi.sessions * 100),
        change: pctChange(kpi.conversions, kpi.conversionsPrev),
      },
    ],
    actions: [
      "Periksa halaman masuk dengan rasio pentalan tertinggi.",
      "Pastikan pesan di konten sosial selaras dengan pesan di halaman tujuan.",
    ],
  });

  const complaintShare = safeDiv(comments.complaints.length, comments.total) * 100;
  const topIntent = [...comments.intents].sort((a, b) => b.count - a.count)[0];
  insights.push({
    id: "ins-comments",
    title: `Sentimen audiens ${formatDelta(pctChange(comments.positiveShare, comments.positiveSharePrev))} dengan ${formatNumber(comments.total)} komentar dianalisis`,
    severity: severityFromChange(pctChange(comments.positiveShare, comments.positiveSharePrev), 6),
    category: "Komentar",
    narrative: `Sentimen positif ${formatPercent(comments.positiveShare)} (periode sebelumnya ${formatPercent(comments.positiveSharePrev)}), negatif ${formatPercent(comments.negativeShare)}. Kategori terbanyak adalah ${topIntent.label.toLowerCase()} (${formatNumber(topIntent.count)} komentar) dan ${comments.unanswered.length} pertanyaan bernilai tinggi belum dijawab.`,
    evidence: [
      { label: "Sentimen positif", value: formatPercent(comments.positiveShare), change: pctChange(comments.positiveShare, comments.positiveSharePrev) },
      { label: "Sentimen negatif", value: formatPercent(comments.negativeShare), change: pctChange(comments.negativeShare, comments.negativeSharePrev) },
      { label: "Keluhan yang perlu ditindak", value: formatNumber(comments.complaints.length) },
    ],
    actions: [
      "Jawab pertanyaan dengan jumlah suka tertinggi dalam 24 jam.",
      "Kelompokkan keluhan berulang dan jadikan satu konten penjelasan resmi.",
      complaintShare > 8
        ? "Tinjau ulang SLA balasan karena proporsi keluhan di atas ambang wajar."
        : "Pertahankan kecepatan balasan karena proporsi keluhan masih terkendali.",
    ],
  });

  const bestFormat = formats[0];
  const bestHour = hours[0];
  const bestWeekday = weekdays[0];
  if (bestFormat && bestHour && bestWeekday) {
    insights.push({
      id: "ins-content",
      title: `Format ${bestFormat.label} unggul dengan interaksi ${formatPercent(bestFormat.avgEngagement)}`,
      severity: "info",
      category: "Konten",
      narrative: `Dari ${formatNumber(contentCount)} konten dalam periode ini, format ${bestFormat.label} mencatat rata-rata interaksi ${formatPercent(bestFormat.avgEngagement)} dan rata-rata ${formatCompact(bestFormat.avgViews)} tayangan. Waktu tayang terbaik di ${bestHour.label} pada hari ${bestWeekday.label}.`,
      evidence: [
        { label: `Format ${bestFormat.label}`, value: `${formatPercent(bestFormat.avgEngagement)} interaksi` },
        { label: `Jam ${bestHour.label}`, value: `${formatPercent(bestHour.avgEngagement)} interaksi` },
        { label: `Hari ${bestWeekday.label}`, value: `${formatPercent(bestWeekday.avgEngagement)} interaksi` },
        { label: "Topik terkuat", value: topics[0]?.label ?? "—" },
      ],
      actions: [
        `Uji dua konten baru dengan format ${bestFormat.label} pada jadwal ${bestWeekday.label} ${bestHour.label}.`,
        "Ukur kenaikan pengikut, bukan hanya tayangan, untuk memastikan kualitas audiens.",
      ],
    });
  }

  if (anomalies.length > 0) {
    const worst = anomalies[0];
    insights.push({
      id: "ins-anomaly",
      title: `Anomali terdeteksi pada ${worst.metric.toLowerCase()} (${formatDateShort(worst.date)})`,
      severity: worst.severity,
      category: "Anomali",
      narrative: `Pada ${formatDateShort(worst.date)}, ${worst.metric.toLowerCase()} tercatat ${formatNumber(worst.value)} sementara rata-rata periode sebelumnya ${formatNumber(worst.baseline)} (z-score ${worst.zScore.toFixed(2)}, arah ${worst.direction}). Total ${anomalies.length} anomali ditemukan pada periode ini.`,
      evidence: anomalies.slice(0, 3).map((anomaly) => ({
        label: `${anomaly.metric} · ${formatDateShort(anomaly.date)}`,
        value: formatNumber(anomaly.value),
        change: pctChange(anomaly.value, anomaly.baseline),
      })),
      actions: [
        "Cocokkan tanggal anomali dengan jadwal kampanye atau perubahan situs.",
        "Periksa apakah anomali berasal dari lonjakan satu konten atau perubahan menyeluruh.",
      ],
    });
  }

  return insights;
}

/* ------------------------------------------------------------------ */
/* Laporan otomatis                                                    */
/* ------------------------------------------------------------------ */

export interface ReportBlock {
  title: string;
  period: string;
  highlights: string[];
  metrics: Evidence[];
  recommendations: string[];
}

export function buildReport(dataset: Dataset): ReportBlock {
  const kpi = kpiSummary(dataset);
  const diagnosis = diagnoseTrafficGap(dataset);
  const comments = commentAnalysis(dataset);
  const formats = performanceByFormat(dataset);
  const channels = platformAggregates(dataset);
  const totals = webTotals(dataset);
  const top = topContent(dataset, 3);
  const followersGained = sum(channels.map((channel) => channel.followersGained));
  const followersGainedPrev = sum(channels.map((channel) => channel.followersGainedPrev));

  return {
    title: "Ringkasan performa digital",
    period: `${dataset.range.start} — ${dataset.range.end} (${dataset.range.days} hari)`,
    highlights: [
      `Tayangan sosial ${formatCompact(kpi.totalViews)} (${formatDelta(pctChange(kpi.totalViews, kpi.totalViewsPrev))}).`,
      `Sesi website ${formatNumber(kpi.sessions)} (${formatDelta(pctChange(kpi.sessions, kpi.sessionsPrev))}) dengan ${formatNumber(kpi.conversions)} konversi (${formatDelta(pctChange(kpi.conversions, kpi.conversionsPrev))}).`,
      `Kanal dengan tayangan terbesar: ${channels[0] ? platformLabel(channels[0].platform) : "—"} (${formatCompact(channels[0]?.views ?? 0)}).`,
      `Format dengan interaksi terbaik: ${formats[0]?.label ?? "—"} (${formatPercent(formats[0]?.avgEngagement ?? 0)}).`,
      `Sentimen positif ${formatPercent(comments.positiveShare)}, negatif ${formatPercent(comments.negativeShare)} dari ${formatNumber(comments.total)} komentar.`,
      `Konten teratas: “${top[0]?.title ?? "—"}” dengan ${formatCompact(top[0]?.views ?? 0)} tayangan.`,
    ],
    metrics: [
      { label: "Total tayangan sosial", value: formatNumber(kpi.totalViews), change: pctChange(kpi.totalViews, kpi.totalViewsPrev) },
      { label: "Rasio interaksi", value: formatPercent(kpi.engagementRate), change: kpi.engagementRate - kpi.engagementRatePrev },
      { label: "Pengikut bertambah", value: formatNumber(followersGained), change: pctChange(followersGained, followersGainedPrev) },
      { label: "Sesi website", value: formatNumber(kpi.sessions), change: pctChange(kpi.sessions, kpi.sessionsPrev) },
      { label: "Konversi", value: formatNumber(kpi.conversions), change: pctChange(kpi.conversions, kpi.conversionsPrev) },
      { label: "Tingkat konversi", value: formatPercent(totals.conversionRate), change: pctChange(totals.conversionRate, totals.conversionRatePrev) },
      { label: "Klik tautan sosial", value: formatNumber(kpi.linkClicks), change: pctChange(kpi.linkClicks, kpi.linkClicksPrev) },
    ],
    recommendations: [...diagnosis.actions.slice(0, 2), ...buildInsights(dataset).slice(-2).flatMap((insight) => insight.actions.slice(0, 1))],
  };
}

/* ------------------------------------------------------------------ */
/* Marketing copilot                                                   */
/* ------------------------------------------------------------------ */

function overviewAnswer(question: string, dataset: Dataset): CopilotAnswer {
  const kpi = kpiSummary(dataset);
  const channels = platformAggregates(dataset);
  const comments = commentAnalysis(dataset);
  const best = channels[0];
  const worst = channels[channels.length - 1];
  return {
    question,
    headline: `Tayangan sosial ${formatDelta(pctChange(kpi.totalViews, kpi.totalViewsPrev))}, sesi website ${formatDelta(pctChange(kpi.sessions, kpi.sessionsPrev))}, konversi ${formatDelta(pctChange(kpi.conversions, kpi.conversionsPrev))}.`,
    matchedTopic: "Ringkasan umum",
    body: [
      `Kanal dengan tayangan terbesar adalah ${best ? platformLabel(best.platform) : "—"} (${formatCompact(best?.views ?? 0)}). Kanal dengan pertumbuhan terlemah adalah ${worst ? platformLabel(worst.platform) : "—"} (${formatDelta(pctChange(worst?.views ?? 0, worst?.viewsPrev ?? 0))}).`,
      `Rasio interaksi keseluruhan ${formatPercent(kpi.engagementRate)} (${formatPoints(kpi.engagementRate - kpi.engagementRatePrev)}). Sentimen komentar positif ${formatPercent(comments.positiveShare)}.`,
    ],
    factors: [],
    actions: [
      "Buka halaman AI Insights untuk daftar temuan yang sudah diprioritaskan.",
      "Ajukan pertanyaan yang lebih spesifik, misalnya tentang trafik, komentar, atau jadwal unggah.",
    ],
    confidence: "sedang",
    dataPoints: [
      `Tayangan ${RANGE_DAYS} hari: ${formatNumber(kpi.totalViews)}`,
      `Sesi website: ${formatNumber(kpi.sessions)}`,
      `Konversi: ${formatNumber(kpi.conversions)}`,
    ],
  };
}

function commentsAnswer(question: string, dataset: Dataset): CopilotAnswer {
  const comments = commentAnalysis(dataset);
  const topTopic = comments.topics[0];
  const negativeTopic = [...comments.topics].sort((a, b) => a.sentimentScore - b.sentimentScore)[0];
  return {
    question,
    headline: `${formatNumber(comments.total)} komentar dianalisis: ${formatPercent(comments.positiveShare)} positif, ${formatPercent(comments.negativeShare)} negatif.`,
    matchedTopic: "Analisis komentar",
    body: [
      `Topik paling sering dibicarakan adalah “${topTopic?.topic ?? "—"}” (${formatNumber(topTopic?.count ?? 0)} komentar, ${formatPercent(topTopic?.share ?? 0)} dari total).`,
      `Topik dengan sentimen terendah adalah “${negativeTopic?.topic ?? "—"}” (skor sentimen ${negativeTopic?.sentimentScore.toFixed(1) ?? "0"}).`,
      `${comments.unanswered.length} pertanyaan bernilai tinggi belum terjawab dan ${comments.complaints.length} keluhan tercatat pada periode ini.`,
    ],
    factors: [
      {
        label: "Sebaran niat komentar",
        detail: comments.intents
          .map((intent) => `${INTENT_LABEL[intent.key]}: ${formatNumber(intent.count)}`)
          .join(" · "),
        evidence: comments.intents.map((intent) => ({
          label: INTENT_LABEL[intent.key],
          value: formatNumber(intent.count),
        })),
      },
    ],
    actions: [
      "Susun daftar balasan untuk pertanyaan dengan jumlah suka tertinggi.",
      "Jadikan keluhan berulang sebagai bahan konten penjelasan resmi.",
    ],
    confidence: comments.total > 60 ? "tinggi" : "sedang",
    dataPoints: [`Komentar dianalisis: ${comments.total}`, `Kategori topik: ${comments.topics.length}`],
  };
}

function contentAnswer(question: string, dataset: Dataset): CopilotAnswer {
  const formats = performanceByFormat(dataset);
  const topics = performanceByTopic(dataset);
  const top = topContent(dataset, 5);
  return {
    question,
    headline:
      formats[0] && topics[0]
        ? `Format ${formats[0].label} dan topik “${topics[0].label}” memberi interaksi tertinggi.`
        : "Belum cukup data konten pada periode ini.",
    matchedTopic: "Konten",
    body: [
      `Format ${formats[0]?.label ?? "—"} mencatat rata-rata interaksi ${formatPercent(formats[0]?.avgEngagement ?? 0)} dan rata-rata ${formatCompact(formats[0]?.avgViews ?? 0)} tayangan dari ${formatNumber(formats[0]?.posts ?? 0)} unggahan.`,
      `Topik terkuat adalah “${topics[0]?.label ?? "—"}” (${formatPercent(topics[0]?.avgEngagement ?? 0)} interaksi), sementara topik terlemah “${topics[topics.length - 1]?.label ?? "—"}”.`,
      `Konten dengan tayangan terbesar: “${top[0]?.title ?? "—"}” (${formatCompact(top[0]?.views ?? 0)} tayangan, ${formatPercent(engagementRateOf(top[0] ?? { views: 1, likes: 0, comments: 0, shares: 0, saves: 0 }))} interaksi).`,
    ],
    factors: [
      {
        label: "Peringkat format",
        detail: formats
          .map((bucket) => `${bucket.label}: ${formatPercent(bucket.avgEngagement)}`)
          .join(" · "),
        evidence: formats.map((bucket) => ({
          label: bucket.label,
          value: `${formatPercent(bucket.avgEngagement)} · ${formatNumber(bucket.posts)} unggahan`,
        })),
      },
    ],
    actions: [
      `Prioritaskan format ${formats[0]?.label ?? "terbaik"} untuk dua unggahan berikutnya.`,
      "Gunakan pola judul konten teratas sebagai kerangka, bukan menyalin topiknya.",
    ],
    confidence: windowContent(dataset).length > 12 ? "tinggi" : "sedang",
    dataPoints: [
      `Konten dalam periode: ${windowContent(dataset).length}`,
      `Format terukur: ${formats.length}`,
      `Topik terukur: ${topics.length}`,
    ],
  };
}

function timingAnswer(question: string, dataset: Dataset): CopilotAnswer {
  const hours = performanceByHour(dataset);
  const weekdays = performanceByWeekday(dataset);
  return {
    question,
    headline: `Waktu terbaik: hari ${weekdays[0]?.label ?? "—"} pukul ${hours[0]?.label ?? "—"} dengan interaksi rata-rata ${formatPercent(hours[0]?.avgEngagement ?? 0)}.`,
    matchedTopic: "Jadwal publikasi",
    body: [
      `Peringkat jam terbaik: ${hours.slice(0, 3).map((bucket) => `${bucket.label} (${formatPercent(bucket.avgEngagement)})`).join(", ")}.`,
      `Peringkat hari terbaik: ${weekdays.slice(0, 3).map((bucket) => `${bucket.label} (${formatPercent(bucket.avgEngagement)})`).join(", ")}.`,
      `Waktu terlemah: hari ${weekdays[weekdays.length - 1]?.label ?? "—"} pukul ${hours[hours.length - 1]?.label ?? "—"}.`,
    ],
    factors: [],
    actions: [
      `Jadwalkan konten utama pada hari ${weekdays[0]?.label ?? "—"} pukul ${hours[0]?.label ?? "—"}.`,
      "Karena tiap platform berbeda, uji jadwal ini per kanal sebelum diterapkan menyeluruh.",
    ],
    confidence: windowContent(dataset).length > 20 ? "tinggi" : "sedang",
    dataPoints: [
      `Unggahan dianalisis: ${windowContent(dataset).length}`,
      `Jam terukur: ${hours.length}`,
    ],
  };
}

function forecastAnswer(question: string, dataset: Dataset): CopilotAnswer {
  const points = trendPoints(dataset, RANGE_DAYS);
  const views = points.map((point) => point.socialViews);
  const sessions = points.map((point) => point.webSessions);
  const nextViews = forecastSeries(views, WINDOW);
  const nextSessions = forecastSeries(sessions, WINDOW);
  const viewsTrend = pctChange(mean(nextViews), mean(views.slice(-WINDOW)));
  const sessionsTrend = pctChange(mean(nextSessions), mean(sessions.slice(-WINDOW)));
  return {
    question,
    headline: `Proyeksi 7 hari ke depan: tayangan sosial ${formatDelta(viewsTrend)}, sesi website ${formatDelta(sessionsTrend)}.`,
    matchedTopic: "Prediksi",
    body: [
      `Proyeksi ini memakai regresi linear atas ${RANGE_DAYS} hari data terakhir, bukan model musiman. Anggap hasilnya sebagai arah, bukan kepastian.`,
      `Rata-rata tayangan harian diperkirakan ${formatCompact(mean(nextViews))} (sekarang ${formatCompact(mean(views.slice(-WINDOW)))}), sedangkan sesi harian ${formatNumber(mean(nextSessions))} (sekarang ${formatNumber(mean(sessions.slice(-WINDOW)))}).`,
    ],
    factors: [],
    actions: [
      "Jalankan ulang proyeksi setelah satu minggu dan bandingkan dengan realisasi.",
      "Waspadai sesi website bila arah proyeksi tetap negatif meski tayangan sosial naik.",
    ],
    confidence: "rendah",
    dataPoints: [
      `Titik data: ${points.length} hari`,
      `Horizon: ${WINDOW} hari`,
      `Basis proyeksi tayangan: ${formatNumber(sum(views))}`,
    ],
  };
}

export function answerCopilot(question: string, dataset: Dataset): CopilotAnswer {
  const normalized = question.toLowerCase();
  const rules: Array<{ keywords: string[]; handler: (q: string, d: Dataset) => CopilotAnswer }> = [
    {
      keywords: ["turun", "drop", "kenapa", "traffic", "trafik", "website", "sesi", "konversi turun", "menurun"],
      handler: (q, d) => {
        const diagnosis = diagnoseTrafficGap(d);
        return {
          question: q,
          headline: diagnosis.headline,
          matchedTopic: "Diagnosis lintas kanal",
          body: diagnosis.body,
          factors: diagnosis.factors,
          actions: diagnosis.actions,
          confidence: diagnosis.confidence,
          dataPoints: diagnosis.dataPoints,
        };
      },
    },
    {
      keywords: ["komentar", "sentimen", "keluhan", "pertanyaan", "komplain"],
      handler: commentsAnswer,
    },
    {
      keywords: ["konten", "video", "reels", "shorts", "format", "topik", "ide"],
      handler: contentAnswer,
    },
    {
      keywords: ["jam", "waktu", "jadwal", "unggah", "posting", "hari terbaik"],
      handler: timingAnswer,
    },
    {
      keywords: ["prediksi", "proyeksi", "perkiraan", "tren", "forecast", "masa depan"],
      handler: forecastAnswer,
    },
  ];

  const matched = rules.find((rule) => rule.keywords.some((keyword) => normalized.includes(keyword)));
  return matched ? matched.handler(question, dataset) : overviewAnswer(question, dataset);
}

export const COPILOT_SUGGESTIONS = [
  "Kenapa trafik website turun padahal views Instagram naik?",
  "Apa topik komentar yang paling sering muncul?",
  "Kapan waktu terbaik untuk mengunggah konten?",
  "Prediksi performa 7 hari ke depan",
  "Format konten mana yang paling efektif?",
];
