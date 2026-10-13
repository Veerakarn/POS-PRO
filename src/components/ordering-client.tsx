"use client";

import { useState, useTransition } from "react";

import { requestQrService, submitQrOrder } from "@/app/q/actions";
import { demoCategories, demoMenu, formatBaht, type MenuItem } from "@/lib/demo-data";

export type OrderingMenuItem = {
  id: string;
  category: string;
  name: string;
  description: string | null;
  priceSatang: number;
  imageUrl: string | null;
};

type CatalogItem = MenuItem | (OrderingMenuItem & { accent: string; emoji: string });
type CartLine = CatalogItem & { quantity: number };

const menuAccents = ["coral", "orange", "red", "green", "lime", "brown", "amber", "pink", "yellow"];

export type OrderingContext = {
  branchSlug: string;
  branchCode: string;
  qrSecret: string;
};

function createIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function OrderingClient({
  tableCode,
  tableName,
  restaurantName,
  branchName,
  menuItems,
  orderingContext,
}: {
  tableCode: string;
  tableName?: string;
  restaurantName?: string;
  branchName?: string;
  menuItems?: OrderingMenuItem[];
  orderingContext?: OrderingContext;
}) {
  const [category, setCategory] = useState("ทั้งหมด");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const [isSubmitting, startTransition] = useTransition();
  const [isRequestingService, startServiceTransition] = useTransition();
  const catalog = menuItems === undefined
    ? demoMenu
    : menuItems.map((item, index) => ({
      ...item,
      accent: menuAccents[index % menuAccents.length],
      emoji: "🍽️",
    }));
  const categories = menuItems === undefined
    ? demoCategories
    : ["ทั้งหมด", ...Array.from(new Set(menuItems.map((item) => item.category)))];

  const visibleItems = catalog.filter((item) => category === "ทั้งหมด" || item.category === category);

  const itemCount = cart.reduce((total, item) => total + item.quantity, 0);
  const total = cart.reduce((sum, item) => sum + item.priceSatang * item.quantity, 0);

  function addItem(item: CatalogItem) {
    setNotice(null);
    setOrderError(null);
    setCart((current) => {
      const existing = current.find((line) => line.id === item.id);
      if (!existing) return [...current, { ...item, quantity: 1 }];
      return current.map((line) =>
        line.id === item.id ? { ...line, quantity: line.quantity + 1 } : line,
      );
    });
  }

  function changeQuantity(id: string, amount: number) {
    setCart((current) =>
      current
        .map((line) => (line.id === id ? { ...line, quantity: line.quantity + amount } : line))
        .filter((line) => line.quantity > 0),
    );
  }

  function submitOrder() {
    if (!cart.length) return;
    if (!orderingContext) {
      setNotice("รับรายการแล้ว กำลังส่งเข้าครัวและบาร์");
      setCart([]);
      return;
    }

    setNotice(null);
    setOrderError(null);
    startTransition(async () => {
      try {
        const result = await submitQrOrder({
          ...orderingContext,
          tableCode,
          idempotencyKey,
          items: cart.map((line) => ({
            menuItemId: line.id,
            quantity: line.quantity,
          })),
        });
        if (result.error) {
          setOrderError(result.error);
          return;
        }
        setNotice(`ส่งรายการ #${result.orderNumber} ไปยังร้านแล้ว`);
        setCart([]);
        setIdempotencyKey(createIdempotencyKey());
      } catch {
        setOrderError("ส่งรายการไม่สำเร็จ กรุณาลองอีกครั้ง");
      }
    });
  }

  function requestService(type: "STAFF_CALL" | "CHECK_BILL") {
    if (!orderingContext) return;

    setNotice(null);
    setOrderError(null);
    startServiceTransition(async () => {
      try {
        const result = await requestQrService({
          ...orderingContext,
          tableCode,
          type,
        });
        if (result.error) {
          setOrderError(result.error);
          return;
        }
        setNotice(result.success ?? "ส่งคำขอแล้ว");
      } catch {
        setOrderError("ส่งคำขอไม่สำเร็จ กรุณาลองอีกครั้ง");
      }
    });
  }

  return (
    <main className="ordering-page">
      <header className="ordering-header">
        <div>
          <p className="eyebrow">{restaurantName ? `${restaurantName}${branchName ? ` · ${branchName}` : ""}` : "สั่งอาหารด้วยตัวเอง"}</p>
          <h1>{tableName ?? `โต๊ะ ${tableCode.toUpperCase()}`}</h1>
        </div>
        <div className="table-session-status">
          <span className="tablet-ordering-label">โหมดแท็บเล็ต</span>
          <span className="live-dot" /> กำลังรับออเดอร์
        </div>
      </header>

      {notice ? <p className="ordering-feedback success-notice" role="status">{notice}</p> : null}
      {orderError ? <p className="ordering-feedback form-error ordering-error" role="alert">{orderError}</p> : null}

      <div className="ordering-layout">
        <aside className="category-rail" aria-label="หมวดหมู่อาหาร">
          {categories.map((name) => (
            <button
              className={name === category ? "category-button selected" : "category-button"}
              key={name}
              onClick={() => setCategory(name)}
              type="button"
            >
              {name}
            </button>
          ))}
        </aside>

        <section className="catalog" aria-label="เมนูอาหาร">
          <div className="catalog-heading">
            <div>
              <p className="eyebrow">เมนูวันนี้</p>
              <h2>{category}</h2>
            </div>
            <button className="service-button" disabled={!orderingContext || isRequestingService} onClick={() => requestService("STAFF_CALL")} type="button">
              {isRequestingService ? "กำลังส่ง…" : "✦ เรียกพนักงาน"}
            </button>
          </div>
          {visibleItems.length ? <div className="menu-grid">
            {visibleItems.map((item) => (
              <article className="menu-card" key={item.id}>
                <div className={`food-illustration ${item.accent}`}>
                  {"imageUrl" in item && item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" className="menu-image" src={item.imageUrl} />
                  ) : item.emoji}
                </div>
                <div className="menu-copy">
                  <h3>{item.name}</h3>
                  <p>{item.description || ""}</p>
                </div>
                <div className="menu-footer">
                  <strong>{formatBaht(item.priceSatang)}</strong>
                  <button aria-label={`เพิ่ม ${item.name}`} onClick={() => addItem(item)} type="button">
                    + เพิ่ม
                  </button>
                </div>
              </article>
            ))}
          </div> : <div className="empty-cart">ร้านกำลังจัดเตรียมเมนูสำหรับสั่งผ่าน QR</div>}
        </section>

        <aside className="order-cart" aria-live="polite">
          <div className="cart-heading">
            <div>
              <p className="eyebrow">ตะกร้าของคุณ</p>
              <h2>{itemCount} รายการ</h2>
            </div>
            <span>🧾</span>
          </div>
          {cart.length ? (
            <div className="cart-lines">
              {cart.map((line) => (
                <div className="cart-line" key={line.id}>
                  <div>
                    <strong>{line.name}</strong>
                    <span>{formatBaht(line.priceSatang)}</span>
                  </div>
                  <div className="quantity-control">
                    <button onClick={() => changeQuantity(line.id, -1)} type="button">−</button>
                    <span>{line.quantity}</span>
                    <button onClick={() => changeQuantity(line.id, 1)} type="button">+</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-cart">เลือกเมนูที่ต้องการ แล้วรายการจะแสดงตรงนี้</div>
          )}
          <div className="cart-total">
            <span>รวมโดยประมาณ</span>
            <strong>{formatBaht(total)}</strong>
          </div>
          <button className="primary-button" disabled={!cart.length || isSubmitting} onClick={submitOrder} type="button">
            {isSubmitting ? "กำลังส่งรายการ…" : "ยืนยันรายการอาหาร"}
          </button>
          <button className="text-action" disabled={!orderingContext || isRequestingService} onClick={() => requestService("CHECK_BILL")} type="button">ขอเช็กบิล</button>
        </aside>
      </div>
    </main>
  );
}
