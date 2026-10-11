export const unitLabels = { GRAM: "กรัม", MILLILITER: "มิลลิลิตร", PIECE: "ชิ้น" };
export const movementLabels = { RECEIPT: "รับเข้า", WASTE: "ของเสีย", COUNT: "ตรวจนับ", SALE: "ใช้ตามออเดอร์", REVERSAL: "คืนจากการยกเลิก" };
export function stockNumber(value: number | string) {
  return Number(value).toLocaleString("th-TH", { maximumFractionDigits: 3 });
}
export function costBaht(satang: number | string) {
  return (Number(satang) / 100).toLocaleString("th-TH", { style: "currency", currency: "THB", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
