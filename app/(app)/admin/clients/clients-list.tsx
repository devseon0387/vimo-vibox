"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Users, Mail, ChevronRight, Loader2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import { humanError } from "@/lib/human-error";

type ClientRow = {
  id: string;
  name: string;
  slug: string;
  contactEmail: string | null;
  notes: string | null;
  active: boolean;
  videoCount: number;
  createdAt: number;
};

export function ClientsList() {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<ClientRow[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const r = await fetch("/api/clients");
    if (r.ok) {
      const data = (await r.json()) as { clients: ClientRow[] };
      setItems(data.clients);
    } else {
      setItems([]);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const r = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          contactEmail: email.trim(),
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        toast.error(humanError(body.error ?? r.statusText, "general"));
        return;
      }
      const data = (await r.json()) as { slug: string };
      toast.success("클라이언트 추가됨");
      setShowAdd(false);
      setName("");
      setEmail("");
      router.push(`/admin/clients/${data.slug}`);
    } finally {
      setCreating(false);
    }
  };

  if (items === null) {
    return (
      <div className="grid place-items-center py-16 text-text-faint text-base">
        <Loader2 size={18} className="animate-spin mb-2" />
        불러오는 중…
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-base text-text-soft">
          총{" "}
          <span className="font-semibold text-text">{items.length}</span>개
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="bg-text text-white hover:bg-[#333] px-3.5 py-2 rounded-md text-base font-semibold inline-flex items-center gap-1.5"
          >
            <Plus size={14} strokeWidth={2.5} />새 클라이언트
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="bg-white border border-border rounded-lg p-4 mb-5 space-y-3">
          <div>
            <label className="block text-sm font-semibold text-text-soft mb-1">
              이름
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="예: A 브랜드"
              className="w-full px-3 py-2 border border-border rounded-md text-md outline-none focus:border-accent"
              onKeyDown={(e) => {
                if (e.key === "Enter") create();
              }}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-text-soft mb-1">
              이메일 (선택)
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="contact@a-brand.com"
              className="w-full px-3 py-2 border border-border rounded-md text-md outline-none focus:border-accent"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 text-base text-text-muted hover:text-text"
            >
              취소
            </button>
            <button
              onClick={create}
              disabled={creating || !name.trim()}
              className="bg-accent text-white hover:bg-accent/90 disabled:opacity-50 px-3 py-1.5 rounded-md text-base font-semibold"
            >
              {creating ? "추가 중…" : "추가"}
            </button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-xl py-16 px-6 text-center bg-white">
          <Users
            size={28}
            strokeWidth={1.6}
            className="mx-auto text-text-faint mb-3"
          />
          <div className="text-md font-semibold text-text mb-1">
            아직 등록된 클라이언트가 없어요
          </div>
          <div className="text-sm text-text-muted">
            위 버튼을 눌러 첫 클라이언트를 추가해보세요
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((c) => (
            <Link
              key={c.id}
              href={`/admin/clients/${c.slug}`}
              className="bg-white border border-border rounded-lg p-4 hover:border-border-hover transition-colors"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <h3 className="text-lg font-bold text-text truncate">
                  {c.name}
                </h3>
                {!c.active && (
                  <span className="shrink-0 text-2xs font-bold text-text-faint bg-surface border border-border rounded px-1.5 py-0.5">
                    비활성
                  </span>
                )}
              </div>
              <div className="text-xs text-text-faint truncate font-mono mb-2">
                /c/{c.slug}
              </div>
              <div className="flex items-center gap-3 text-xs text-text-muted">
                <span>
                  영상{" "}
                  <span className="font-semibold tabular-nums text-text">
                    {c.videoCount}
                  </span>
                </span>
                {c.contactEmail && (
                  <span className="inline-flex items-center gap-1 truncate min-w-0">
                    <Mail size={11} strokeWidth={2} />
                    <span className="truncate">{c.contactEmail}</span>
                  </span>
                )}
                <ChevronRight
                  size={13}
                  strokeWidth={2}
                  className="ml-auto text-text-faint shrink-0"
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
