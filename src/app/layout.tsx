import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { PwaRegistration } from "@/components/pwa-registration";

import "./globals.css";

export const metadata: Metadata = {
  title: "POS@PRO",
  description: "Restaurant operations platform",
  applicationName: "POS@PRO",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "POS@PRO" },
};

export const viewport: Viewport = {
  themeColor: "#174d39",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="th">
      <body><PwaRegistration />{children}</body>
    </html>
  );
}
