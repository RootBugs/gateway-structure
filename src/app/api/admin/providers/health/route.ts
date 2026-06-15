import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth/session";
import { checkAllProviders } from "@/lib/routing/health-monitor";
import logger from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = await verifyAuth(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await checkAllProviders();
    return NextResponse.json({ success: true, results });
  } catch (error) {
    logger.error({ error: (error as Error).message }, "Health check failed");
    return NextResponse.json({ error: "Health check failed" }, { status: 500 });
  }
}
