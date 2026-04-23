import Link from "next/link";
import Image from "next/image";
import { LogOut } from "lucide-react";
import { getCurrentSession } from "@/lib/auth/session";
import { logoutAction } from "@/app/login/actions";
import { SidebarNav } from "./SidebarNav";

export async function Sidebar() {
  const session = await getCurrentSession();

  return (
    <aside className="w-[240px] bg-surface border-r border-border flex flex-col h-screen">
      <div className="px-5 pt-6 pb-5">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[15px] font-extrabold tracking-tight text-text"
        >
          <Image
            src="/logo.png"
            alt="Vibox"
            width={24}
            height={24}
            priority
            className="rounded"
          />
          vi<span className="text-accent">.</span>box
        </Link>
      </div>

      <SidebarNav isAdmin={session?.role === "admin"} />

      <div className="border-t border-border px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-purple text-white grid place-items-center text-[11px] font-bold shrink-0">
          {(session?.name ?? session?.username ?? "?").slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold truncate">
            {session?.name || session?.username || "Unknown"}
          </div>
          <div className="text-[11px] text-text-faint truncate">
            {session?.role === "admin" ? "관리자" : "멤버"}
          </div>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            title="로그아웃"
            className="p-1.5 rounded text-text-faint hover:text-danger hover:bg-danger-soft transition-colors"
          >
            <LogOut size={14} strokeWidth={2} />
          </button>
        </form>
      </div>
    </aside>
  );
}
