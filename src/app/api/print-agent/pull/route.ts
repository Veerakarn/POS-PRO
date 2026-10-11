import { NextResponse } from "next/server";

import { authenticatePrintAgent } from "@/lib/print-agent-auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const agent = await authenticatePrintAgent(request);
  if (!agent?.isActive) return json({ error: "invalid_agent" }, 401);

  let version: string | null = null;
  try {
    const body = await request.json() as { version?: unknown };
    version = typeof body.version === "string" ? body.version.slice(0, 40) : null;
  } catch {
    // An empty body is valid for older agents.
  }

  const now = new Date();
  const claimExpiresAt = new Date(now.getTime() + 60_000);
  try {
    const job = await db.$transaction(async (tx) => {
      await tx.printAgent.update({
        where: { id: agent.id },
        data: { lastSeenAt: now, lastError: null, ...(version ? { version } : {}) },
      });

      const candidate = await tx.printJob.findFirst({
        where: {
          branchId: agent.branchId,
          printer: { printAgentId: agent.id, isActive: true },
          OR: [
            { status: "QUEUED" },
            { status: "CLAIMED", claimExpiresAt: { lte: now } },
          ],
        },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (!candidate) return null;

      const claimed = await tx.printJob.updateMany({
        where: {
          id: candidate.id,
          branchId: agent.branchId,
          OR: [
            { status: "QUEUED" },
            { status: "CLAIMED", claimExpiresAt: { lte: now } },
          ],
        },
        data: {
          status: "CLAIMED",
          attempts: { increment: 1 },
          claimedAt: now,
          claimExpiresAt,
          completedAt: null,
          error: null,
        },
      });
      if (claimed.count !== 1) return null;

      return tx.printJob.findUnique({
        where: { id: candidate.id },
        select: {
          id: true,
          documentType: true,
          document: true,
          attempts: true,
          printer: {
            select: {
              id: true,
              name: true,
              connection: true,
              endpoint: true,
              paperWidth: true,
              codePage: true,
            },
          },
        },
      });
    }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 10_000 });

    return json({ job, pollAfterMs: job ? 0 : 2_000 });
  } catch (error) {
    console.error("print_agent_pull_failed", { agentId: agent.id, error: error instanceof Error ? error.message : "unknown" });
    return json({ error: "pull_failed" }, 500);
  }
}
