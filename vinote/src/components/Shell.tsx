"use client";

import { useEffect, useState } from "react";
import { PanelLeft } from "lucide-react";
import { Sidebar } from "./Sidebar";

export function Shell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  // localStorage 영속
  useEffect(() => {
    try {
      const v = localStorage.getItem("vinote.sidebar.collapsed");
      if (v === "1") setCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("vinote.sidebar.collapsed", collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  // Cmd+\ 단축키로 토글
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setCollapsed((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-screen">
      {!collapsed && <Sidebar />}
      <main className="flex-1 overflow-y-auto">
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="absolute left-2 top-3 z-10 rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
            title="사이드바 (⌘\)"
          >
            <PanelLeft size={14} />
          </button>
        )}
        {children}
      </main>
    </div>
  );
}
