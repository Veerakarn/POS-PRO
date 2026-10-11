import { Prisma } from "@prisma/client";

const D = Prisma.Decimal;

export class InventoryError extends Error {}

export function parseQuantity(value: string, allowZero = false) {
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(value)) throw new InventoryError("กรอกจำนวนเป็นตัวเลข ทศนิยมไม่เกิน 3 ตำแหน่ง");
  const amount = new D(value);
  if (allowZero ? amount.lt(0) : amount.lte(0)) throw new InventoryError("จำนวนต้องมากกว่า 0");
  return amount;
}

export function parseReceiptCost(value: string) {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value)) throw new InventoryError("กรอกต้นทุนรวมเป็นบาท ทศนิยมไม่เกิน 2 ตำแหน่ง");
  return new D(value).times(100).toNumber();
}

export function receivedAverageCost(
  onHand: Prisma.Decimal,
  oldCost: Prisma.Decimal | null,
  received: Prisma.Decimal,
  totalSatang: number,
) {
  // A receipt establishes cost when earlier stock had no known cost. Negative
  // stock is a shortage, not negative inventory value in the weighted average.
  const valuedQuantity = oldCost === null ? new D(0) : D.max(onHand, 0);
  return valuedQuantity.times(oldCost ?? 0).plus(totalSatang)
    .div(valuedQuantity.plus(received)).toDecimalPlaces(6);
}

export function recipeCost(lines: Array<{ quantity: Prisma.Decimal; cost: Prisma.Decimal | null }>) {
  const complete = lines.length > 0 && lines.every((line) => line.cost !== null);
  const knownSatang = lines.reduce((sum, line) => sum.plus(line.quantity.times(line.cost ?? 0)), new D(0));
  return { complete, knownSatang };
}
