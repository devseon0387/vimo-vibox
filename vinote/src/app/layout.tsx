import type { Metadata } from "next";
import "./globals.css";
import { GlobalHotkeys } from "@/components/GlobalHotkeys";

export const metadata: Metadata = {
  title: "비노트",
  description: "글쓰기 전용 컴패니언",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full bg-[#fafaf8] text-zinc-900">
        {children}
        <GlobalHotkeys />
      </body>
    </html>
  );
}
