"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function RequestAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible" && !document.querySelector("dialog[open]")) router.refresh();
    };

    const interval = window.setInterval(refreshWhenVisible, 5_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [router]);

  return <p className="auto-refresh-note">อัปเดตคำขออัตโนมัติทุก 5 วินาที</p>;
}
