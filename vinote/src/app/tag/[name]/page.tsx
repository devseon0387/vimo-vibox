"use client";

import { use } from "react";
import { FilteredList } from "@/components/FilteredList";

export default function TagPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const decoded = decodeURIComponent(name);
  return (
    <FilteredList title={`#${decoded}`} subtitle={`태그: ${decoded}`} filter={{ tag: decoded }} />
  );
}
