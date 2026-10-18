"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { submitCounterOrder } from "@/app/pos/actions";

export type CounterAddMenuItem = {
  id: string;
  name: string;
  description: string | null;
  priceSatang: number;
  imageUrl: string | null;
  category: string;
};

type CartItem = CounterAddMenuItem & { quantity: number };

function formatBaht(satang: number) {
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(satang / 100);
}

function createIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CounterAddItemsClient({
  branchId,
  branchName,
  menuItems,
  restaurantName,
  tableId,
  tableName,
}: {
  branchId: string;
  branchName: string;
  menuItems: CounterAddMenuItem[];
  restaurantName: string;
  tableId: string;
  tableName: string;
}) {
  const router = useRouter();
  const [category, setCategory] = useState("ทั้งหมด");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [feedback, setFeedback] = useState("");
  const [idempotencyKey] = useState(createIdempotencyKey);
  const [isPending, startTransition] = useTransition();
  const categories = useMemo(() => ["ทั้งหมด", ...Array.from(new Set(menuItems.map((item) => item.category)))], [menuItems]);
  const visibleMenuItems = useMemo(() => menuItems.filter((item) => category === "ทั้งหมด" || item.category === category), [category, menuItems]);
  const cartTotal = cart.reduce((total, item) => total + item.priceSatang * item.quantity, 0);
  const itemCount = cart.reduce((total, item) => total + item.quantity, 0);

  function addItem(item: CounterAddMenuItem) {
    const existing = cart.find((line) => line.id === item.id);
    if (!existing && cart.length >= 30) {
      setFeedback("เลือกได้ไม่เกิน 30 เมนูต่อออเดอร์");
      return;
    }
    if (existing && existing.quantity >= 20) {
      setFeedback(`เพิ่ม ${item.name} ได้ไม่เกิน 20 รายการ`);
      return;
    }
    setFeedback("");
    setCart(existing
      ? cart.map((line) => line.id === item.id ? { ...line, quantity: line.quantity + 1 } : line)
      : [...cart, { ...item, quantity: 1 }]);
  }

  function changeQuantity(itemId: string, delta: number) {
    setCart((current) => current
      .map((item) => item.id === itemId ? { ...item, quantity: item.quantity + delta } : item)
      .filter((item) => item.quantity > 0));
  }

  function sendOrder() {
    if (!cart.length || isPending) return;
    setFeedback("");
    startTransition(async () => {
      try {
        const result = await submitCounterOrder({
          branchId,
          tableId,
          idempotencyKey,
          items: cart.map((item) => ({ menuItemId: item.id, quantity: item.quantity })),
        });
        if (result.error) {
          setFeedback(result.error);
          return;
        }
        router.replace(`/pos/${branchId}?table=${encodeURIComponent(tableId)}`);
        router.refresh();
      } catch {
        setFeedback("ส่งออเดอร์ไม่สำเร็จ กรุณาลองอีกครั้ง");
      }
    });
  }

  return (
    <main className="counter-add-items-page">
      <header className="counter-add-items-header">
        <Link className="secondary-button" href={`/pos/${branchId}?table=${encodeURIComponent(tableId)}`}>← กลับหน้าโต๊ะ</Link>
        <p className="eyebrow">{restaurantName} · สาขา {branchName}</p>
        <h1>เพิ่มรายการอาหาร</h1>
        <p>โต๊ะ {tableName} · เลือกเมนูแล้วส่งเข้าครัว</p>
      </header>
      <div className="counter-add-items-layout">
        <section className="counter-add-menu-panel" aria-label="เมนูอาหาร">
          <nav className="counter-add-category-row" aria-label="หมวดหมู่เมนู">
            {categories.map((name) => <button className={category === name ? "filter-button active" : "filter-button"} key={name} onClick={() => setCategory(name)} type="button">{name}</button>)}
          </nav>
          {visibleMenuItems.length ? <div className="counter-add-menu-grid">
            {visibleMenuItems.map((item) => (
              <button className="counter-add-menu-item" key={item.id} onClick={() => addItem(item)} type="button">
                {item.imageUrl ? <Image alt="" height={112} src={item.imageUrl} unoptimized width={220} /> : <span className="counter-add-menu-placeholder" aria-hidden="true">🍽️</span>}
                <span className="counter-add-menu-copy"><small>{item.category}</small><strong>{item.name}</strong>{item.description ? <span>{item.description}</span> : null}<b>{formatBaht(item.priceSatang)}</b></span>
                <span className="counter-add-menu-plus" aria-hidden="true">+</span>
              </button>
            ))}
          </div> : <p className="empty-state">ยังไม่มีเมนูที่พร้อมขาย</p>}
        </section>
        <aside className="counter-add-cart-panel">
          <div className="panel-heading"><div><p className="eyebrow">ออเดอร์ใหม่</p><h2>โต๊ะ {tableName}</h2></div><span>{itemCount} รายการ</span></div>
          {cart.length ? <div className="counter-add-cart-list">
            {cart.map((item) => <article className="counter-add-cart-item" key={item.id}><div><strong>{item.name}</strong><small>{formatBaht(item.priceSatang)} / รายการ</small></div><div className="counter-add-quantity"><button aria-label={`ลดจำนวน ${item.name}`} onClick={() => changeQuantity(item.id, -1)} type="button">−</button><span>{item.quantity}</span><button aria-label={`เพิ่มจำนวน ${item.name}`} disabled={item.quantity >= 20} onClick={() => changeQuantity(item.id, 1)} type="button">+</button></div></article>)}
          </div> : <p className="counter-add-cart-empty">แตะเมนูทางซ้ายเพื่อเพิ่มลงออเดอร์</p>}
          <div className="counter-add-cart-total"><span>รวมรายการใหม่</span><strong>{formatBaht(cartTotal)}</strong></div>
          {feedback ? <p className="form-error" role="alert">{feedback}</p> : null}
          <button className="primary-button" disabled={isPending || !cart.length} onClick={sendOrder} type="button">{isPending ? "กำลังส่งออเดอร์…" : "ส่งออเดอร์เข้าครัว"}</button>
        </aside>
      </div>
    </main>
  );
}
