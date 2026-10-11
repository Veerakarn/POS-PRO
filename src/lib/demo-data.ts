export type MenuItem = {
  id: string;
  category: string;
  name: string;
  description: string;
  priceSatang: number;
  accent: string;
  emoji: string;
};

export const demoMenu: MenuItem[] = [
  {
    id: "pad-krapao-pork",
    category: "อาหารจานเดียว",
    name: "กะเพราหมูสับไข่ดาว",
    description: "หมูสับผัดกะเพราแท้ พร้อมไข่ดาว",
    priceSatang: 8900,
    accent: "coral",
    emoji: "🍳",
  },
  {
    id: "pad-thai-prawn",
    category: "อาหารจานเดียว",
    name: "ผัดไทยกุ้งสด",
    description: "เส้นจันท์ กุ้งสด และถั่วลิสงคั่ว",
    priceSatang: 12900,
    accent: "orange",
    emoji: "🍤",
  },
  {
    id: "tom-yum",
    category: "กับข้าว",
    name: "ต้มยำกุ้งน้ำข้น",
    description: "กุ้งแม่น้ำ เห็ด และน้ำพริกเผา",
    priceSatang: 18900,
    accent: "red",
    emoji: "🍲",
  },
  {
    id: "green-curry",
    category: "กับข้าว",
    name: "แกงเขียวหวานไก่",
    description: "พริกแกงทำเอง กะทิสด และมะเขือ",
    priceSatang: 15900,
    accent: "green",
    emoji: "🥘",
  },
  {
    id: "som-tum",
    category: "ยำและส้มตำ",
    name: "ส้มตำไทย",
    description: "ตำสด รสจัด ปรับความเผ็ดได้",
    priceSatang: 7500,
    accent: "lime",
    emoji: "🥗",
  },
  {
    id: "grilled-chicken",
    category: "ยำและส้มตำ",
    name: "ไก่ย่างครึ่งตัว",
    description: "หมักเครื่องเทศ ย่างเตาถ่าน",
    priceSatang: 14500,
    accent: "brown",
    emoji: "🍗",
  },
  {
    id: "thai-tea",
    category: "เครื่องดื่ม",
    name: "ชาไทย",
    description: "ชาเข้มข้น นมสด และน้ำแข็ง",
    priceSatang: 5500,
    accent: "amber",
    emoji: "🧋",
  },
  {
    id: "sparkling-lychee",
    category: "เครื่องดื่ม",
    name: "ลิ้นจี่โซดา",
    description: "ลิ้นจี่หอมสดชื่น",
    priceSatang: 6500,
    accent: "pink",
    emoji: "🥤",
  },
  {
    id: "mango-sticky-rice",
    category: "ของหวาน",
    name: "ข้าวเหนียวมะม่วง",
    description: "มะม่วงน้ำดอกไม้และกะทิสด",
    priceSatang: 9900,
    accent: "yellow",
    emoji: "🥭",
  },
];

export const demoCategories = [
  "ทั้งหมด",
  "อาหารจานเดียว",
  "กับข้าว",
  "ยำและส้มตำ",
  "เครื่องดื่ม",
  "ของหวาน",
];

export type TableStatus = "ว่าง" | "กำลังสั่ง" | "รออาหาร" | "ขอเช็กบิล";

export type PosTable = {
  id: string;
  name: string;
  seats: number;
  status: TableStatus;
  totalSatang: number;
  updatedAt: string;
};

export const demoTables: PosTable[] = [
  { id: "a01", name: "A01", seats: 2, status: "รออาหาร", totalSatang: 23300, updatedAt: "2 นาที" },
  { id: "a02", name: "A02", seats: 4, status: "กำลังสั่ง", totalSatang: 17800, updatedAt: "ตอนนี้" },
  { id: "a03", name: "A03", seats: 4, status: "ว่าง", totalSatang: 0, updatedAt: "" },
  { id: "a04", name: "A04", seats: 2, status: "ขอเช็กบิล", totalSatang: 38600, updatedAt: "1 นาที" },
  { id: "b01", name: "B01", seats: 6, status: "รออาหาร", totalSatang: 64200, updatedAt: "5 นาที" },
  { id: "b02", name: "B02", seats: 4, status: "ว่าง", totalSatang: 0, updatedAt: "" },
  { id: "b03", name: "B03", seats: 2, status: "กำลังสั่ง", totalSatang: 9900, updatedAt: "ตอนนี้" },
  { id: "b04", name: "B04", seats: 6, status: "ว่าง", totalSatang: 0, updatedAt: "" },
];

export function formatBaht(satang: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(satang / 100);
}
