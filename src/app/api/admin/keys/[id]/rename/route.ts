import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth/session";
import { renameApiKey } from "@/lib/api-key-manager";
import logger from "@/lib/logger";

export const runtime = "nodejs";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyAuth(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const name = body.name;
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const success = await renameApiKey(id, user.id, name.trim());
    if (!success) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    logger.info({ userId: user.id, keyId: id }, "API key renamed");
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error: (error as Error).message }, "Failed to rename key");
    return NextResponse.json({ error: "Failed to rename key" }, { status: 500 });
  }
}
