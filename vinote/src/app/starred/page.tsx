"use client";

import { FilteredList } from "@/components/FilteredList";

export default function StarredPage() {
  return <FilteredList title="즐겨찾기" filter={{ starred: true }} />;
}
