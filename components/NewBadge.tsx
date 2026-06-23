"use client";

import { useFeatureBadge, type FeatureKey } from "@/lib/feature-badges";

export function NewBadge({ feature }: { feature: FeatureKey }) {
  const { show } = useFeatureBadge(feature);
  if (!show) return null;
  return (
    <span className="text-2xs font-extrabold tracking-wider px-1.5 py-[1px] rounded bg-emerald-500 text-white shrink-0 leading-tight">
      NEW
    </span>
  );
}
