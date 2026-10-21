"use client";

import { useEffect, useState } from "react";
import { getQrOrderStatus, type QrStatusInput, type QrStatusResult } from "@/app/q/status-actions";
import { orderItemStatusLabels } from "@/lib/order-progress";

export function CustomerOrderProgress({ context, refreshKey }: { context: QrStatusInput; refreshKey: string }) {
  const { branchSlug, branchCode, tableCode, qrSecret, sessionNonce } = context;
  const [progress, setProgress] = useState<QrStatusResult | null>(null);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (document.visibilityState === "visible") {
        try {
          const result = await getQrOrderStatus({ branchSlug, branchCode, tableCode, qrSecret, sessionNonce });
          if (!stopped) setProgress(result);
        } catch {
          if (!stopped) setProgress({ enabled: false, orders: [], error: "โหลดสถานะอาหารไม่ได้ กำลังลองเชื่อมต่อใหม่" });
        }
      }
      if (!stopped) timer = setTimeout(poll, 10_000);
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [branchSlug, branchCode, tableCode, qrSecret, sessionNonce, refreshKey]);

  if (progress?.error) return <p className="ordering-feedback" role="status">{progress.error}</p>;
  if (!progress?.enabled || !progress.orders.length) return null;
  return <section className="customer-order-progress" aria-label="สถานะอาหารของโต๊ะ">
    <h2>สถานะอาหารของโต๊ะ</h2><p>อัปเดตอัตโนมัติทุก 10 วินาที · แสดงรายการล่าสุดไม่เกิน 100 ออเดอร์</p>
    <div className="customer-order-list">{progress.orders.map((order) => <article key={order.id}>
      <h3>ออเดอร์ #{order.orderNumber}</h3>
      <ul>{order.items.map((item) => <li key={item.id}><span>{item.quantity}× {item.name}</span><strong className={`food-progress-${item.status.toLowerCase()}`}>{orderItemStatusLabels[item.status] ?? "ส่งรายการแล้ว"}</strong></li>)}</ul>
    </article>)}</div>
  </section>;
}
