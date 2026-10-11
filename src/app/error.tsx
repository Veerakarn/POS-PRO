"use client";

import { useEffect } from "react";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("POS@PRO route error", error);
  }, [error]);

  return <main className="recovery-page"><section><span className="brand-mark">P</span><p className="eyebrow">Connection interrupted</p><h1>โหลดข้อมูลร้านไม่สำเร็จ</h1><p>การเชื่อมต่อฐานข้อมูลอาจขาดช่วงชั่วคราว กรุณากดลองใหม่ ระบบจะดึงข้อมูลล่าสุดโดยไม่สร้างรายการซ้ำ</p>{error.digest ? <small>รหัสอ้างอิง {error.digest}</small> : null}<button className="primary-button" onClick={() => retry()} type="button">ลองโหลดอีกครั้ง</button></section></main>;
}
