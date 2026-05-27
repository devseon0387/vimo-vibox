import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ToastProvider } from "@/components/Toast";
import { PwaInit } from "@/components/PwaInit";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "비박스",
  description: "VIMO 내부 팀용 파일 공유 플랫폼",
  manifest: "/manifest.webmanifest",
  applicationName: "비박스",
  appleWebApp: {
    capable: true,
    title: "비박스",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 영상 플레이어·코멘트 zoom 자유 (PWA 사용성)
  maximumScale: 5,
  minimumScale: 1,
  userScalable: true,
  themeColor: "#0ea5e9",
  // notch·home indicator 회피
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={`${inter.variable} h-full`}>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body
        className="min-h-full bg-bg text-text antialiased"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        <ToastProvider>{children}</ToastProvider>
        <PwaInit />
      </body>
    </html>
  );
}
