"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { encodeProfileImage } from "@/lib/profile-image";

export type ProfileState = { error?: string; success?: string };

export async function updateOwnProfile(_: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await requireAuthenticatedUser();
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName || displayName.length > 80) return { error: "กรอกชื่อที่แสดง 1–80 ตัวอักษร" };
  let avatarData: string | null | undefined = formData.get("removeAvatar") === "yes" ? null : undefined;
  const file = formData.get("avatar");
  if (file instanceof File && file.size) {
    try {
      avatarData = await encodeProfileImage(file);
    } catch (error) { return { error: error instanceof Error ? error.message : "อ่านรูปภาพไม่สำเร็จ" }; }
  }
  try {
    await db.user.update({ where: { id: user.id, organizationId: user.organizationId }, data: { displayName, avatarData } });
  } catch { return { error: "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง" }; }
  revalidatePath("/", "layout");
  return { success: "บันทึกโปรไฟล์เรียบร้อยแล้ว" };
}
