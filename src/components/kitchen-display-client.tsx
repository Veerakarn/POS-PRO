"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type KitchenTicket = {
  id: string;
  name: string;
  quantity: number;
  note: string | null;
  tableName: string;
  tableCode: string;
  orderNumber: number;
  createdAtLabel: string;
};

export type KitchenStationBoard = {
  id: string;
  name: string;
  kind: string;
  tickets: KitchenTicket[];
};

export function KitchenDisplayClient({
  branchName,
  stations,
  unroutedTickets,
}: {
  branchName: string;
  stations: KitchenStationBoard[];
  unroutedTickets: KitchenTicket[];
}) {
  const router = useRouter();

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
        <div><p className="eyebrow">Kitchen display · {branchName}</p><h1>คิวครัวและบาร์</h1><p>รายการของโต๊ะที่ยังเปิด · อัปเดตทุก 5 วินาที · นำออกอัตโนมัติเมื่อปิดโต๊ะ</p></div>
        <Link className="secondary-button" href="/settings/stations">ตั้งค่าจุดผลิต</Link>
      </header>

      {unroutedTickets.length ? <section className="unrouted-tickets"><div><strong>มี {unroutedTickets.length} รายการที่ยังไม่ได้กำหนดจุดผลิต</strong><span>กำหนดเส้นทางเมนูจากหน้าตั้งค่าจุดผลิตก่อนส่งเข้าครัว</span></div>{unroutedTickets.map((ticket) => <p key={ticket.id}>{ticket.tableName} · {ticket.name} × {ticket.quantity}</p>)}</section> : null}

      <section className="kitchen-board">
        {stations.map((station) => (
          <article className="kitchen-station" key={station.id}>
            <header><div><p>{station.kind}</p><h2>{station.name}</h2></div><span>{station.tickets.length}</span></header>
            {station.tickets.length ? <div className="kitchen-ticket-list">
              {station.tickets.map((ticket) => (
                <article className="kitchen-ticket" key={ticket.id}>
                  <div className="ticket-top"><strong>{ticket.tableName}</strong><span>#{ticket.orderNumber} · {ticket.createdAtLabel}</span></div>
                  <h3>{ticket.quantity}× {ticket.name}</h3>
                  {ticket.note ? <p>{ticket.note}</p> : null}
                </article>
              ))}
            </div> : <p className="empty-state">ไม่มีรายการจากโต๊ะที่ยังเปิด</p>}
          </article>
        ))}
      </section>
      {!stations.length ? <section className="empty-request-state"><span>+</span><h2>ยังไม่มีจุดผลิต</h2><p>เพิ่มครัวหรือบาร์ แล้วกำหนดเส้นทางเมนูเพื่อให้รายการแสดงที่นี่</p></section> : null}
    </main>
  );
}
