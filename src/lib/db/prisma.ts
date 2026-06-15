import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Build the database URL with connection_limit as a query parameter
function buildDatabaseUrl(): string {
  const baseUrl = process.env.DATABASE_URL || "";
  const connectionLimit = process.env.DB_CONNECTION_LIMIT || "20";

  // Append connection_limit as a query parameter if not already present
  if (baseUrl && !baseUrl.includes("connection_limit")) {
    const separator = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${separator}connection_limit=${connectionLimit}`;
  }
  return baseUrl;
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === "development"
    ? ["query", "error", "warn"]
    : ["error"],
  datasources: {
    db: {
      url: buildDatabaseUrl(),
    },
  },
});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
