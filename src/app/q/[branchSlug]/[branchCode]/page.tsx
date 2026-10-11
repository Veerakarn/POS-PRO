import { OrderingClient } from "@/components/ordering-client";

export default async function CustomerOrderingPage({
  params,
}: {
  params: Promise<{ branchSlug: string; branchCode: string }>;
}) {
  const { branchCode } = await params;

  return <OrderingClient tableCode={branchCode} />;
}
