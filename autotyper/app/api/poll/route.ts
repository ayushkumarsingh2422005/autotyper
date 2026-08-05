import { NextResponse } from "next/server";
import { claimNext, pendingCount, isPersistentStore } from "@/lib/queue";
import { isAuthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const job = await claimNext();
    const pending = await pendingCount();
    return NextResponse.json({
      store: isPersistentStore() ? "redis" : "memory",
      job: job
        ? { id: job.id, text: job.text, mode: job.mode, createdAt: job.createdAt }
        : null,
      pending,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Queue error";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
