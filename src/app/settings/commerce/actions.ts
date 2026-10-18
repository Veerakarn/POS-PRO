"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationPermission, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { isTaxProfileTestModeEnabled, isThaiTaxId } from "@/lib/commerce-rules";

export type CommerceState = { error?: string; success?: string };
const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const number = (data: FormData, key: string) => {
  const raw = text(data, key);
  return /^\d+(?:\.\d{1,2})?$/.test(raw) ? Number(raw) : NaN;
};

export async function createPromoCode(_: CommerceState, data: FormData): Promise<CommerceState> {
  const user = await requireOrganizationPermission("organization.manage");
  const code = text(data, "code").toUpperCase();
  const name = text(data, "name");
  const kind = text(data, "kind");
  const inputValue = number(data, "value");
  const minimum = number(data, "minimum");
  const maxDiscount = text(data, "maximumDiscount") ? number(data, "maximumDiscount") : null;
  const usageLimit = text(data, "usageLimit") ? Number(text(data, "usageLimit")) : null;
  const startsAt = text(data, "startsAt") ? new Date(`${text(data, "startsAt")}T00:00:00.000Z`) : null;
  const endsAt = text(data, "endsAt") ? new Date(`${text(data, "endsAt")}T23:59:59.999Z`) : null;
  if (!/^[A-Z0-9_-]{3,24}$/.test(code) || !name || name.length > 80 || !["FIXED", "PERCENT"].includes(kind)) return { error: "ตรวจชื่อและรหัสโปรโมชั่น (ใช้ A-Z, 0-9, _ หรือ -)" };
  if (!Number.isFinite(inputValue) || inputValue <= 0 || (kind === "PERCENT" ? inputValue > 100 : inputValue > 1_000_000)) return { error: "จำนวนส่วนลดไม่ถูกต้อง" };
  if (!Number.isFinite(minimum) || minimum < 0 || minimum > 1_000_000 || (maxDiscount !== null && (!Number.isFinite(maxDiscount) || maxDiscount < 0.01 || maxDiscount > 1_000_000))) return { error: "ยอดขั้นต่ำหรือเพดานส่วนลดไม่ถูกต้อง" };
  if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1 || usageLimit > 1_000_000)) return { error: "จำนวนครั้งที่ใช้ได้ต้องเป็นจำนวนเต็มบวก" };
  if ((startsAt && Number.isNaN(startsAt.valueOf())) || (endsAt && Number.isNaN(endsAt.valueOf())) || (startsAt && endsAt && startsAt > endsAt)) return { error: "ช่วงวันใช้โปรโมชั่นไม่ถูกต้อง" };
  try {
    await db.promoCode.create({ data: {
      organizationId: user.organizationId, code, name, kind: kind as "FIXED" | "PERCENT",
      value: kind === "PERCENT" ? Math.round(inputValue * 100) : Math.round(inputValue * 100),
      minimumSatang: Math.round(minimum * 100), maximumDiscountSatang: maxDiscount === null ? null : Math.round(maxDiscount * 100),
      usageLimit, startsAt, endsAt,
    } });
    revalidatePath("/settings/promotions");
    return { success: `สร้างโปรโมชั่น ${code} แล้ว` };
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") return { error: "รหัสโปรโมชั่นนี้มีอยู่แล้ว" };
    return { error: "บันทึกโปรโมชั่นไม่สำเร็จ" };
  }
}

export async function disablePromoCode(_: CommerceState, data: FormData): Promise<CommerceState> {
  const user = await requireOrganizationPermission("organization.manage");
  const id = text(data, "promoCodeId");
  if (!id) return { error: "ไม่พบโปรโมชั่น" };
  const changed = await db.promoCode.updateMany({ where: { id, organizationId: user.organizationId, isActive: true }, data: { isActive: false } });
  if (changed.count) revalidatePath("/settings/promotions");
  return changed.count ? { success: "ปิดโปรโมชั่นแล้ว รหัสที่ใช้ไปแล้วยังคงอยู่ในประวัติบิล" } : { error: "ไม่พบโปรโมชั่นที่เปิดใช้งาน" };
}

