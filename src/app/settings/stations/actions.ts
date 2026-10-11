"use server";

import { revalidatePath } from "next/cache";

import { requireOrganizationPermission } from "@/lib/auth";
import { db } from "@/lib/db";

export type StationState = {
  error?: string;
  success?: string;
};

function readText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function refreshStationPages(branchId: string) {
  revalidatePath("/settings/stations");
  revalidatePath(`/kitchen/${branchId}`);
  revalidatePath("/kitchen");
  revalidatePath(`/pos/${branchId}`);
  revalidatePath("/dashboard");
}

export async function createProductionStation(_: StationState, formData: FormData): Promise<StationState> {
  const user = await requireOrganizationPermission("menu.manage");
  const branchId = readText(formData, "branchId");
  const name = readText(formData, "name");
  const kind = readText(formData, "kind");
  const allowedKinds = ["KITCHEN", "BAR", "SERVICE", "OTHER"];

  if (!branchId || !name || name.length > 60 || !allowedKinds.includes(kind)) {
    return { error: "กรอกชื่อจุดผลิตและประเภทให้ถูกต้อง" };
  }

  const branch = await db.branch.findFirst({
    where: { id: branchId, organizationId: user.organizationId },
    select: { id: true },
  });
  if (!branch) return { error: "ไม่พบสาขาที่เลือก" };

  try {
    const station = await db.$transaction(async (tx) => {
      const createdStation = await tx.productionStation.create({
        data: { branchId: branch.id, name, kind },
      });
      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          branchId: branch.id,
          actorId: user.id,
          action: "production_station.created",
          entityType: "ProductionStation",
          entityId: createdStation.id,
          after: { name: createdStation.name, kind: createdStation.kind },
        },
      });
      return createdStation;
    });
    refreshStationPages(branch.id);
    return { success: `เพิ่มจุดผลิต ${station.name} แล้ว` };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    if (code === "P2002") return { error: "มีจุดผลิตชื่อนี้ในสาขาที่เลือกแล้ว" };
    return { error: "เพิ่มจุดผลิตไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }
}

export async function routeMenuItemToStation(_: StationState, formData: FormData): Promise<StationState> {
  const user = await requireOrganizationPermission("menu.manage");
  const stationId = readText(formData, "stationId");
  const menuItemId = readText(formData, "menuItemId");
  if (!stationId || !menuItemId) return { error: "เลือกจุดผลิตและเมนูที่ต้องการ" };

  const [station, menuItem] = await Promise.all([
    db.productionStation.findFirst({
      where: { id: stationId, branch: { organizationId: user.organizationId }, isActive: true },
      select: { id: true, branchId: true, name: true },
    }),
    db.menuItem.findFirst({
      where: { id: menuItemId, organizationId: user.organizationId, isActive: true },
      select: { id: true, name: true },
    }),
  ]);
  if (!station || !menuItem) return { error: "ไม่พบจุดผลิตหรือเมนูที่เลือก" };

  try {
    await db.$transaction(async (tx) => {
      const route = await tx.menuItemStation.create({
        data: { stationId: station.id, menuItemId: menuItem.id },
      });
      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          branchId: station.branchId,
          actorId: user.id,
          action: "menu_item.routed_to_station",
          entityType: "MenuItemStation",
          entityId: route.id,
          after: { stationId: station.id, menuItemId: menuItem.id },
        },
      });
    });
    refreshStationPages(station.branchId);
    return { success: `ส่ง ${menuItem.name} ไปยัง ${station.name} แล้ว` };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    if (code === "P2002") return { error: "เมนูนี้ถูกกำหนดไปยังจุดผลิตนี้แล้ว" };
    return { error: "กำหนดเส้นทางเมนูไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }
}
