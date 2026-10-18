"use client";

import { useEffect } from "react";

export function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // A versioned URL replaces older registrations even when their script is cached.
    void navigator.serviceWorker.register("/sw.js?v=3", {
      scope: "/",
      updateViaCache: "none",
    }).catch(() => {
      // Registration can fail offline; the app still works without offline caching.
    });
  }, []);
  return null;
}
