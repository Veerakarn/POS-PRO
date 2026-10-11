require("@next/env").loadEnvConfig(process.cwd());
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");

const db = new PrismaClient();

after(async () => db.$disconnect());

test("a table can have only one OPEN, CHECK_REQUESTED or PAYMENT_IN_PROGRESS session", async () => {
  const fixtureId = randomUUID();
  const slug = `active-table-session-${fixtureId}`;

  try {
    const organization = await db.organization.create({
      data: {
        name: "Active table session DB test",
        slug,
        branches: {
          create: {
            name: "Test branch",
            code: "TEST",
            tables: {
              create: {
                name: "Table 1",
                code: "T1",
                qrSecret: randomUUID(),
              },
            },
          },
        },
      },
      include: { branches: { include: { tables: true } } },
    });
    const branch = organization.branches[0];
    const table = branch.tables[0];

    const paymentSession = await db.tableSession.create({
      data: {
        branchId: branch.id,
        tableId: table.id,
        status: "PAYMENT_IN_PROGRESS",
        accessNonce: randomUUID(),
      },
    });

    await assert.rejects(
      db.tableSession.create({
        data: { branchId: branch.id, tableId: table.id, status: "OPEN", accessNonce: randomUUID() },
      }),
      (error) => error?.code === "P2002",
      "PAYMENT_IN_PROGRESS must still reserve the table",
    );

    await db.tableSession.update({
      where: { id: paymentSession.id },
      data: { status: "CLOSED", closedAt: new Date() },
    });
    const openSession = await db.tableSession.create({
      data: { branchId: branch.id, tableId: table.id, status: "OPEN", accessNonce: randomUUID() },
    });

    await assert.rejects(
      db.tableSession.update({
        where: { id: paymentSession.id },
        data: { status: "CHECK_REQUESTED", closedAt: null },
      }),
      (error) => error?.code === "P2002",
      "reactivating a historical session must not bypass the unique active-session rule",
    );
    assert.equal((await db.tableSession.findUnique({ where: { id: openSession.id } })).status, "OPEN");
  } finally {
    await db.organization.deleteMany({ where: { slug } });
  }
});
