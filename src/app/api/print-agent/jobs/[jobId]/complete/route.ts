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

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const agent = await authenticatePrintAgent(request);
  if (!agent?.isActive) return json({ error: "invalid_agent" }, 401);

  const { jobId } = await context.params;
  if (!jobId || jobId.length > 80) return json({ error: "invalid_job" }, 400);

  let body: { status?: unknown; error?: unknown };
  try {
    body = await request.json() as { status?: unknown; error?: unknown };
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  if (body.status !== "PRINTED" && body.status !== "FAILED") {
    return json({ error: "invalid_status" }, 400);
  }
  const status = body.status;
  const errorMessage = status === "FAILED" && typeof body.error === "string"
    ? body.error.trim().slice(0, 1_000)
    : null;
  if (status === "FAILED" && !errorMessage) return json({ error: "error_required" }, 400);

  const now = new Date();
  const result = await db.$transaction(async (tx) => {
    const updated = await tx.printJob.updateMany({
      where: {
        id: jobId,
        branchId: agent.branchId,
        status: "CLAIMED",
        printer: { printAgentId: agent.id },
      },
      data: {
        status,
        completedAt: now,
        claimExpiresAt: null,
        printedAt: status === "PRINTED" ? now : null,
        error: errorMessage,
      },
    });
    if (updated.count === 1) {
      await tx.printAgent.update({
        where: { id: agent.id },
        data: { lastSeenAt: now, lastError: errorMessage },
      });
    }
    return updated.count;
  });

  if (result !== 1) return json({ error: "job_not_claimed" }, 409);
  return json({ ok: true });
}
