import { notFound } from "next/navigation";
import { connection } from "next/server";

import {
  OrderingClient,
  type OrderingMenuItem,
} from "@/components/ordering-client";
import { db } from "@/lib/db";

export default async function LiveCustomerOrderingPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchSlug: string; branchCode: string; tableCode: string }>;
  searchParams: Promise<{ k?: string }>;
}) {
  await connection();
  const [{ branchSlug, branchCode, tableCode }, { k: qrSecret }] = await Promise.all([params, searchParams]);
  if (!qrSecret) notFound();

  const table = await db.restaurantTable.findFirst({
    where: {
      code: tableCode.toUpperCase(),
      qrSecret,
      isActive: true,
      branch: {
        code: branchCode.toUpperCase(),
        organization: {
          slug: branchSlug.toLowerCase(),
        },
      },
    },
    select: {
      name: true,
      code: true,
      branch: {
        select: {
          name: true,
          organization: {
            select: {
              name: true,
              menuItems: {
                where: { isActive: true },
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  name: true,
                  description: true,
                  priceSatang: true,
                  imageUrl: true,
                  category: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!table) notFound();

  const menuItems: OrderingMenuItem[] = table.branch.organization.menuItems.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    priceSatang: item.priceSatang,
    imageUrl: item.imageUrl,
    category: item.category.name,
  }));

  return (
    <OrderingClient
      branchName={table.branch.name}
      menuItems={menuItems}
      restaurantName={table.branch.organization.name}
      tableCode={table.code}
      tableName={table.name}
      orderingContext={{
        branchSlug,
        branchCode,
        qrSecret,
      }}
    />
  );
}
