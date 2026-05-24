import type { Metadata, Viewport } from "next";
import "./globals.css";
import { GlobalHotkeys } from "@/components/GlobalHotkeys";
import { PwaInit } from "@/components/PwaInit";

export const metadata: Metadata = {
  title: "비노트",
  description: "글쓰기 전용 컴패니언",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "비노트",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#fafaf8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full bg-[#fafaf8] text-zinc-900">
        {children}
        <GlobalHotkeys />
        <PwaInit />
      </body>
    </html>
  );
}
