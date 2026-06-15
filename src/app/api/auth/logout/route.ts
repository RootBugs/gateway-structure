import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import logger from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("cookie")?.match(/session=([^;]+)/)?.[1];

    if (token) {
      // Delete session from database
      await prisma.session.deleteMany({ where: { token } });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set("session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch (error) {
    logger.error({ error: (error as Error).message }, "Logout failed");
    return NextResponse.json({ success: true });
  }
}
