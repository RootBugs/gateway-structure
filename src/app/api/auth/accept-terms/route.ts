import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import logger from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { termsAcceptedAt: new Date() },
    });

    logger.info({ userId: user.id }, "User accepted terms & conditions");

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error: (error as Error).message }, "Failed to accept terms");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
