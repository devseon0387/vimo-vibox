"use client";

import { use } from "react";
import { FilteredList } from "@/components/FilteredList";

export default function FolderPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const decoded = decodeURIComponent(name);
  // 서버 인덱스의 folder 컬럼은 "/_inbox" 형식
  const folder = decoded.startsWith("/") ? decoded : "/" + decoded;
  return (
    <FilteredList
      title={decoded === "_inbox" ? "인박스" : decoded}
      subtitle={folder}
      filter={{ folder }}
    />
  );
}
