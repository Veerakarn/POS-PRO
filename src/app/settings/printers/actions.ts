"use server";

import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { createPrintAgentToken, hashPrintAgentToken } from "@/lib/print-token";

export type PrinterActionState = {
  error?: string;
  success?: string;
  agentToken?: string;
};

function readText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function refresh(branchId: string) {
  revalidatePath("/settings/printers");
  revalidatePath(`/settings/printers?branch=${branchId}`);
}

async function requireManagedBranch(branchId: string) {
  const user = await requirePermission("printer.manage", branchId);
  const branch = await db.branch.findFirst({
    where: { id: branchId, organizationId: user.organizationId },
    select: { id: true, name: true },
  });
  return { user, branch };
}

export async function createPrintAgent(_: PrinterActionState, formData: FormData): Promise<PrinterActionState> {
  const branchId = readText(formData, "branchId");
  const name = readText(formData, "name");
  if (!branchId || !name || name.length > 60) return { error: "กรอกชื่อ Print Agent ให้ถูกต้อง" };
  const { user, branch } = await requireManagedBranch(branchId);
  if (!branch) return { error: "ไม่พบสาขาที่เลือก" };

  const token = createPrintAgentToken();
  try {
    const agent = await db.$transaction(async (tx) => {
      const created = await tx.printAgent.create({
        data: { branchId, name, tokenHash: hashPrintAgentToken(token) },
      });
      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          branchId,
          actorId: user.id,
          action: "print_agent.created",
          entityType: "PrintAgent",
          entityId: created.id,
          after: { name: created.name },
        },
      });
      return created;
    });
    refresh(branchId);
    return { success: `สร้าง ${agent.name} แล้ว คัดลอก Token ตอนนี้`, agentToken: token };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    return { error: code === "P2002" ? "มี Print Agent ชื่อนี้แล้ว" : "สร้าง Print Agent ไม่สำเร็จ" };
  }
}

export async function rotatePrintAgentToken(_: PrinterActionState, formData: FormData): Promise<PrinterActionState> {
  const branchId = readText(formData, "branchId");
  const agentId = readText(formData, "agentId");
  if (!branchId || !agentId) return { error: "ข้อมูล Print Agent ไม่ถูกต้อง" };
  const { user, branch } = await requireManagedBranch(branchId);
  if (!branch) return { error: "ไม่พบสาขาที่เลือก" };
  const token = createPrintAgentToken();
  const agent = await db.printAgent.findFirst({ where: { id: agentId, branchId }, select: { id: true, name: true } });
  if (!agent) return { error: "ไม่พบ Print Agent" };

  await db.$transaction(async (tx) => {
    await tx.printAgent.update({
      where: { id: agent.id },
      data: { tokenHash: hashPrintAgentToken(token), lastSeenAt: null, lastError: null },
    });
    await tx.auditLog.create({
      data: {
        organizationId: user.organizationId,
        branchId,
        actorId: user.id,
        action: "print_agent.token_rotated",
        entityType: "PrintAgent",
        entityId: agent.id,
        reason: "Token เดิมถูกยกเลิกทันที",
      },
    });
  });
  refresh(branchId);
  return { success: `ออก Token ใหม่ให้ ${agent.name} แล้ว`, agentToken: token };
}

export async function togglePrintAgent(_: PrinterActionState, formData: FormData): Promise<PrinterActionState> {
  const branchId = readText(formData, "branchId");
  const agentId = readText(formData, "agentId");
  const isActive = readText(formData, "isActive") === "true";
  const { user, branch } = await requireManagedBranch(branchId);
  if (!branch) return { error: "ไม่พบสาขาที่เลือก" };
  const current = await db.printAgent.findFirst({ where: { id: agentId, branchId }, select: { id: true, name: true } });
  if (!current) return { error: "ไม่พบ Print Agent" };
  await db.$transaction(async (tx) => {
    await tx.printAgent.update({ where: { id: current.id }, data: { isActive } });
    await tx.auditLog.create({
      data: { organizationId: user.organizationId, branchId, actorId: user.id, action: isActive ? "print_agent.enabled" : "print_agent.disabled", entityType: "PrintAgent", entityId: current.id },
    });
  });
  refresh(branchId);
  return { success: `${isActive ? "เปิด" : "ปิด"}ใช้งาน ${current.name} แล้ว` };
}

