"use client";

import { useMemo, useState } from "react";

import { demoMenu, demoTables, formatBaht, type PosTable, type TableStatus } from "@/lib/demo-data";

const statusClass: Record<TableStatus, string> = {
  ว่าง: "available",
  กำลังสั่ง: "ordering",
  รออาหาร: "waiting",
  ขอเช็กบิล: "check-requested",
};

const tableOrder = [
  { name: "กะเพราหมูสับไข่ดาว", quantity: 2, priceSatang: 17800, status: "กำลังทำ" },
  { name: "ชาไทย", quantity: 1, priceSatang: 5500, status: "เสิร์ฟแล้ว" },
];

export function CounterPosClient() {
  const [tables, setTables] = useState<PosTable[]>(demoTables);
  const [selectedTableId, setSelectedTableId] = useState("a01");
  const [filter, setFilter] = useState<TableStatus | "ทั้งหมด">("ทั้งหมด");

  const selectedTable = tables.find((table) => table.id === selectedTableId) ?? tables[0];
  const visibleTables = useMemo(
    () => tables.filter((table) => filter === "ทั้งหมด" || table.status === filter),
    [filter, tables],
  );

  function openTable(tableId: string) {
    setTables((current) =>
      current.map((table) =>
        table.id === tableId
          ? { ...table, status: "กำลังสั่ง", updatedAt: "ตอนนี้" }
          : table,
      ),
    );
    setSelectedTableId(tableId);
  }

  function openNextAvailableTable() {
    const next = tables.find((table) => table.status === "ว่าง");
    if (next) openTable(next.id);
  }

  function requestBill() {
    setTables((current) =>
      current.map((table) =>
        table.id === selectedTable.id
          ? { ...table, status: "ขอเช็กบิล", updatedAt: "ตอนนี้" }
          : table,
      ),
    );
  }

  const hasOrder = selectedTable.totalSatang > 0;
  const total = selectedTable.totalSatang;

  return (
    <main className="pos-page">
      <header className="pos-header">
        <div>
          <p className="eyebrow">หน้าร้าน · กะกลางวัน</p>
          <h1>Counter POS</h1>
        </div>
        <div className="pos-actions">
          <button className="secondary-button" type="button">▣ ดูคำขอพนักงาน <span>2</span></button>
          <button className="primary-button compact" onClick={openNextAvailableTable} type="button">+ เปิดโต๊ะ</button>
        </div>
      </header>

      <div className="pos-layout">
        <section className="table-board">
          <div className="filter-row" aria-label="กรองสถานะโต๊ะ">
            {(["ทั้งหมด", "ว่าง", "กำลังสั่ง", "รออาหาร", "ขอเช็กบิล"] as const).map((status) => (
              <button
                className={filter === status ? "filter-button active" : "filter-button"}
                key={status}
                onClick={() => setFilter(status)}
                type="button"
              >
                {status}
              </button>
            ))}
          </div>
          <div className="table-grid">
            {visibleTables.map((table) => (
              <button
                className={`table-card ${statusClass[table.status]} ${selectedTable.id === table.id ? "selected" : ""}`}
                key={table.id}
                onClick={() => setSelectedTableId(table.id)}
                type="button"
              >
                <span className="table-status">{table.status}</span>
                <strong>{table.name}</strong>
                <small>{table.seats} ที่นั่ง</small>
                <span>{table.totalSatang ? formatBaht(table.totalSatang) : "พร้อมรับลูกค้า"}</span>
                {table.updatedAt ? <em>{table.updatedAt}</em> : null}
              </button>
            ))}
          </div>
        </section>

        <aside className="pos-order-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">รายการโต๊ะ</p>
              <h2>{selectedTable.name}</h2>
            </div>
            <span className={`status-pill ${statusClass[selectedTable.status]}`}>{selectedTable.status}</span>
          </div>

          {!hasOrder ? (
            <div className="empty-order">
              <p>{selectedTable.status === "ว่าง" ? "โต๊ะนี้พร้อมรับลูกค้า" : "ยังไม่มีรายการอาหารสำหรับโต๊ะนี้"}</p>
              <button
                className="primary-button"
                onClick={() => openTable(selectedTable.id)}
                type="button"
              >
                {selectedTable.status === "ว่าง" ? "เปิดโต๊ะนี้" : "+ เพิ่มรายการอาหาร"}
              </button>
            </div>
          ) : (
            <>
              <div className="order-lines">
                {tableOrder.map((item) => (
                  <div className="pos-order-line" key={item.name}>
                    <span>{item.quantity}×</span>
                    <div>
                      <strong>{item.name}</strong>
                      <small>{item.status}</small>
                    </div>
                    <span>{formatBaht(item.priceSatang)}</span>
                  </div>
                ))}
              </div>
              <button className="add-menu-button" type="button">+ เพิ่มรายการอาหาร</button>
              <div className="bill-summary">
                <span>ยอดรวม</span>
                <strong>{formatBaht(total)}</strong>
              </div>
              <div className="payment-actions">
                <button className="secondary-button" onClick={requestBill} type="button">ขอเช็กบิล</button>
                <button className="primary-button" type="button">รับชำระเงิน</button>
              </div>
            </>
          )}
          <p className="panel-note">เมนูพร้อมเพิ่ม: {demoMenu.length} รายการ · จุดผลิต 2 จุด</p>
        </aside>
      </div>
    </main>
  );
}
