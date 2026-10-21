"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setKitchenTracking, updateKitchenOrder } from "@/app/kitchen/actions";
import { groupKitchenOrders, orderItemStatusLabels, type KitchenLine } from "@/lib/order-progress";

export type KitchenTicket = KitchenLine & { tableCode: string };

export type KitchenStationBoard = {
  id: string;
  name: string;
  kind: string;
  tickets: KitchenTicket[];
};

export function KitchenDisplayClient({
  branchId,
  trackingEnabled,
  branchName,
  stations,
  unroutedTickets,
}: {
  branchId: string;
  trackingEnabled: boolean;
  branchName: string;
  stations: KitchenStationBoard[];
  unroutedTickets: KitchenTicket[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ error?: string; success?: string }>({});

  function run(action: () => Promise<{ error?: string; success?: string }>) {
    setFeedback({});
    startTransition(async () => {
      try { setFeedback(await action()); }
      catch { setFeedback({ error: "เชื่อมต่อไม่สำเร็จ กรุณาลองอีกครั้ง" }); }
      router.refresh();
    });
  }

  function renderTickets(tickets: KitchenTicket[], stationId: string | null) {
    return groupKitchenOrders(tickets).map((ticket) => {
      const hasNew = ticket.lines.some((line) => line.status === "NEW");
      return <article className={`kitchen-ticket${trackingEnabled && !hasNew ? " acknowledged" : ""}`} key={ticket.orderId}>
        <div className="ticket-top"><strong>โต๊ะ: {ticket.tableName}</strong><span>#{ticket.orderNumber}</span></div>
        <ul className="kitchen-order-lines">{ticket.lines.map((line) => <li key={line.id}>
          <div><strong>{line.quantity}×</strong> {line.name}</div>
          {line.note ? <p>{line.note}</p> : null}
          {trackingEnabled ? <small>{orderItemStatusLabels[line.status] ?? line.status}</small> : null}
        </li>)}</ul>
        <footer><span className="kitchen-wait-time">◷ {ticket.createdAtLabel}</span>
          {trackingEnabled ? <button disabled={pending} onClick={() => run(() => updateKitchenOrder({ branchId, orderId: ticket.orderId, stationId, status: hasNew ? "ACKNOWLEDGED" : "SERVED" }))} type="button">
            {pending ? "กำลังบันทึก…" : hasNew ? "รับออเดอร์" : "เสิร์ฟแล้ว"}
          </button> : null}
        </footer>
      </article>;
    });
  }

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const interval = window.setInterval(refreshWhenVisible, 5_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [router]);

  return (
    <main className="kitchen-page">
      <header className="kitchen-header">
        <div><p className="eyebrow">Kitchen display · {branchName}</p><h1>คิวครัวและบาร์</h1><p>รวมรายการตามออเดอร์และจุดผลิต · อัปเดตทุก 5 วินาที · {trackingEnabled ? "นำออกเมื่อเสิร์ฟแล้วหรือปิดโต๊ะ" : "นำออกเมื่อปิดโต๊ะ"}</p></div>
        <Link className="secondary-button" href="/settings/stations">ตั้งค่าจุดผลิต</Link>
      </header>

      <section className="kitchen-tracking-settings">
        <div><strong>ติดตามสถานะอาหารให้ลูกค้า</strong><p>{trackingEnabled ? "เปิดอยู่: กดรับออเดอร์และเสิร์ฟแล้ว ลูกค้าจะเห็นสถานะอัตโนมัติ" : "ปิดอยู่: ไม่ต้องกดสถานะ และซ่อนสถานะอาหารจากหน้าลูกค้า"}</p><small>เมื่อเปิดกลับ รายการที่ยังไม่ได้กดเสิร์ฟจะกลับมารอจัดการตามสถานะเดิม</small></div>
        <button aria-checked={trackingEnabled} role="switch" className="secondary-button" disabled={pending} onClick={() => run(() => setKitchenTracking({ branchId, enabled: !trackingEnabled }))} type="button">{trackingEnabled ? "ปิดการติดตามสถานะ" : "เปิดการติดตามสถานะ"}</button>
      </section>
      {feedback.error ? <p className="form-error" role="alert">{feedback.error}</p> : null}
      {feedback.success ? <p className="form-success" role="status">{feedback.success}</p> : null}
      {unroutedTickets.length ? <section className="unrouted-tickets"><div><strong>มี {unroutedTickets.length} รายการที่ยังไม่ได้กำหนดจุดผลิต</strong><span>จัดการสถานะได้ที่นี่ หรือกำหนดเส้นทางเมนูจากหน้าตั้งค่าจุดผลิต</span></div><div className="kitchen-ticket-list">{renderTickets(unroutedTickets, null)}</div></section> : null}

      <section className="kitchen-board">
        {stations.map((station) => (
          <article className="kitchen-station" key={station.id}>
            <header><div><p>{station.kind}</p><h2>{station.name}</h2></div><span>{groupKitchenOrders(station.tickets).length}</span></header>
            {station.tickets.length ? <div className="kitchen-ticket-list">
              {renderTickets(station.tickets, station.id)}
            </div> : <p className="empty-state">ไม่มีรายการค้างในจุดผลิตนี้</p>}
          </article>
        ))}
      </section>
      {!stations.length ? <section className="empty-request-state"><span>+</span><h2>ยังไม่มีจุดผลิต</h2><p>เพิ่มครัวหรือบาร์ แล้วกำหนดเส้นทางเมนูเพื่อให้รายการแสดงที่นี่</p></section> : null}
    </main>
  );
}
