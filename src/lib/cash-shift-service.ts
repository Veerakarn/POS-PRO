import { Prisma } from "@prisma/client";

type TransactionClient = Prisma.TransactionClient;

export class CashShiftError extends Error {}

export async function closeCashShiftLedger(tx: TransactionClient, input: {
  branchId: string;
  shiftId: string;
  userId: string;
  closingCashSatang: number;
  note?: string;
}) {
  const shift = await tx.cashShift.findFirst({
    where: { id: input.shiftId, branchId: input.branchId, userId: input.userId, status: "OPEN" },
    select: { id: true, openingCashSatang: true },
  });
  if (!shift) throw new CashShiftError("ไม่พบกะที่เปิดอยู่");

  const cashMethods = await tx.paymentMethodSetting.findMany({
    where: { branchId: input.branchId, isCash: true },
    select: { code: true },
  });
  const codes = cashMethods.map((method) => method.code);
  const [payments, refunds] = await Promise.all([
    tx.payment.aggregate({
      where: { cashShiftId: shift.id, method: { in: codes }, status: { in: ["SUCCEEDED", "REFUNDED"] } },
      _sum: { amountSatang: true },
    }),
    tx.refund.aggregate({
      where: { cashShiftId: shift.id, status: "SUCCEEDED" },
      _sum: { amountSatang: true },
    }),
  ]);
  const cashIn = payments._sum.amountSatang ?? 0;
  const cashOut = refunds._sum.amountSatang ?? 0;
  const expectedCashSatang = shift.openingCashSatang + cashIn - cashOut;
  const differenceSatang = input.closingCashSatang - expectedCashSatang;

  await tx.cashShift.update({
    where: { id: shift.id },
    data: {
      status: "CLOSED",
      expectedCashSatang,
      closingCashSatang: input.closingCashSatang,
      differenceSatang,
      closedAt: new Date(),
      note: input.note || undefined,
    },
  });

  return { shiftId: shift.id, expectedCashSatang, differenceSatang, cashIn, cashOut };
}
