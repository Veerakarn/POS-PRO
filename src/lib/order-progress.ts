export const orderItemStatusLabels: Record<string, string> = {
  NEW: "รอร้านรับออเดอร์",
  ACKNOWLEDGED: "รับออเดอร์แล้ว",
  PREPARING: "กำลังเตรียม",
  READY: "พร้อมเสิร์ฟ",
  SERVED: "เสิร์ฟแล้ว",
  CANCELLED: "ยกเลิกแล้ว",
};

export type KitchenLine = {
  id: string;
  orderId: string;
  name: string;
  quantity: number;
  note: string | null;
  status: string;
  tableName: string;
  orderNumber: number;
  createdAtLabel: string;
};

export function groupKitchenOrders(lines: KitchenLine[]) {
  const groups = new Map<string, { orderId: string; tableName: string; orderNumber: number; createdAtLabel: string; lines: KitchenLine[] }>();
  for (const line of lines) {
    let group = groups.get(line.orderId);
    if (!group) {
      group = { orderId: line.orderId, tableName: line.tableName, orderNumber: line.orderNumber, createdAtLabel: line.createdAtLabel, lines: [] };
      groups.set(line.orderId, group);
    }
    group.lines.push(line);
  }
  return [...groups.values()];
}
