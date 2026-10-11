require("@next/env").loadEnvConfig(process.cwd());
const { randomBytes, randomUUID, scryptSync } = require("node:crypto");
const { PrismaClient, Prisma } = require("@prisma/client");

const db = new PrismaClient();
const PREFIX = "browser-e2e-";

function pinHash(pin) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pin, salt, 64).toString("hex")}`;
}

async function cleanup() {
  const fixtures = await db.organization.findMany({
    where: { slug: { startsWith: PREFIX } },
    select: { id: true, branches: { select: { id: true } } },
  });
  const organizationIds = fixtures.map((fixture) => fixture.id);
  const branchIds = fixtures.flatMap((fixture) => fixture.branches.map((branch) => branch.id));

  if (organizationIds.length > 0) {
    const [bills, orders] = await Promise.all([
      db.bill.findMany({ where: { branchId: { in: branchIds } }, select: { id: true } }),
      db.order.findMany({ where: { branchId: { in: branchIds } }, select: { id: true } }),
    ]);
    const billIds = bills.map((bill) => bill.id);
    const orderIds = orders.map((order) => order.id);
    const orderItems = await db.orderItem.findMany({
      where: { orderId: { in: orderIds } },
      select: { id: true },
    });
    const orderItemIds = orderItems.map((item) => item.id);

    // Historical sales tables intentionally use RESTRICT relations. Delete the
    // isolated E2E tenant in dependency order before removing its organization.
    await db.$transaction([
      db.refund.deleteMany({ where: { branchId: { in: branchIds } } }),
      db.billDiscount.deleteMany({ where: { billId: { in: billIds } } }),
      db.billLine.deleteMany({ where: { billId: { in: billIds } } }),
      db.payment.deleteMany({ where: { billId: { in: billIds } } }),
      db.bill.deleteMany({ where: { id: { in: billIds } } }),
      db.stockMovement.deleteMany({ where: { branchId: { in: branchIds } } }),
      db.orderItemIngredient.deleteMany({ where: { orderItemId: { in: orderItemIds } } }),
      db.orderItem.deleteMany({ where: { id: { in: orderItemIds } } }),
      db.order.deleteMany({ where: { id: { in: orderIds } } }),
      db.cashShift.deleteMany({ where: { branchId: { in: branchIds } } }),
      db.printJob.deleteMany({ where: { branchId: { in: branchIds } } }),
      db.serviceRequest.deleteMany({ where: { branchId: { in: branchIds } } }),
      db.tableSession.deleteMany({ where: { branchId: { in: branchIds } } }),
      db.inventoryBalance.deleteMany({ where: { branchId: { in: branchIds } } }),
      db.recipeItem.deleteMany({ where: { menuItem: { organizationId: { in: organizationIds } } } }),
      db.organization.deleteMany({ where: { id: { in: organizationIds } } }),
    ]);
  }
  console.log(JSON.stringify({ cleanedOrganizations: fixtures.length }));
}

async function create() {
  await cleanup();
  const suffix = randomUUID().slice(0, 8);
  const email = `browser-e2e-${suffix}@example.test`;
  const pin = "654321";
  const permissions = ["organization.manage", "branch.manage", "menu.manage", "user.manage", "table.manage", "pos.use", "kitchen.view", "service.manage", "payment.manage", "inventory.manage", "printer.manage", "report.view"];
  const fixture = await db.organization.create({
    data: {
      name: "POS E2E Test",
      slug: `${PREFIX}${suffix}`,
      branches: { create: { name: "Test Branch", code: "TST" } },
      categories: { create: { name: "อาหารทดสอบ" } },
      ingredients: { create: { name: "วัตถุดิบทดสอบ", unit: "PIECE" } },
      users: { create: { email, displayName: "E2E Owner", pinHash: pinHash(pin) } },
      roles: { create: { name: "Owner", description: "Browser E2E", permissions, isSystem: true } },
    },
    include: { branches: true, categories: true, ingredients: true, users: true, roles: true },
  });
  const branch = fixture.branches[0];
  const station = await db.productionStation.create({ data: { branchId: branch.id, name: "Test Kitchen", kind: "KITCHEN" } });
  const menu = await db.menuItem.create({ data: { organizationId: fixture.id, categoryId: fixture.categories[0].id, name: "ข้าวทดสอบ", description: "รายการสำหรับ browser E2E", priceSatang: 12000, stationRoutes: { create: { stationId: station.id } }, recipeItems: { create: { ingredientId: fixture.ingredients[0].id, quantity: new Prisma.Decimal(1) } } } });
  await db.inventoryBalance.create({ data: { branchId: branch.id, ingredientId: fixture.ingredients[0].id, quantity: new Prisma.Decimal(100), averageCostSatang: new Prisma.Decimal(3000), lowStockThreshold: new Prisma.Decimal(10) } });
  const table = await db.restaurantTable.create({ data: { branchId: branch.id, code: "T1", name: "โต๊ะทดสอบ 1", capacity: 4, qrSecret: randomUUID() } });
  await db.paymentMethodSetting.createMany({ data: [
    { branchId: branch.id, code: "CASH", name: "เงินสด", isCash: true, sortOrder: 10 },
    { branchId: branch.id, code: "QR_PAYMENT", name: "QR Payment", isCash: false, sortOrder: 20 },
  ] });
  await db.roleAssignment.create({ data: { userId: fixture.users[0].id, roleId: fixture.roles[0].id } });
  console.log(JSON.stringify({ organizationId: fixture.id, branchId: branch.id, tableId: table.id, menuId: menu.id, email, pin }));
}

async function verifyPages() {
  const fixture = await db.organization.findFirst({
    where: { slug: { startsWith: PREFIX } },
    select: { users: { take: 1, select: { id: true } }, branches: { take: 1, select: { id: true } } },
  });
  if (!fixture?.users[0] || !fixture.branches[0]) throw new Error("Browser E2E fixture is missing");
  const token = randomBytes(32).toString("base64url");
  const tokenHash = require("node:crypto").createHash("sha256").update(token).digest("hex");
  const session = await db.session.create({ data: { userId: fixture.users[0].id, tokenHash, expiresAt: new Date(Date.now() + 10 * 60_000) } });
  const branchId = fixture.branches[0].id;
  const routes = [
    ["/dashboard", "ภาพรวมองค์กร"],
    [`/pos/${branchId}`, "Counter POS"],
    ["/shifts", "กะเงินสดและช่องทางชำระ"],
    ["/sales", "รายการขายและคืนเงิน"],
    ["/reports", "รายงานร้าน"],
    ["/audit", "ประวัติการทำรายการ"],
    ["/inventory", "คลังของ"],
    [`/kitchen/${branchId}`, "คิวครัวและบาร์"],
  ];
  try {
    const results = [];
    for (const [path, expected] of routes) {
      const response = await fetch(`http://localhost:3000${path}`, { headers: { Cookie: `pospro_session=${token}` }, redirect: "manual" });
      const body = await response.text();
      results.push({ path, status: response.status, matched: body.includes(expected) });
    }
    console.log(JSON.stringify({ results }));
    if (results.some((result) => result.status !== 200 || !result.matched)) process.exitCode = 1;
  } finally {
    await db.session.delete({ where: { id: session.id } });
  }
}

const command = process.argv[2];
const operation = command === "cleanup" ? cleanup : command === "verify-pages" ? verifyPages : create;
operation().finally(() => db.$disconnect());
