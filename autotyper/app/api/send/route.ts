import { NextResponse } from "next/server";
import { enqueue, isPersistentStore, type JobMode } from "@/lib/queue";
import { isAuthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { text?: string; mode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawText = typeof body.text === "string" ? body.text : "";
  // Never keep tabs in queued jobs — always 4 spaces (editors mishandle Tab)
  const text = rawText.replace(/\t/g, "    ");
  if (!text.trim()) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }

  const mode: JobMode = body.mode === "type" ? "type" : "paste";

  try {
    const job = await enqueue(text, mode);
    return NextResponse.json({
      ok: true,
      store: isPersistentStore() ? "redis" : "memory",
      job: { id: job.id, mode: job.mode, createdAt: job.createdAt },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Queue error";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
