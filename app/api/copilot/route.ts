import { NextResponse } from "next/server";
import { answerCopilot } from "@/lib/ai";
import { requireAdmin } from "@/lib/api";
import { getDataset } from "@/lib/data";

/**
 * Menjawab pertanyaan copilot berdasarkan dataset yang terhubung.
 *
 * Meski memakai metode POST, endpoint ini hanya membaca data — yang dikirim
 * hanyalah pertanyaan. Penjagaan token disamakan dengan endpoint lain karena
 * jawabannya memuat angka bisnis hasil analisis.
 */
export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  let question = "";
  try {
    const body = (await request.json()) as { question?: unknown };
    if (typeof body.question === "string") question = body.question;
  } catch {
    return NextResponse.json({ error: "Body JSON tidak valid." }, { status: 400 });
  }

  const trimmed = question.trim();
  if (trimmed.length === 0) {
    return NextResponse.json({ error: "Pertanyaan tidak boleh kosong." }, { status: 400 });
  }
  if (trimmed.length > 300) {
    return NextResponse.json({ error: "Pertanyaan maksimal 300 karakter." }, { status: 400 });
  }

  return NextResponse.json(answerCopilot(trimmed, await getDataset()));
}
