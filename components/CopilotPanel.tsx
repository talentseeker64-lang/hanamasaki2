"use client";

import { useState } from "react";
import type { CopilotAnswer } from "@/lib/types";

export default function CopilotPanel({
  suggestions,
  initialAnswer,
}: {
  suggestions: string[];
  initialAnswer: CopilotAnswer;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<CopilotAnswer>(initialAnswer);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(nextQuestion: string) {
    if (!nextQuestion.trim()) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: nextQuestion }),
      });
      if (!response.ok) throw new Error(`Permintaan gagal (${response.status})`);
      setAnswer((await response.json()) as CopilotAnswer);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Terjadi kesalahan tidak terduga.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question);
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Tanyakan sesuatu tentang performa kanal Anda…"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
        <button
          type="submit"
          disabled={pending || question.trim().length === 0}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {pending ? "Menganalisis…" : "Tanya copilot"}
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => {
              setQuestion(suggestion);
              void ask(suggestion);
            }}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition hover:border-indigo-200 hover:text-indigo-700"
          >
            {suggestion}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-100">
          {error}
        </p>
      ) : null}

      <AnswerCard answer={answer} />
    </div>
  );
}

function AnswerCard({ answer }: { answer: CopilotAnswer }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white">
          {answer.matchedTopic.toUpperCase()}
        </span>
        <span className="text-[11px] text-slate-500">
          Keyakinan analisis: <span className="font-medium text-slate-700">{answer.confidence}</span>
        </span>
      </div>

      <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-900">{answer.headline}</p>

      <div className="mt-3 flex flex-col gap-2">
        {answer.body.map((paragraph) => (
          <p key={paragraph} className="text-sm leading-relaxed text-slate-600">
            {paragraph}
          </p>
        ))}
      </div>

      {answer.factors.length > 0 ? (
        <div className="mt-4 flex flex-col gap-3">
          {answer.factors.map((factor) => (
            <div key={factor.label} className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-sm font-medium text-slate-800">{factor.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{factor.detail}</p>
              <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-3">
                {factor.evidence.map((item) => (
                  <div key={item.label}>
                    <dt className="text-[11px] text-slate-400">{item.label}</dt>
                    <dd className="text-sm font-semibold tabular-nums text-slate-800">
                      {item.value}
                      {item.change === undefined ? null : (
                        <span
                          className={`ml-1 text-xs ${
                            item.change > 0 ? "text-emerald-600" : item.change < 0 ? "text-rose-600" : "text-slate-400"
                          }`}
                        >
                          {item.change > 0 ? "↑" : item.change < 0 ? "↓" : "="}
                          {Math.abs(item.change).toFixed(1)}%
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      ) : null}

      {answer.actions.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Tindakan yang disarankan
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {answer.actions.map((action) => (
              <li key={action} className="flex gap-2 text-sm leading-relaxed text-slate-700">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-indigo-400" />
                {action}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 border-t border-slate-200 pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Basis data analisis
        </p>
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
          {answer.dataPoints.map((point) => (
            <li key={point} className="tabular-nums">
              {point}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
