require("@next/env").loadEnvConfig(process.cwd());
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");

const db = new PrismaClient();

after(async () => db.$disconnect());

function isTenantGuardRejection(error) {
  return error?.code === "P2004" || /must belong to (the same|the user) organization/i.test(error?.message ?? "");
}

test("role assignments enforce global uniqueness and organization boundaries", async () => {
  const fixtureId = randomUUID();
  const slugs = [`auth-db-a-${fixtureId}`, `auth-db-b-${fixtureId}`];

  try {
    const organizationA = await db.organization.create({
      data: {
        name: "Authorization DB test A",
        slug: slugs[0],
        branches: { create: { name: "Branch A", code: "A" } },
        users: { create: { email: `staff-a-${fixtureId}@example.test`, displayName: "Staff A" } },
        roles: { create: { name: "Role A", permissions: ["pos.use"] } },
      },
      include: { branches: true, roles: true, users: true },
    });
    const organizationB = await db.organization.create({
      data: {
        name: "Authorization DB test B",
        slug: slugs[1],
        branches: { create: { name: "Branch B", code: "B" } },
        users: { create: { email: `staff-b-${fixtureId}@example.test`, displayName: "Staff B" } },
        roles: { create: { name: "Role B", permissions: ["pos.use"] } },
      },
      include: { branches: true, roles: true, users: true },
    });

    const userA = organizationA.users[0];
    const roleA = organizationA.roles[0];
    const roleB = organizationB.roles[0];
    const branchB = organizationB.branches[0];

    await db.roleAssignment.create({
      data: { userId: userA.id, roleId: roleA.id, branchId: null },
    });

    await assert.rejects(
      db.roleAssignment.create({
        data: { userId: userA.id, roleId: roleA.id, branchId: null },
      }),
      (error) => error?.code === "P2002",
      "the partial unique index must reject a duplicate global assignment",
    );
    assert.equal(
      await db.roleAssignment.count({
        where: { userId: userA.id, roleId: roleA.id, branchId: null },
      }),
      1,
    );

    await assert.rejects(
      db.roleAssignment.create({
        data: { userId: userA.id, roleId: roleB.id, branchId: null },
      }),
      isTenantGuardRejection,
      "the database trigger must reject a role from another organization",
    );
    assert.equal(
      await db.roleAssignment.count({ where: { userId: userA.id, roleId: roleB.id } }),
      0,
    );

    await assert.rejects(
      db.roleAssignment.create({
        data: { userId: userA.id, roleId: roleA.id, branchId: branchB.id },
      }),
      isTenantGuardRejection,
      "the database trigger must reject a branch from another organization",
    );
    assert.equal(
      await db.roleAssignment.count({
        where: { userId: userA.id, roleId: roleA.id, branchId: branchB.id },
      }),
      0,
    );
  } finally {
    await db.organization.deleteMany({ where: { slug: { in: slugs } } });
  }
});
