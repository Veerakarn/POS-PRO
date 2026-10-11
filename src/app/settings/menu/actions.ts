"use server";

import { revalidatePath } from "next/cache";

import { requireOrganizationPermission } from "@/lib/auth";
import { db } from "@/lib/db";

export type MenuState = {
  error?: string;
  success?: string;
};

function readText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function parsePriceSatang(value: string) {
  const normalized = value.replace(/,/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const satang = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(satang) && satang > 0 && satang <= 10_000_000 ? satang : null;
}

function refreshMenuPages() {
  revalidatePath("/settings/menu");
  revalidatePath("/settings/stations");
  revalidatePath("/pos");
  revalidatePath("/kitchen");
  revalidatePath("/dashboard");
}

export async function createMenuCategory(_: MenuState, formData: FormData): Promise<MenuState> {
  const user = await requireOrganizationPermission("menu.manage");
  const name = readText(formData, "name");
  if (!name || name.length > 60) return { error: "กรอกชื่อหมวดหมู่ไม่เกิน 60 ตัวอักษร" };

  try {
    const category = await db.$transaction(async (tx) => {
      const lastCategory = await tx.menuCategory.aggregate({
        where: { organizationId: user.organizationId },
        _max: { sortOrder: true },
      });
      const createdCategory = await tx.menuCategory.create({
        data: {
          organizationId: user.organizationId,
          name,
          sortOrder: (lastCategory._max.sortOrder ?? -1) + 1,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          actorId: user.id,
          action: "menu_category.created",
          entityType: "MenuCategory",
          entityId: createdCategory.id,
          after: { name: createdCategory.name },
        },
      });
      return createdCategory;
    });
    refreshMenuPages();
    return { success: `เพิ่มหมวดหมู่ ${category.name} แล้ว` };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    if (code === "P2002") return { error: "มีหมวดหมู่นี้อยู่แล้ว" };
    return { error: "เพิ่มหมวดหมู่ไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }
}

export async function createMenuItem(_: MenuState, formData: FormData): Promise<MenuState> {
  const user = await requireOrganizationPermission("menu.manage");
  const categoryId = readText(formData, "categoryId");
  const name = readText(formData, "name");
  const description = readText(formData, "description");
  const sku = readText(formData, "sku").toUpperCase();
  const imageUrl = readText(formData, "imageUrl");
  const priceSatang = parsePriceSatang(readText(formData, "price"));

  if (!categoryId || !name || name.length > 100 || !priceSatang) {
    return { error: "กรอกชื่อเมนูและราคาให้ถูกต้อง (มากกว่า 0 บาท)" };
  }
  if (sku && !/^[A-Z0-9_-]{2,32}$/.test(sku)) {
    return { error: "SKU ใช้ A-Z, 0-9, _ หรือ - ความยาว 2–32 ตัว" };
  }
  if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
    return { error: "URL รูปภาพต้องขึ้นต้นด้วย http:// หรือ https://" };
  }

  const category = await db.menuCategory.findFirst({
    where: {
      id: categoryId,
      organizationId: user.organizationId,
    },
    select: { id: true },
  });
  if (!category) return { error: "ไม่พบหมวดหมู่ที่เลือก" };

  try {
    const menuItem = await db.$transaction(async (tx) => {
      const createdItem = await tx.menuItem.create({
        data: {
          organizationId: user.organizationId,
          categoryId: category.id,
          name,
          description: description || null,
          sku: sku || null,
          imageUrl: imageUrl || null,
          priceSatang,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          actorId: user.id,
          action: "menu_item.created",
          entityType: "MenuItem",
          entityId: createdItem.id,
          after: {
            name: createdItem.name,
            categoryId: createdItem.categoryId,
            priceSatang: createdItem.priceSatang,
          },
        },
      });
      return createdItem;
    });
    refreshMenuPages();
    return { success: `เพิ่มเมนู ${menuItem.name} แล้ว` };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    if (code === "P2002") return { error: "SKU นี้ถูกใช้แล้ว" };
    return { error: "เพิ่มเมนูไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }
}

export async function updateMenuItem(_: MenuState, formData: FormData): Promise<MenuState> {
  const user = await requireOrganizationPermission("menu.manage");
  const menuItemId = readText(formData, "menuItemId");
  const categoryId = readText(formData, "categoryId");
  const name = readText(formData, "name");
  const description = readText(formData, "description");
  const sku = readText(formData, "sku").toUpperCase();
  const imageUrl = readText(formData, "imageUrl");
  const priceSatang = parsePriceSatang(readText(formData, "price"));

  if (!menuItemId || !categoryId || !name || name.length > 100 || !priceSatang) {
    return { error: "กรอกชื่อเมนูและราคาให้ถูกต้อง (มากกว่า 0 บาท)" };
  }
  if (sku && !/^[A-Z0-9_-]{2,32}$/.test(sku)) {
    return { error: "SKU ใช้ A-Z, 0-9, _ หรือ - ความยาว 2–32 ตัว" };
  }
  if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
    return { error: "URL รูปภาพต้องขึ้นต้นด้วย http:// หรือ https://" };
  }

  const [menuItem, category] = await Promise.all([
    db.menuItem.findFirst({
      where: { id: menuItemId, organizationId: user.organizationId, isActive: true },
      select: { id: true, categoryId: true, name: true, description: true, sku: true, imageUrl: true, priceSatang: true },
    }),
    db.menuCategory.findFirst({
      where: { id: categoryId, organizationId: user.organizationId, isActive: true },
      select: { id: true },
    }),
  ]);
  if (!menuItem || !category) return { error: "ไม่พบเมนูหรือหมวดหมู่ที่เลือก" };

  try {
    await db.$transaction(async (tx) => {
      await tx.menuItem.update({
        where: { id: menuItem.id },
        data: {
          categoryId: category.id,
          name,
          description: description || null,
          sku: sku || null,
          imageUrl: imageUrl || null,
          priceSatang,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          actorId: user.id,
          action: "menu_item.updated",
          entityType: "MenuItem",
          entityId: menuItem.id,
          before: {
            categoryId: menuItem.categoryId,
            name: menuItem.name,
            description: menuItem.description,
            sku: menuItem.sku,
            imageUrl: menuItem.imageUrl,
            priceSatang: menuItem.priceSatang,
          },
          after: { categoryId: category.id, name, description: description || null, sku: sku || null, imageUrl: imageUrl || null, priceSatang },
        },
      });
    });
    refreshMenuPages();
    return { success: `บันทึกการแก้ไข ${name} แล้ว` };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    if (code === "P2002") return { error: "SKU นี้ถูกใช้แล้ว" };
    return { error: "แก้ไขเมนูไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }
}

export async function archiveMenuItem(_: MenuState, formData: FormData): Promise<MenuState> {
  const user = await requireOrganizationPermission("menu.manage");
  const menuItemId = readText(formData, "menuItemId");
  if (!menuItemId) return { error: "ไม่พบเมนูที่ต้องการลบ" };

  const menuItem = await db.menuItem.findFirst({
    where: { id: menuItemId, organizationId: user.organizationId, isActive: true },
    select: { id: true, name: true },
  });
  if (!menuItem) return { error: "เมนูนี้ถูกลบจากรายการขายแล้ว" };

  try {
    await db.$transaction(async (tx) => {
      await tx.menuItem.update({ where: { id: menuItem.id }, data: { isActive: false } });
      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          actorId: user.id,
          action: "menu_item.archived",
          entityType: "MenuItem",
          entityId: menuItem.id,
          before: { name: menuItem.name, isActive: true },
          after: { isActive: false },
        },
      });
    });
    refreshMenuPages();
    return { success: `ลบ ${menuItem.name} ออกจากรายการขายแล้ว` };
  } catch {
    return { error: "ลบเมนูไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }
}
