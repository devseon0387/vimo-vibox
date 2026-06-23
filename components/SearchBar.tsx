"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";

export function SearchBar() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  useEffect(() => {
    setQ(params.get("q") ?? "");
  }, [params]);

  const submit = () => {
    const t = q.trim();
    if (t) router.push(`/?q=${encodeURIComponent(t)}`);
    else router.push("/");
  };

  const clear = () => {
    setQ("");
    router.push("/");
  };

  return (
    <div className="relative w-full md:flex-1 md:max-w-[360px] md:ml-auto">
      <Search
        size={14}
        strokeWidth={2.2}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint"
      />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape" && q) clear();
        }}
        placeholder="파일 검색... (Enter)"
        className="w-full pl-9 pr-9 py-1.5 border border-border rounded-md text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all bg-white"
      />
      {q && (
        <button
          onClick={clear}
          title="지우기"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-hover text-text-faint hover:text-text"
        >
          <X size={13} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}
