import { NextResponse } from "next/server";
import { processQueue } from "@/lib/queue-processor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/cron/process-queue
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secretParam = searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;

  // Simple token security check
  if (cronSecret && secretParam !== cronSecret && req.headers.get("Authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const outcome = await processQueue();
    return NextResponse.json(outcome);
  } catch (error: any) {
    console.error("CRON queue execution error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/cron/process-queue
export async function POST(req: Request) {
  return GET(req);
}