export async function savePrinter(_: PrinterActionState, formData: FormData): Promise<PrinterActionState> {
  const branchId = readText(formData, "branchId");
  const printerId = readText(formData, "printerId");
  const printAgentId = readText(formData, "printAgentId");
  const name = readText(formData, "name");
  const connection = readText(formData, "connection");
  const endpoint = readText(formData, "endpoint");
  const codePage = readText(formData, "codePage") || "UTF-8";
  const paperWidth = Number(readText(formData, "paperWidth"));
  if (!branchId || !name || name.length > 60 || !["NETWORK", "WINDOWS"].includes(connection) || !endpoint || endpoint.length > 200 || ![58, 80].includes(paperWidth) || codePage.length > 40) {
    return { error: "กรอกข้อมูลเครื่องพิมพ์ให้ครบถ้วน" };
  }
  if (connection === "NETWORK" && !/^[a-zA-Z0-9.-]+:\d{1,5}$/.test(endpoint)) {
    return { error: "เครื่อง Network ต้องระบุเป็น IP-or-host:port เช่น 192.168.1.50:9100" };
  }
  const { user, branch } = await requireManagedBranch(branchId);
  if (!branch) return { error: "ไม่พบสาขาที่เลือก" };
  if (printAgentId && !await db.printAgent.findFirst({ where: { id: printAgentId, branchId }, select: { id: true } })) {
    return { error: "Print Agent ไม่ได้อยู่ในสาขานี้" };
  }
  if (printerId && !await db.printer.findFirst({ where: { id: printerId, branchId }, select: { id: true } })) {
    return { error: "ไม่พบเครื่องพิมพ์" };
  }

  try {
    const printer = await db.$transaction(async (tx) => {
      const saved = printerId
        ? await tx.printer.update({ where: { id: printerId }, data: { name, connection, endpoint, paperWidth, codePage, printAgentId: printAgentId || null } })
        : await tx.printer.create({ data: { branchId, name, connection, endpoint, paperWidth, codePage, printAgentId: printAgentId || null } });
      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          branchId,
          actorId: user.id,
          action: printerId ? "printer.updated" : "printer.created",
          entityType: "Printer",
          entityId: saved.id,
          after: { name, connection, endpoint, paperWidth, codePage, printAgentId: printAgentId || null },
        },
      });
      return saved;
    });
    refresh(branchId);
    return { success: `${printerId ? "บันทึก" : "เพิ่ม"} ${printer.name} แล้ว` };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    return { error: code === "P2002" ? "มีเครื่องพิมพ์ชื่อนี้แล้ว" : "บันทึกเครื่องพิมพ์ไม่สำเร็จ" };
  }
}

export async function togglePrinter(_: PrinterActionState, formData: FormData): Promise<PrinterActionState> {
  const branchId = readText(formData, "branchId");
  const printerId = readText(formData, "printerId");
  const isActive = readText(formData, "isActive") === "true";
  const { user, branch } = await requireManagedBranch(branchId);
  if (!branch) return { error: "ไม่พบสาขาที่เลือก" };
  const printer = await db.printer.findFirst({ where: { id: printerId, branchId }, select: { id: true, name: true } });
  if (!printer) return { error: "ไม่พบเครื่องพิมพ์" };
  await db.$transaction(async (tx) => {
    await tx.printer.update({ where: { id: printer.id }, data: { isActive } });
    await tx.auditLog.create({ data: { organizationId: user.organizationId, branchId, actorId: user.id, action: isActive ? "printer.enabled" : "printer.disabled", entityType: "Printer", entityId: printer.id } });
  });
  refresh(branchId);
  return { success: `${isActive ? "เปิด" : "ปิด"}ใช้งาน ${printer.name} แล้ว` };
}

export async function createPrintRoute(_: PrinterActionState, formData: FormData): Promise<PrinterActionState> {
  const branchId = readText(formData, "branchId");
  const printerId = readText(formData, "printerId");
  const documentType = readText(formData, "documentType");
  const stationId = readText(formData, "stationId");
  const copies = Number(readText(formData, "copies"));
  if (!branchId || !printerId || !["ORDER_TICKET", "RECEIPT"].includes(documentType) || !Number.isInteger(copies) || copies < 1 || copies > 5 || (documentType === "ORDER_TICKET" && !stationId) || (documentType === "RECEIPT" && stationId)) {
    return { error: "ข้อมูลเส้นทางพิมพ์ไม่ถูกต้อง" };
  }
  const { user, branch } = await requireManagedBranch(branchId);
  if (!branch) return { error: "ไม่พบสาขาที่เลือก" };
  const [printer, station] = await Promise.all([
    db.printer.findFirst({ where: { id: printerId, branchId }, select: { id: true, name: true } }),
    stationId ? db.productionStation.findFirst({ where: { id: stationId, branchId }, select: { id: true, name: true } }) : Promise.resolve(null),
  ]);
  if (!printer || (stationId && !station)) return { error: "เครื่องพิมพ์หรือจุดผลิตไม่ได้อยู่ในสาขานี้" };
  try {
    const route = await db.$transaction(async (tx) => {
      const created = await tx.printRoutingRule.create({ data: { branchId, printerId, stationId: stationId || null, documentType: documentType as "ORDER_TICKET" | "RECEIPT", copies } });
      await tx.auditLog.create({ data: { organizationId: user.organizationId, branchId, actorId: user.id, action: "print_route.created", entityType: "PrintRoutingRule", entityId: created.id, after: { printerId, stationId: stationId || null, documentType, copies } } });
      return created;
    });
    refresh(branchId);
    return { success: `เพิ่มเส้นทางไป ${printer.name} แล้ว (${route.copies} ชุด)` };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    return { error: code === "P2002" ? "มีเส้นทางนี้แล้ว" : "เพิ่มเส้นทางพิมพ์ไม่สำเร็จ" };
  }
}

