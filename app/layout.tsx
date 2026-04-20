import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vibox",
  description: "VIMO 내부 팀용 파일 공유 플랫폼",
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
      <body className="min-h-full bg-bg text-text antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
