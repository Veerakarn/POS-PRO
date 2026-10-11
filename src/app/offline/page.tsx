import Link from "next/link";

export default function OfflinePage() {
  return <main className="offline-page"><section><span className="brand-mark">P</span><p className="eyebrow">Offline</p><h1>ขณะนี้อุปกรณ์ไม่ได้เชื่อมต่ออินเทอร์เน็ต</h1><p>POS@PRO ต้องเชื่อมต่อฐานข้อมูลกลางเพื่อป้องกันออเดอร์และยอดเงินซ้ำ กรุณาตรวจ Wi-Fi หรืออินเทอร์เน็ต แล้วกดลองใหม่</p><Link className="primary-button" href="/">ลองเชื่อมต่ออีกครั้ง</Link></section></main>;
}
