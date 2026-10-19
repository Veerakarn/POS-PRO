"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { submitCounterOrder } from "@/app/pos/actions";
import { PosIcon } from "@/components/pos-icon";

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
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [feedback, setFeedback] = useState("");
  const [idempotencyKey] = useState(createIdempotencyKey);
  const [isPending, startTransition] = useTransition();
  const categories = useMemo(() => ["ทั้งหมด", ...Array.from(new Set(menuItems.map((item) => item.category)))], [menuItems]);
  const visibleMenuItems = useMemo(() => menuItems.filter((item) => (category === "ทั้งหมด" || item.category === category) && `${item.name} ${item.description ?? ""} ${item.category}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [category, menuItems, search]);
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
        <div className="counter-add-header-top"><Link className="counter-back-link" href={`/pos/${branchId}?table=${encodeURIComponent(tableId)}`}>← กลับหน้าโต๊ะ</Link><span>{restaurantName} · {branchName}</span></div>
        <div className="counter-add-title-row"><div><p className="eyebrow">COUNTER POS / รับออเดอร์</p><h1>วันนี้รับอะไรดี?</h1><p>เลือกเมนู เพิ่มจำนวน แล้วส่งเข้าครัวได้เลย</p></div><span className="counter-table-tag"><PosIcon name="tables" /><span>รับออเดอร์ให้<strong>{tableName}</strong></span></span></div>
      </header>
      <div className="counter-add-items-layout">
        <section className="counter-add-menu-panel" aria-label="เมนูอาหาร">
          <div className="counter-menu-toolbar"><div><h2>เมนูอาหาร</h2><span>{visibleMenuItems.length} เมนูพร้อมเลือก</span></div><label className="pos-search"><PosIcon name="search" /><input type="search" aria-label="ค้นหาเมนู" placeholder="ค้นหาชื่อเมนู…" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
          <nav className="counter-add-category-row" aria-label="หมวดหมู่เมนู">
            {categories.map((name) => <button aria-pressed={category === name} className={category === name ? "filter-button active" : "filter-button"} key={name} onClick={() => setCategory(name)} type="button">{name}<span>{name === "ทั้งหมด" ? menuItems.length : menuItems.filter((item) => item.category === name).length}</span></button>)}
          </nav>
          {visibleMenuItems.length ? <div className="counter-add-menu-grid">
            {visibleMenuItems.map((item) => (
              <button aria-label={`เพิ่ม ${item.name}`} className={`counter-add-menu-item${cart.some((line) => line.id === item.id) ? " in-cart" : ""}`} key={item.id} onClick={() => addItem(item)} disabled={isPending} type="button">
                {item.imageUrl ? <Image alt="" height={160} src={item.imageUrl} unoptimized width={260} /> : <span className={`counter-add-menu-placeholder menu-tone-${categories.indexOf(item.category) % 4}`} aria-hidden="true"><PosIcon name="food" /><small>{item.category}</small></span>}
                {cart.some((line) => line.id === item.id) ? <span className="counter-menu-selected"><span aria-hidden="true">✓</span> {cart.find((line) => line.id === item.id)?.quantity} ในออเดอร์</span> : null}
                <span className="counter-add-menu-copy"><small>{item.category}</small><strong>{item.name}</strong>{item.description ? <span>{item.description}</span> : null}<b>{formatBaht(item.priceSatang)}</b></span>
                <span className="counter-add-menu-plus" aria-hidden="true">+</span>
              </button>
            ))}
          </div> : <div className="pos-table-empty"><PosIcon name="food" /><h3>{menuItems.length ? "ไม่พบเมนูที่ค้นหา" : "ยังไม่มีเมนูที่พร้อมขาย"}</h3>{menuItems.length ? <button type="button" className="secondary-button" onClick={() => { setSearch(""); setCategory("ทั้งหมด"); }}>ดูเมนูทั้งหมด</button> : <p>เพิ่มเมนูที่พร้อมขายก่อนเริ่มรับออเดอร์</p>}</div>}
        </section>
        <aside className="counter-add-cart-panel" aria-label="สรุปออเดอร์ใหม่" aria-busy={isPending}>
          <div className="panel-heading"><div><p className="eyebrow">ออเดอร์ใหม่</p><h2><PosIcon name="receipt" />{tableName}</h2></div><span className="counter-cart-count" aria-live="polite">{itemCount} รายการ</span></div>
          {cart.length ? <div className="counter-add-cart-list">
            {cart.map((item) => <article className="counter-add-cart-item" key={item.id}><div><strong>{item.name}</strong><small>{formatBaht(item.priceSatang * item.quantity)}</small></div><div className="counter-add-quantity"><button aria-label={`ลดจำนวน ${item.name}`} disabled={isPending} onClick={() => changeQuantity(item.id, -1)} type="button">−</button><span>{item.quantity}</span><button aria-label={`เพิ่มจำนวน ${item.name}`} disabled={isPending || item.quantity >= 20} onClick={() => changeQuantity(item.id, 1)} type="button">+</button></div></article>)}
          </div> : <div className="counter-add-cart-empty"><PosIcon name="receipt" /><strong>เริ่มออเดอร์ใหม่</strong><p>แตะเมนูที่ต้องการ<br />รายการอาหารจะแสดงที่นี่</p></div>}
          <div className="counter-cart-footer">
          <div className="counter-add-cart-total"><span>รวมรายการใหม่</span><strong>{formatBaht(cartTotal)}</strong></div>
          {feedback ? <p className="form-error" role="alert">{feedback}</p> : null}
          <button className="primary-button" disabled={isPending || !cart.length} onClick={sendOrder} type="button">{isPending ? "กำลังส่งออเดอร์…" : <>ส่งออเดอร์เข้าครัว<PosIcon name="arrow" /></>}</button>
          <p>ตรวจรายการให้ครบก่อนส่งเข้าครัว</p>
          </div>
        </aside>
      </div>
    </main>
  );
}