export async function saveMembershipSettings(_: CommerceState, data: FormData): Promise<CommerceState> {
  const user = await requireOrganizationPermission("organization.manage");
  const earnEveryBaht = Number(text(data, "earnEveryBaht"));
  const points = Number(text(data, "pointsPerInterval"));
  const cap = Number(text(data, "redemptionCapPercent"));
  if (!Number.isInteger(earnEveryBaht) || earnEveryBaht < 1 || earnEveryBaht > 100_000 || !Number.isInteger(points) || points < 1 || points > 100_000 || !Number.isInteger(cap) || cap < 1 || cap > 100) return { error: "ตรวจค่าการสะสมและเพดานแลกแต้มอีกครั้ง" };
  try {
    await db.$transaction(async (tx) => {
      const previous = await tx.membershipSettings.findUnique({
        where: { organizationId: user.organizationId },
        select: { pointsPerHundredSatang: true, pointsPerHundredBaht: true, redemptionCapPercent: true },
      });
      await tx.membershipSettings.upsert({
        where: { organizationId: user.organizationId },
        create: { organizationId: user.organizationId, pointsPerHundredSatang: earnEveryBaht * 100, pointsPerHundredBaht: points, redemptionCapPercent: cap },
        update: { pointsPerHundredSatang: earnEveryBaht * 100, pointsPerHundredBaht: points, redemptionCapPercent: cap },
      });
      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          actorId: user.id,
          action: "membership.settings_updated",
          entityType: "MembershipSettings",
          entityId: user.organizationId,
          ...(previous ? { before: {
            earnEveryBaht: Math.round(previous.pointsPerHundredSatang / 100),
            pointsPerInterval: previous.pointsPerHundredBaht,
            redemptionCapPercent: previous.redemptionCapPercent,
          } } : {}),
          after: { earnEveryBaht, pointsPerInterval: points, redemptionCapPercent: cap },
        },
      });
    });
    revalidatePath("/settings/members");
    revalidatePath("/pos");
    revalidatePath("/audit");
    revalidatePath("/dashboard");
    return { success: `ตั้งค่าสะสม ${points} แต้มต่อ ${earnEveryBaht} บาทแล้ว` };
  } catch {
    return { error: "บันทึกกติกาสะสมแต้มไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }
}

export async function saveTaxProfile(_: CommerceState, data: FormData): Promise<CommerceState> {
  const branchId = text(data, "branchId");
  const user = await requirePermission("payment.manage", branchId);
  const legalName = text(data, "legalName");
  const rawTaxpayerId = text(data, "taxpayerId");
  const allowTestTaxId = isTaxProfileTestModeEnabled();
  const taxpayerId = allowTestTaxId ? rawTaxpayerId : rawTaxpayerId.replace(/\D/g, "");
  const address = text(data, "address");
  const branchNumber = text(data, "branchNumber");
  const prefix = text(data, "documentPrefix").toUpperCase();
  const rate = number(data, "vatRate");
  const registered = data.get("isVatRegistered") === "on";
  const included = data.get("taxIncluded") === "on";
  if (legalName.length < 2 || legalName.length > 200) return { error: "ชื่อผู้ประกอบการต้องมี 2–200 ตัวอักษร และกรอกได้ทั้งตัวอักษรหรือตัวเลข" };
  if (address.length < 5 || address.length > 500) return { error: "ที่อยู่ต้องมี 5–500 ตัวอักษร และกรอกได้ทั้งตัวอักษรหรือตัวเลข" };
  if (allowTestTaxId ? (!taxpayerId || taxpayerId.length > 50) : !isThaiTaxId(taxpayerId)) {
    return { error: allowTestTaxId ? "กรอกค่าเลขทดสอบไม่เกิน 50 ตัวอักษร" : "เลขประจำตัวผู้เสียภาษีต้องเป็นเลข 13 หลักที่ถูกต้อง" };
  }
  if (!/^\d{5}$/.test(branchNumber)) return { error: "รหัสสาขาต้องเป็นตัวเลข 5 หลัก เช่น 00000" };
  if (!/^[A-Z0-9-]{1,10}$/.test(prefix) || !Number.isFinite(rate) || rate < 0 || rate > 20) return { error: "ตรวจคำนำหน้าเอกสารและอัตราภาษีอีกครั้ง" };
  try {
    await db.taxProfile.upsert({
      where: { branchId },
      create: { organizationId: user.organizationId, branchId, legalName, taxpayerId, address, branchNumber, isVatRegistered: registered, vatRateBps: Math.round(rate * 100), taxIncluded: included, documentPrefix: prefix },
      update: { legalName, taxpayerId, address, branchNumber, isVatRegistered: registered, vatRateBps: Math.round(rate * 100), taxIncluded: included, documentPrefix: prefix },
    });
    revalidatePath("/settings/tax");
    revalidatePath("/settings/readiness");
    revalidatePath("/pos");
    return { success: "บันทึกข้อมูลผู้ขายภาษีแล้ว มีผลกับบิลที่เปิดใหม่" };
  } catch {
    return { error: "บันทึกข้อมูลภาษีไม่สำเร็จ" };
  }
}

export async function issueTaxInvoice(_: CommerceState, data: FormData): Promise<CommerceState> {
  const billId = text(data, "billId");
  const branchId = text(data, "branchId");
  const buyerName = text(data, "buyerName");
  const buyerAddress = text(data, "buyerAddress");
  const rawBuyerId = text(data, "buyerTaxId").replace(/\D/g, "");
  if (!billId || !branchId || buyerName.length < 2 || buyerName.length > 200 || buyerAddress.length < 5 || buyerAddress.length > 500 || (rawBuyerId && !isThaiTaxId(rawBuyerId))) return { error: "กรอกชื่อและที่อยู่ผู้ซื้อให้ครบ และตรวจเลขผู้เสียภาษี 13 หลัก" };
  const user = await requirePermission("payment.manage", branchId);
  try {
    const invoice = await db.$transaction(async (tx) => {
      const bill = await tx.bill.findFirst({ where: { id: billId, branchId, status: "PAID", branch: { organizationId: user.organizationId } }, select: { id: true, billNumber: true, subtotalSatang: true, discountSatang: true, taxSatang: true, taxIncluded: true, taxRateBps: true, totalSatang: true, lines: { orderBy: { createdAt: "asc" }, select: { nameSnapshot: true, quantity: true, unitPriceSatang: true, subtotalSatang: true } } } });
      if (!bill) throw new Error("ใบกำกับภาษีออกได้หลังชำระบิลครบแล้ว");
      if (bill.taxRateBps <= 0) throw new Error("บิลนี้ไม่ได้บันทึก VAT ตอนเปิดบิล จึงออกใบกำกับภาษีย้อนหลังไม่ได้");
      await tx.$queryRaw`SELECT id FROM "TaxProfile" WHERE "branchId" = ${branchId} FOR UPDATE`;
      const profile = await tx.taxProfile.findUnique({ where: { branchId }, select: { id: true, legalName: true, taxpayerId: true, address: true, branchNumber: true, isVatRegistered: true, documentPrefix: true, nextDocumentNumber: true } });
      if (!profile?.isVatRegistered) throw new Error("สาขานี้ยังไม่ได้ระบุว่าจดทะเบียน VAT");
      if (await tx.taxInvoice.findUnique({ where: { billId }, select: { id: true } })) throw new Error("บิลนี้ออกใบกำกับภาษีแล้ว");
      const serial = profile.nextDocumentNumber;
      const invoiceNumber = `${profile.documentPrefix}-${new Date().getFullYear()}-${String(serial).padStart(6, "0")}`;
      await tx.taxProfile.update({ where: { id: profile.id }, data: { nextDocumentNumber: { increment: 1 } } });
      return tx.taxInvoice.create({ data: {
        organizationId: user.organizationId, taxProfileId: profile.id, billId, invoiceNumber,
        sellerSnapshot: { legalName: profile.legalName, taxpayerId: profile.taxpayerId, address: profile.address, branchNumber: profile.branchNumber, vatRateBps: bill.taxRateBps },
        buyerSnapshot: { name: buyerName, address: buyerAddress, taxpayerId: rawBuyerId || null },
        itemsSnapshot: bill.lines.map((line) => ({ ...line })),
        subtotalSatang: bill.subtotalSatang, discountSatang: bill.discountSatang,
        taxableSatang: Math.max(0, bill.subtotalSatang - bill.discountSatang - (bill.taxIncluded ? bill.taxSatang : 0)), taxSatang: bill.taxSatang, totalSatang: bill.totalSatang,
      }, select: { id: true, invoiceNumber: true } });
    }, { maxWait: 10_000, timeout: 20_000, isolationLevel: "Serializable" });
    revalidatePath(`/pos/${branchId}`);
    revalidatePath(`/tax-invoices/${invoice.id}`);
    return { success: `ออกใบกำกับภาษีเลขที่ ${invoice.invoiceNumber} แล้ว` };
  } catch (error) { return { error: error instanceof Error ? error.message : "ออกใบกำกับภาษีไม่สำเร็จ" }; }
}
