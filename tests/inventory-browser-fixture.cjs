require("@next/env").loadEnvConfig(process.cwd());
const { PrismaClient } = require("@prisma/client");
const { randomUUID, randomBytes, scryptSync } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const db = new PrismaClient();
const fixturePath = path.resolve("node_modules/.cache/inventory-browser-fixture.json");

async function main() {
  if (process.argv[2] === "cleanup") {
    if (!fs.existsSync(fixturePath)) return;
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    if (!fixture.slug.startsWith("inventory-browser-test-")) throw new Error("Invalid test fixture");
    const org = await db.organization.findFirst({ where: { id: fixture.organizationId, slug: fixture.slug } });
    if (org) await db.$transaction(async (tx) => {
      const branchScope = { branch: { organizationId: org.id } };
      await tx.stockMovement.deleteMany({ where: branchScope });
      await tx.inventoryBalance.deleteMany({ where: branchScope });
      await tx.order.deleteMany({ where: branchScope });
      await tx.tableSession.deleteMany({ where: branchScope });
      await tx.menuItem.deleteMany({ where: { organizationId: org.id } });
      await tx.organization.delete({ where: { id: org.id } });
    }, { timeout: 30000 });
    fs.unlinkSync(fixturePath);
    console.log("Browser test organization and login removed");
    return;
  }
  if (fs.existsSync(fixturePath)) throw new Error("Clean up the previous browser fixture first");
  const slug = `inventory-browser-test-${randomUUID()}`;
  const email = `${slug}@example.invalid`;
  const pin = "849263";
  const salt = randomBytes(16).toString("hex");
  const pinHash = `${salt}:${scryptSync(pin, salt, 64).toString("hex")}`;
  const org = await db.$transaction(async (tx) => {
    const created = await tx.organization.create({ data: { name: "ร้านทดสอบสต็อก", slug,
      branches: { create: { name: "สาขาทดสอบ", code: "TEST", tables: { create: { code: "T1", name: "โต๊ะทดสอบ", qrSecret: randomUUID() } } } },
      users: { create: { email, displayName: "บัญชีทดสอบชั่วคราว", pinHash } },
      roles: { create: { name: "Owner", permissions: ["inventory.manage", "report.view", "menu.manage", "table.manage", "order.manage"] } },
      categories: { create: { name: "อาหารทดสอบ" } },
    }, include: { branches: { include: { tables: true } }, users: true, roles: true, categories: true } });
    await tx.roleAssignment.create({ data: { userId: created.users[0].id, roleId: created.roles[0].id } });
    await tx.menuItem.create({ data: { name: "ข้าวหมูทดสอบ", organizationId: created.id, categoryId: created.categories[0].id, priceSatang: 8000 } });
    return created;
  }, { timeout: 30000 });
  const fixture = { organizationId: org.id, slug, branchId: org.branches[0].id, email, pin,
    qrUrl: `http://localhost:3000/q/${slug}/TEST/T1?k=${org.branches[0].tables[0].qrSecret}` };
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
  fs.writeFileSync(fixturePath, JSON.stringify(fixture));
  console.log(JSON.stringify(fixture));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
