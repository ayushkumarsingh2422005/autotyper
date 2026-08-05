import { NextResponse } from "next/server";
import { pendingCount, isPersistentStore } from "@/lib/queue";
import { isAuthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json({
      pending: await pendingCount(),
      store: isPersistentStore() ? "redis" : "memory",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Queue error";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
