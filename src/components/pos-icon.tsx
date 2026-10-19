import type { CSSProperties } from "react";

export function PosIcon({ name, className, style }: { name: "tables" | "search" | "receipt" | "food" | "qr" | "guests" | "arrow"; className?: string; style?: CSSProperties }) {
  const paths = {
    tables: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    receipt: <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z" /><path d="M9 8h6m-6 4h6" /></>,
    food: <><path d="M7 3v6m-3-6v4a3 3 0 0 0 6 0V3M7 10v11M18 3c-3 3-3 7 0 8h2V3h-2Zm2 8v10" /></>,
    qr: <><path d="M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6" /><path d="M7 7h2v2H7zm8 0h2v2h-2zM7 15h2v2H7zm8 0h2v2h-2z" /></>,
    guests: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m3 10v-3a6 6 0 0 0-2-4" /></>,
    arrow: <path d="m10 5 7 7-7 7M4 12h13" />,
  };
  return <svg aria-hidden="true" className={className} style={style} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
