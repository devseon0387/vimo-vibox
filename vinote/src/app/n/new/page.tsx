"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveNote } from "@/lib/api";

export default function NewNotePage() {
  const router = useRouter();

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const slug = `untitled-${Date.now().toString(36).slice(-6)}`;
    const path = `/notes/_inbox/${today}-${slug}.md`;
    saveNote({
      path,
      body: "",
      meta: { title: "", updated: new Date().toISOString() },
      manual: false,
    }).then((r) => {
      if (r.ok) router.replace(`/n/${encodeURIComponent(path)}`);
      else router.replace(`/?error=${encodeURIComponent("저장 실패: " + ("error" in r ? r.error : "conflict"))}`);
    });
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center text-sm text-zinc-400">
      새 글 만드는 중…
    </div>
  );
}
