"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  openCounterTable,
  submitCounterOrder,
} from "@/app/pos/actions";
import { CounterBillingControls } from "@/components/counter-billing-controls";

export type CounterTableStatus = "ว่าง" | "กำลังสั่ง" | "รออาหาร" | "ขอเช็กบิล";

export type CounterTable = {
  id: string;
  code: string;
  name: string;
  capacity: number;
  status: CounterTableStatus;
  totalSatang: number;
  updatedAtLabel: string | null;
  hasOpenSession: boolean;
  orderLines: Array<{
    id: string;
    name: string;
    quantity: number;
    priceSatang: number;
    status: string;
    billedQuantity: number;
  }>;
  bills: CounterBill[];
};

export type CounterBill = {
  id: string;
  billNumber: number;
  status: string;
  subtotalSatang: number;
  discountSatang: number;
  taxSatang: number;
  totalSatang: number;
  paidSatang: number;
  lines: Array<{ id: string; orderItemId: string; quantity: number; name: string; subtotalSatang: number }>;
  discounts: Array<{ id: string; billLineId: string | null; amountSatang: number; reason: string }>;
  member: { id: string; name: string; phone: string; points: number } | null;
  taxInvoices: Array<{ id: string; invoiceNumber: string }>;
};

export type CounterPaymentOption = { code: string; name: string; isCash: boolean };

export type CounterMenuItem = {
  id: string;
  name: string;
  category: string;
  priceSatang: number;
};

type CartLine = CounterMenuItem & { quantity: number };
type Feedback = { message: string; tone: "success" | "error" };

const statusClass: Record<CounterTableStatus, string> = {
  ว่าง: "available",
  กำลังสั่ง: "ordering",
  รออาหาร: "waiting",
  ขอเช็กบิล: "check-requested",
};

const orderItemStatus: Record<string, string> = {
  NEW: "เข้าคิวแล้ว",
  ACKNOWLEDGED: "ครัวรับแล้ว",
  PREPARING: "กำลังทำ",
  READY: "พร้อมเสิร์ฟ",
  SERVED: "เสิร์ฟแล้ว",
  CANCELLED: "ยกเลิก",
};

function formatBaht(satang: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(satang / 100);
}

function createIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CounterPosLiveClient({
  branchId,
  branchName,
  tables,
  menuItems,
  pendingServiceRequests,
  paymentMethods,
  hasOpenCashShift,
  canManagePayments,
  canManageServiceRequests,
}: {
  branchId: string;
  branchName: string;
  tables: CounterTable[];
  menuItems: CounterMenuItem[];
  pendingServiceRequests: number;
  paymentMethods: CounterPaymentOption[];
  hasOpenCashShift: boolean;
  canManagePayments: boolean;
  canManageServiceRequests: boolean;
}) {
  const router = useRouter();
  const [selectedTableId, setSelectedTableId] = useState(() => tables.find((table) => table.hasOpenSession)?.id ?? tables[0]?.id ?? "");
  const [filter, setFilter] = useState<CounterTableStatus | "ทั้งหมด">("ทั้งหมด");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [category, setCategory] = useState("ทั้งหมด");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [orderIdempotencyKey, setOrderIdempotencyKey] = useState(createIdempotencyKey);
  const [isPending, startTransition] = useTransition();

  const selectedTable = tables.find((table) => table.id === selectedTableId) ?? tables[0];
  const visibleTables = useMemo(
    () => tables.filter((table) => filter === "ทั้งหมด" || table.status === filter),
    [filter, tables],
  );
  const categories = useMemo(
    () => ["ทั้งหมด", ...Array.from(new Set(menuItems.map((item) => item.category)))],
    [menuItems],
  );
  const visibleMenuItems = menuItems.filter((item) => category === "ทั้งหมด" || item.category === category);
  const cartTotal = cart.reduce((total, item) => total + item.priceSatang * item.quantity, 0);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const refreshTimer = window.setInterval(refreshWhenVisible, 5_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(refreshTimer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [router]);

  if (!selectedTable) {
    return (
      <main className="pos-page">
        <section className="empty-request-state">
          <span>+</span>
          <h2>ยังไม่มีโต๊ะในสาขานี้</h2>
          <p>เพิ่มโต๊ะจากเมนู “โต๊ะและ QR” ก่อนเปิด Counter POS</p>
        </section>
      </main>
    );
  }

  function selectTable(tableId: string) {
    setSelectedTableId(tableId);
    setCart([]);
    setIsMenuOpen(false);
    setFeedback(null);
  }

  function run(action: () => Promise<{ error?: string; success?: string }>, onSuccess?: () => void) {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.error) {
          setFeedback({ message: result.error, tone: "error" });
          return;
        }
        setFeedback({ message: result.success ?? "บันทึกรายการแล้ว", tone: "success" });
        onSuccess?.();
        router.refresh();
      } catch {
        setFeedback({ message: "บันทึกรายการไม่สำเร็จ กรุณาลองอีกครั้ง", tone: "error" });
      }
    });
  }

  function openTable(table: CounterTable) {
    run(() => openCounterTable({ branchId, tableId: table.id }));
  }

  function addItem(item: CounterMenuItem) {
    setCart((current) => {
      const existing = current.find((line) => line.id === item.id);
      if (!existing) return [...current, { ...item, quantity: 1 }];
      return current.map((line) => line.id === item.id ? { ...line, quantity: line.quantity + 1 } : line);
    });
  }

  function changeQuantity(id: string, amount: number) {
    setCart((current) => current
      .map((line) => line.id === id ? { ...line, quantity: line.quantity + amount } : line)
      .filter((line) => line.quantity > 0));
  }

  function submitOrder() {
    if (!cart.length) return;
    run(
      () => submitCounterOrder({
        branchId,
        tableId: selectedTable.id,
        idempotencyKey: orderIdempotencyKey,
        items: cart.map((line) => ({ menuItemId: line.id, quantity: line.quantity })),
      }),
      () => {
        setCart([]);
        setIsMenuOpen(false);
        setOrderIdempotencyKey(createIdempotencyKey());
      },
    );
  }

  return (
    <main className="pos-page">
      <header className="pos-header">
        <div>
          <p className="eyebrow">หน้าร้าน · {branchName}</p>
          <h1>Counter POS</h1>
          <span className="tablet-staff-label">โหมดพนักงาน · แท็บเล็ต</span>
        </div>
        <div className="pos-actions">
          {canManageServiceRequests ? <a className="secondary-button" href="/requests">▣ คำขอจากโต๊ะ <span>{pendingServiceRequests}</span></a> : null}
          <button
            className="primary-button compact"
            disabled={isPending || !tables.some((table) => table.status === "ว่าง")}
            onClick={() => {
              const nextTable = tables.find((table) => table.status === "ว่าง");
              if (nextTable) {
                selectTable(nextTable.id);
                openTable(nextTable);
              }
            }}
            type="button"
          >
            + เปิดโต๊ะ
          </button>
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
                onClick={() => selectTable(table.id)}
                type="button"
              >
                <span className="table-status">{table.status}</span>
                <strong>{table.name}</strong>
                <small>{table.code} · {table.capacity} ที่นั่ง</small>
                <span>{table.totalSatang ? formatBaht(table.totalSatang) : "พร้อมรับลูกค้า"}</span>
                {table.updatedAtLabel ? <em>{table.updatedAtLabel}</em> : null}
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

          {feedback ? <p className={`pos-feedback ${feedback.tone}`} role="status">{feedback.message}</p> : null}

          {!selectedTable.hasOpenSession ? (
            <div className="empty-order">
              <p>โต๊ะนี้พร้อมรับลูกค้า</p>
              <button className="primary-button" disabled={isPending} onClick={() => openTable(selectedTable)} type="button">
                {isPending ? "กำลังเปิดโต๊ะ…" : "เปิดโต๊ะนี้"}
              </button>
            </div>
          ) : (
            <>
              {selectedTable.orderLines.length ? (
                <div className="order-lines">
                  {selectedTable.orderLines.map((item) => (
                    <div className="pos-order-line" key={item.id}>
                      <span>{item.quantity}×</span>
                      <div>
                        <strong>{item.name}</strong>
                        <small>{orderItemStatus[item.status] ?? item.status}</small>
                        {item.billedQuantity ? <small>ออกบิลแล้ว {item.billedQuantity}/{item.quantity}</small> : null}
                      </div>
                      <span>{formatBaht(item.priceSatang * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              ) : <div className="empty-order"><p>ยังไม่มีรายการอาหารสำหรับโต๊ะนี้</p></div>}

              {selectedTable.status !== "ขอเช็กบิล" ? (
                <button className="add-menu-button" disabled={isPending || !menuItems.length} onClick={() => setIsMenuOpen((open) => !open)} type="button">
                  {isMenuOpen ? "ปิดรายการเมนู" : "+ เพิ่มรายการอาหาร"}
                </button>
              ) : null}

              {isMenuOpen ? (
                <section className="counter-menu-picker" aria-label="เลือกเมนูสำหรับโต๊ะ">
                  <div className="counter-category-row">
                    {categories.map((name) => <button className={category === name ? "filter-button active" : "filter-button"} key={name} onClick={() => setCategory(name)} type="button">{name}</button>)}
                  </div>
                  {visibleMenuItems.length ? <div className="counter-menu-grid">
                    {visibleMenuItems.map((item) => (
                      <button className="counter-menu-item" key={item.id} onClick={() => addItem(item)} type="button">
                        <span>{item.category}</span><strong>{item.name}</strong><small>{formatBaht(item.priceSatang)}</small>
                      </button>
                    ))}
                  </div> : <p className="empty-state">ยังไม่มีเมนูที่พร้อมขาย</p>}
                  {cart.length ? <div className="counter-cart">
                    {cart.map((item) => <div className="counter-cart-line" key={item.id}><span>{item.name}</span><div><button aria-label={`ลดจำนวน ${item.name}`} onClick={() => changeQuantity(item.id, -1)} type="button">−</button><strong>{item.quantity}</strong><button aria-label={`เพิ่มจำนวน ${item.name}`} onClick={() => changeQuantity(item.id, 1)} type="button">+</button></div></div>)}
                    <div className="counter-cart-total"><span>เพิ่มในออเดอร์</span><strong>{formatBaht(cartTotal)}</strong></div>
                    <button className="primary-button" disabled={isPending} onClick={submitOrder} type="button">{isPending ? "กำลังส่งออเดอร์…" : "ส่งออเดอร์เข้าครัว"}</button>
                  </div> : null}
                </section>
              ) : null}

              {selectedTable.totalSatang ? <CounterBillingControls branchId={branchId} canManagePayments={canManagePayments} hasOpenCashShift={hasOpenCashShift} paymentMethods={paymentMethods} table={selectedTable} tables={tables} /> : null}
            </>
          )}
          <p className="panel-note">เมนูพร้อมขาย: {menuItems.length} รายการ · ข้อมูลทุกการทำงานบันทึกลง Neon</p>
        </aside>
      </div>
    </main>
  );
}
