import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "POS@PRO Restaurant Management",
    short_name: "POS@PRO",
    description: "ระบบจัดการร้านอาหาร หน้าร้าน ครัว สต็อก และรายงาน",
    start_url: "/",
    display: "standalone",
    background_color: "#edf2ed",
    theme_color: "#174d39",
    lang: "th",
    orientation: "any",
    icons: [
      { src: "/icon-192.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.svg", sizes: "192x192", type: "image/svg+xml", purpose: "maskable" },
      { src: "/icon-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
