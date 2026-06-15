import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth/session";
import { revokeApiKey } from "@/lib/api-key-manager";
import logger from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyAuth(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const success = await revokeApiKey(id, user.id);
    if (!success) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    logger.info({ userId: user.id, keyId: id }, "API key revoked via dedicated endpoint");
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error: (error as Error).message }, "Failed to revoke key");
    return NextResponse.json({ error: "Failed to revoke key" }, { status: 500 });
  }
}
