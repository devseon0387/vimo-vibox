import {
  Type,
  Scissors,
  Palette,
  Volume2,
  Sparkles,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";
import type { Category } from "@/lib/comments/detect";
import { getCategoryMeta } from "@/lib/comments/detect";

const iconMap: Record<Category, LucideIcon> = {
  txt: Type,
  cut: Scissors,
  col: Palette,
  aud: Volume2,
  mtn: Sparkles,
  etc: MessageCircle,
};

export function CategoryIcon({
  category,
  size = 14,
  stroke = 2,
}: {
  category: Category;
  size?: number;
  stroke?: number;
}) {
  const Icon = iconMap[category];
  return <Icon size={size} strokeWidth={stroke} />;
}

export function CategoryBadge({
  category,
  showLabel = true,
}: {
  category: Category;
  showLabel?: boolean;
}) {
  const meta = getCategoryMeta(category);
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap"
      style={{ color: meta.color, background: meta.bgSoft }}
    >
      <CategoryIcon category={category} size={11} stroke={2.5} />
      {showLabel && meta.label}
    </span>
  );
}

export function CategoryIconBox({
  category,
  size = 28,
}: {
  category: Category;
  size?: number;
}) {
  const meta = getCategoryMeta(category);
  return (
    <span
      className="rounded-lg grid place-items-center shrink-0"
      style={{
        width: size,
        height: size,
        color: meta.color,
        background: meta.bgSoft,
      }}
    >
      <CategoryIcon category={category} size={Math.floor(size * 0.5)} />
    </span>
  );
}
