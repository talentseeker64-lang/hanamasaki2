"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, DataNotice } from "@/components/ui";
import { formatDateShort, formatNumber } from "@/lib/format";

interface Video {
  id: string;
  title: string;
  publishedAt: string;
  thumbnailUrl: string;
  durationSeconds: number;
  isShort: boolean;
  views: number;
  likes: number;
  comments: number;
}

interface ApiPayload {
  ok?: boolean;
  message?: string;
  fetchedAt?: string;
  videos?: Video[];
}

type Filter = "all" | "short" | "video";

type ViewState =
  | { status: "loading" }
  | { status: "ready"; videos: Video[]; fetchedAt: string }
  | { status: "notice"; message: string };

/** Durasi sebagai jam:menit:detik supaya mudah dibandingkan sekilas. */
function clock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "Semua" },
  { key: "short", label: "Shorts" },
  { key: "video", label: "Video biasa" },
];

/**
 * Daftar video channel YouTube yang terhubung.
 *
 * Sumbernya API YouTube secara langsung, bukan dataset ilustratif dashboard.
 * Karena itu komponen ini fetch dari klien dan menampilkan pesan apa adanya
 * bila akun belum terhubung — bukan angka contoh yang terlihat seperti nyata.
 */
export default function YouTubeVideoList() {
  const [state, setState] = useState<ViewState>({ status: "loading" });
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/youtube/videos");
        const payload = (await response.json().catch(() => null)) as ApiPayload | null;
        if (cancelled) return;

        if (payload === null) {
          setState({ status: "notice", message: "Respons server tidak dapat dibaca." });
          return;
        }
        if (!payload.ok) {
          setState({
            status: "notice",
            message: payload.message ?? "Data video belum dapat diambil.",
          });
          return;
        }
        setState({
          status: "ready",
          videos: payload.videos ?? [],
          fetchedAt: payload.fetchedAt ?? "",
        });
      } catch {
        if (!cancelled) {
          setState({ status: "notice", message: "Tidak dapat menghubungi server." });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const videos = state.status === "ready" ? state.videos : [];
  const counts = {
    all: videos.length,
    short: videos.filter((video) => video.isShort).length,
    video: videos.filter((video) => !video.isShort).length,
  };
  const visible = videos.filter((video) =>
    filter === "all" ? true : filter === "short" ? video.isShort : !video.isShort,
  );

  return (
    <Card>
      <CardHeader
        title="Video terbaru dari channel YouTube"
        description="Daftar unggahan terbaru beserta durasi dan statistiknya, diambil langsung dari YouTube Data API milik akun yang terhubung."
        action={
          state.status === "ready" ? (
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((entry) => {
                const active = entry.key === filter;
                return (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => setFilter(entry.key)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      active
                        ? "bg-slate-900 text-white"
                        : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {entry.label}
                    <span className={active ? "text-slate-300" : "text-slate-400"}>
                      {" "}
                      {counts[entry.key]}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null
        }
      />

      {state.status === "loading" ? (
        <div className="flex animate-pulse flex-col gap-3 px-5 py-5" aria-hidden>
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-[90px] rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : null}

      {state.status === "notice" ? (
        <div className="px-5 py-5">
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 ring-1 ring-amber-100">
            {state.message}
          </p>
        </div>
      ) : null}

      {state.status === "ready" && visible.length === 0 ? (
        <div className="px-5 py-5">
          <p className="text-sm text-slate-400">
            {videos.length === 0
              ? "Channel ini belum memiliki unggahan yang dapat dibaca."
              : "Tidak ada video pada filter ini."}
          </p>
        </div>
      ) : null}

      {state.status === "ready" && visible.length > 0 ? (
        <ul className="divide-y divide-slate-100">
          {visible.map((video) => (
            <li key={video.id} className="flex gap-4 px-5 py-4">
              <a
                href={`https://www.youtube.com/watch?v=${video.id}`}
                target="_blank"
                rel="noreferrer"
                className="shrink-0"
              >
                {video.thumbnailUrl ? (
                  // Thumbnail berasal dari CDN YouTube; tidak dioptimasi agar
                  // tidak menambah binding image resizing pada Worker.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={video.thumbnailUrl}
                    alt=""
                    width={160}
                    height={90}
                    loading="lazy"
                    className="h-[90px] w-40 rounded-lg object-cover ring-1 ring-slate-200"
                  />
                ) : (
                  <span className="grid h-[90px] w-40 place-items-center rounded-lg bg-slate-100 text-xs text-slate-400 ring-1 ring-slate-200">
                    Tanpa thumbnail
                  </span>
                )}
              </a>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <a
                    href={`https://www.youtube.com/watch?v=${video.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="line-clamp-2 text-sm font-medium text-slate-800 hover:text-indigo-700"
                  >
                    {video.title}
                  </a>
                  <span
                    className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold ${
                      video.isShort
                        ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                        : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                    }`}
                  >
                    {video.isShort ? "SHORTS" : "VIDEO"}
                  </span>
                </div>

                <p className="mt-1 text-[11px] text-slate-400">
                  {video.publishedAt ? `${formatDateShort(video.publishedAt.slice(0, 10))} · ` : ""}
                  durasi {clock(video.durationSeconds)}
                </p>

                <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
                  <div className="flex items-baseline gap-1">
                    <dt className="text-slate-400">Tayangan</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">
                      {formatNumber(video.views)}
                    </dd>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <dt className="text-slate-400">Suka</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">
                      {formatNumber(video.likes)}
                    </dd>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <dt className="text-slate-400">Komentar</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">
                      {formatNumber(video.comments)}
                    </dd>
                  </div>
                </dl>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="border-t border-slate-100 px-5 py-4">
        <DataNotice>
          Penanda <strong className="font-semibold">Shorts</strong> disimpulkan dari durasi
          (≤ 3 menit) karena YouTube Data API tidak menyediakan penanda jenis video secara langsung.
          Video vertikal berdurasi pendek umumnya benar terdeteksi, tetapi video pendek berformat
          lanskap bisa ikut terhitung. Angka tayangan di sini adalah total seumur video, berbeda dari
          tayangan 30 hari terakhir pada grafik di atas.
        </DataNotice>
      </div>
    </Card>
  );
}
