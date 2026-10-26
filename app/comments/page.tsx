import { Suspense } from "react";
import CopilotPanel from "@/components/CopilotPanel";
import { BarList, StackedBar } from "@/components/charts";
import {
  Card,
  CardHeader,
  DataNotice,
  KpiCard,
  PageHeader,
  PageSkeleton,
  PlatformBadge,
} from "@/components/ui";
import { COPILOT_SUGGESTIONS, answerCopilot } from "@/lib/ai";
import { getDataset } from "@/lib/data";
import { formatDateTime, formatNumber, formatPercent } from "@/lib/format";
import { commentAnalysis } from "@/lib/metrics";

const SENTIMENT_COLOR = { positive: "#10b981", neutral: "#94a3b8", negative: "#f43f5e" };
const SENTIMENT_LABEL = { positive: "Positif", neutral: "Netral", negative: "Negatif" };

export default function CommentsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CommentsContent />
    </Suspense>
  );
}

async function CommentsContent() {
  const dataset = await getDataset();
  const analysis = commentAnalysis(dataset);
  const copilot = answerCopilot(COPILOT_SUGGESTIONS[1], dataset);
  const topIntent = [...analysis.intents].sort((a, b) => b.count - a.count)[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`Comments AI · ${dataset.range.days} hari terakhir`}
        title="Analisis sentimen dan topik komentar"
        description="AI mengelompokkan komentar berdasarkan sentimen dan niat, lalu menyorot pertanyaan yang belum terjawab serta keluhan yang perlu ditindak. Analisis ini berbasis klasifikasi kata kunci pada dataset ilustratif."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Komentar dianalisis"
          value={formatNumber(analysis.total)}
          hint={`Dari 4 kanal sosial pada periode ini`}
        />
        <KpiCard
          label="Sentimen positif"
          value={formatPercent(analysis.positiveShare)}
          change={analysis.positiveShare - analysis.positiveSharePrev}
          asPoints
          hint={`Periode sebelumnya ${formatPercent(analysis.positiveSharePrev)}`}
        />
        <KpiCard
          label="Sentimen negatif"
          value={formatPercent(analysis.negativeShare)}
          change={analysis.negativeShare - analysis.negativeSharePrev}
          asPoints
          invertChange
          hint={`Periode sebelumnya ${formatPercent(analysis.negativeSharePrev)}`}
        />
        <KpiCard
          label="Perlu tindak lanjut"
          value={formatNumber(analysis.unanswered.length + analysis.complaints.length)}
          hint={`${analysis.unanswered.length} pertanyaan · ${analysis.complaints.length} keluhan`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Sebaran sentimen"
            description="Proporsi komentar positif, netral, dan negatif pada periode ini."
          />
          <div className="px-5 py-5">
            <StackedBar
              segments={analysis.sentiments.map((item) => ({
                label: SENTIMENT_LABEL[item.key],
                value: item.count,
                color: SENTIMENT_COLOR[item.key],
              }))}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Sebaran niat komentar"
            description={`Kategori terbanyak adalah ${topIntent?.label.toLowerCase() ?? "—"}. Niat memisahkan apresiasi dari pertanyaan dan keluhan.`}
          />
          <div className="px-5 py-5">
            <BarList
              items={analysis.intents
                .slice()
                .sort((a, b) => b.count - a.count)
                .map((intent) => ({
                  label: intent.label,
                  value: intent.count,
                  display: `${formatNumber(intent.count)} komentar`,
                }))}
              showChange={false}
            />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Topik yang paling sering dibicarakan"
          description="Skor sentimen memetakan (positif − negatif) ÷ total per topik. Nilai positif berarti topik tersebut cenderung disukai."
        />
        <div className="px-5 py-5">
          <BarList
            items={analysis.topics.slice(0, 8).map((topic) => ({
              label: topic.topic,
              value: topic.count,
              display: `${formatNumber(topic.count)} komentar`,
              sublabel: `${formatPercent(topic.share)} dari total · skor sentimen ${topic.sentimentScore.toFixed(0)}`,
              color: topic.sentimentScore >= 0 ? "#10b981" : "#f43f5e",
            }))}
            showChange={false}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Pergerakan sentimen mingguan"
          description="Empat minggu terakhir, dihitung dari jumlah komentar per kategori pada tiap jendela 7 hari."
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-medium">Periode</th>
                <th className="px-5 py-3 text-right font-medium">Positif</th>
                <th className="px-5 py-3 text-right font-medium">Netral</th>
                <th className="px-5 py-3 text-right font-medium">Negatif</th>
                <th className="px-5 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {analysis.sentimentTrend.map((bucket) => (
                <tr key={bucket.label} className="border-b border-slate-50 last:border-b-0">
                  <td className="px-5 py-3 font-medium text-slate-700">{bucket.label}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-emerald-600">
                    {formatNumber(bucket.positive)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-600">
                    {formatNumber(bucket.neutral)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-rose-600">
                    {formatNumber(bucket.negative)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold text-slate-900">
                    {formatNumber(bucket.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Pertanyaan belum terjawab"
            description="Diurutkan berdasarkan jumlah suka, karena pertanyaan populer berdampak paling besar bila dibiarkan."
          />
          <ul className="flex flex-col divide-y divide-slate-100">
            {analysis.unanswered.map((comment) => (
              <li key={comment.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <PlatformBadge platform={comment.platform} />
                  <span className="text-xs font-medium text-slate-600">@{comment.author}</span>
                  <span className="text-[11px] text-slate-400">
                    {comment.topic} · {formatDateTime(comment.createdAt)}
                  </span>
                  <span className="ml-auto text-[11px] text-slate-400">
                    {formatNumber(comment.likes)} suka
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">{comment.text}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Keluhan yang perlu ditindak"
            description="Komentar negatif dengan niat keluhan. Kelompokkan yang berulang agar bisa dijawab sekaligus."
          />
          <ul className="flex flex-col divide-y divide-slate-100">
            {analysis.complaints.map((comment) => (
              <li key={comment.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <PlatformBadge platform={comment.platform} />
                  <span className="text-xs font-medium text-slate-600">@{comment.author}</span>
                  <span className="text-[11px] text-slate-400">
                    {comment.topic} · {formatDateTime(comment.createdAt)}
                  </span>
                  <span className="ml-auto text-[11px] text-slate-400">
                    {formatNumber(comment.likes)} suka
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">{comment.text}</p>
              </li>
            ))}
          </ul>
          <div className="border-t border-slate-100 px-5 py-4">
            <DataNotice>
              Klasifikasi ini memakai pencocokan kata kunci pada template komentar ilustratif, bukan
              model bahasa. Untuk produksi, ganti dengan model yang dilatih pada data komentar nyata.
            </DataNotice>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Tanya AI Marketing Copilot"
          description="Copilot dapat merangkum topik, sentimen, dan niat komentar, lalu menyarankan tindakan lanjutan."
        />
        <div className="px-5 py-5">
          <CopilotPanel suggestions={COPILOT_SUGGESTIONS} initialAnswer={copilot} />
        </div>
      </Card>
    </div>
  );
}