export async function deletePrintRoute(_: PrinterActionState, formData: FormData): Promise<PrinterActionState> {
  const branchId = readText(formData, "branchId");
  const routeId = readText(formData, "routeId");
  const { user, branch } = await requireManagedBranch(branchId);
  if (!branch) return { error: "ไม่พบสาขาที่เลือก" };
  const route = await db.printRoutingRule.findFirst({ where: { id: routeId, branchId }, select: { id: true } });
  if (!route) return { error: "ไม่พบเส้นทางพิมพ์" };
  await db.$transaction(async (tx) => {
    await tx.printRoutingRule.delete({ where: { id: route.id } });
    await tx.auditLog.create({ data: { organizationId: user.organizationId, branchId, actorId: user.id, action: "print_route.deleted", entityType: "PrintRoutingRule", entityId: route.id } });
  });
  refresh(branchId);
  return { success: "ลบเส้นทางพิมพ์แล้ว" };
}

export async function queueTestPrint(_: PrinterActionState, formData: FormData): Promise<PrinterActionState> {
  const branchId = readText(formData, "branchId");
  const printerId = readText(formData, "printerId");
  const { user, branch } = await requireManagedBranch(branchId);
  if (!branch) return { error: "ไม่พบสาขาที่เลือก" };
  const printer = await db.printer.findFirst({ where: { id: printerId, branchId, isActive: true }, select: { id: true, name: true } });
  if (!printer) return { error: "ไม่พบเครื่องพิมพ์ที่เปิดใช้งาน" };
  const job = await db.$transaction(async (tx) => {
    const created = await tx.printJob.create({ data: {
      branchId,
      printerId,
      documentType: "TEST",
      idempotencyKey: `test:${printerId}:${randomUUID()}`,
      document: { version: 1, type: "TEST", title: "ทดสอบเครื่องพิมพ์ POS@PRO", branchName: branch.name, createdAt: new Date().toISOString(), copies: 1, lines: [{ text: `เครื่อง: ${printer.name}` }, { text: "การเชื่อมต่อพร้อมใช้งาน" }] },
    } });
    await tx.auditLog.create({ data: { organizationId: user.organizationId, branchId, actorId: user.id, action: "print_job.test_queued", entityType: "PrintJob", entityId: created.id, after: { printerId } } });
    return created;
  });
  refresh(branchId);
  return { success: `เข้าคิวทดสอบแล้ว · งาน ${job.id.slice(-8)}` };
}

export async function retryPrintJob(_: PrinterActionState, formData: FormData): Promise<PrinterActionState> {
  const branchId = readText(formData, "branchId");
  const jobId = readText(formData, "jobId");
  const { user, branch } = await requireManagedBranch(branchId);
  if (!branch) return { error: "ไม่พบสาขาที่เลือก" };
  const job = await db.printJob.findFirst({ where: { id: jobId, branchId, status: "FAILED" }, select: { id: true } });
  if (!job) return { error: "งานนี้ไม่อยู่ในสถานะที่ลองใหม่ได้" };
  await db.$transaction(async (tx) => {
    await tx.printJob.update({ where: { id: job.id }, data: { status: "QUEUED", claimedAt: null, claimExpiresAt: null, completedAt: null, error: null } });
    await tx.auditLog.create({ data: { organizationId: user.organizationId, branchId, actorId: user.id, action: "print_job.retried", entityType: "PrintJob", entityId: job.id } });
  });
  refresh(branchId);
  return { success: "นำงานกลับเข้าคิวแล้ว" };
}

export async function reprintJob(_: PrinterActionState, formData: FormData): Promise<PrinterActionState> {
  const branchId = readText(formData, "branchId");
  const jobId = readText(formData, "jobId");
  const reason = readText(formData, "reason");
  if (reason.length < 3 || reason.length > 200) return { error: "ระบุเหตุผลการพิมพ์ซ้ำอย่างน้อย 3 ตัวอักษร" };
  const { user, branch } = await requireManagedBranch(branchId);
  if (!branch) return { error: "ไม่พบสาขาที่เลือก" };
  const original = await db.printJob.findFirst({ where: { id: jobId, branchId, status: "PRINTED" }, select: { id: true, printerId: true, documentType: true, document: true } });
  if (!original) return { error: "พิมพ์ซ้ำได้เฉพาะงานที่พิมพ์สำเร็จแล้ว" };
  const created = await db.$transaction(async (tx) => {
    const job = await tx.printJob.create({ data: { branchId, printerId: original.printerId, documentType: original.documentType, idempotencyKey: `reprint:${original.id}:${randomUUID()}`, document: original.document as Prisma.InputJsonValue } });
    await tx.auditLog.create({ data: { organizationId: user.organizationId, branchId, actorId: user.id, action: "print_job.reprinted", entityType: "PrintJob", entityId: job.id, reason, after: { originalJobId: original.id } } });
    return job;
  });
  refresh(branchId);
  return { success: `สร้างงานพิมพ์ซ้ำแล้ว · ${created.id.slice(-8)}` };
}
