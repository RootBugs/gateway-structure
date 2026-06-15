import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth/session";
import rotationManager from "@/lib/providers/key-rotation";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await verifyAuth(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = rotationManager.getAllProviderStatus();
  const totalKeys = Object.values(status).reduce((sum, p) => sum + p.keyCount, 0);
  const totalActive = Object.values(status).reduce((sum, p) => sum + p.activeKeys, 0);

  return NextResponse.json({
    success: true,
    summary: {
      totalProviders: Object.keys(status).length,
      totalKeys,
      totalActiveKeys: totalActive,
      totalInactiveKeys: totalKeys - totalActive,
    },
    providers: status,
    timestamp: new Date().toISOString(),
  });
}
