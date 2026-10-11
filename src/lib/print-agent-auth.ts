import "server-only";

import { db } from "@/lib/db";
import { hashPrintAgentToken, readBearerToken } from "@/lib/print-token";

export async function authenticatePrintAgent(request: Request) {
  const token = readBearerToken(request);
  if (!token) return null;

  return db.printAgent.findUnique({
    where: { tokenHash: hashPrintAgentToken(token) },
    select: { id: true, branchId: true, name: true, isActive: true },
  });
}
