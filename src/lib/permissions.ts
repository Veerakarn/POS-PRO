export const permissionCatalog = [
  { key: "organization.manage", label: "ตั้งค่าองค์กร", description: "แก้ข้อมูลหลักของร้าน", scope: "organization" },
  { key: "branch.manage", label: "จัดการสาขา", description: "เพิ่มและตั้งค่าสาขา", scope: "organization" },
  { key: "menu.manage", label: "จัดการเมนูกลาง", description: "หมวดหมู่ เมนู ราคา และสูตรกลาง", scope: "organization" },
  { key: "user.manage", label: "จัดการพนักงาน", description: "บัญชี บทบาท PIN และสิทธิ์", scope: "organization" },
  { key: "table.manage", label: "จัดการโต๊ะและ QR", description: "โต๊ะและ QR ภายในสาขา", scope: "branch" },
  { key: "pos.use", label: "ใช้งาน Counter POS", description: "เปิดโต๊ะและรับออเดอร์ที่เคาน์เตอร์", scope: "branch" },
  { key: "kitchen.view", label: "ดูคิวครัวและบาร์", description: "ดูรายการที่ต้องผลิตในครัวหรือบาร์", scope: "branch" },
  { key: "service.manage", label: "ดูแลคำขอจากโต๊ะ", description: "รับเรื่องเรียกพนักงานและเช็กบิล", scope: "branch" },
  { key: "payment.manage", label: "รับชำระเงิน", description: "เช็กบิลและบันทึกการชำระ", scope: "branch" },
  { key: "inventory.manage", label: "วัตถุดิบและสต็อก", description: "รับเข้า ตรวจนับ ของเสีย และต้นทุน", scope: "branch" },
  { key: "printer.manage", label: "เครื่องพิมพ์", description: "ตั้งค่าเครื่องพิมพ์และงานพิมพ์", scope: "branch" },
  { key: "report.view", label: "ดูรายงาน", description: "ยอดขายและภาพรวมของสาขาที่ได้รับสิทธิ์", scope: "branch" },
] as const;

export type PermissionKey = (typeof permissionCatalog)[number]["key"];

export const knownPermissionKeys = new Set<string>(permissionCatalog.map((permission) => permission.key));
export const organizationPermissionKeys = new Set<string>(
  permissionCatalog.filter((permission) => permission.scope === "organization").map((permission) => permission.key),
);

export const roleTemplates = [
  { name: "ผู้จัดการสาขา", permissions: ["table.manage", "pos.use", "kitchen.view", "service.manage", "payment.manage", "inventory.manage", "printer.manage", "report.view"] },
  { name: "แคชเชียร์", permissions: ["pos.use", "service.manage", "payment.manage"] },
  { name: "ครัว / บาร์", permissions: ["kitchen.view"] },
  { name: "พนักงานบริการ", permissions: ["pos.use", "service.manage"] },
  { name: "สต็อก", permissions: ["inventory.manage", "report.view"] },
] as const;

export function normalizePermissions(values: string[]) {
  return [...new Set(values.filter((permission) => knownPermissionKeys.has(permission)))].sort();
}
