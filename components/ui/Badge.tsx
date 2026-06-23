import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";

/**
 * 비박스 공용 배지. RoleBadge·CategoryBadge·NewBadge·인라인 칩을 하나로 흡수.
 *  - tone: neutral(무채색) · accent · sky · success · warning · danger · purple (전부 soft)
 *  - size: sm · md
 * 의미색은 토큰에 매핑(bg-accent-soft/text-accent 등).
 */
type Tone =
  | "neutral"
  | "accent"
  | "sky"
  | "success"
  | "warning"
  | "danger"
  | "purple";
type Size = "sm" | "md";

export type BadgeProps = {
  tone?: Tone;
  size?: Size;
  icon?: LucideIcon;
  className?: string;
  children: ReactNode;
};

const TONE: Record<Tone, string> = {
  neutral: "bg-mybox-soft text-mybox",
  accent: "bg-accent-soft text-accent",
  sky: "bg-personal-soft text-personal-dark",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  purple: "bg-purple-soft text-purple",
};

const SIZE: Record<Size, string> = {
  sm: "text-2xs px-1.5 py-[3px] gap-1",
  md: "text-xs px-2 py-1 gap-1",
};

export function Badge({
  tone = "neutral",
  size = "md",
  icon: Icon,
  className = "",
  children,
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center font-bold rounded-md leading-none ${SIZE[size]} ${TONE[tone]} ${className}`}
    >
      {Icon ? <Icon size={size === "sm" ? 10 : 12} strokeWidth={2.4} /> : null}
      {children}
    </span>
  );
}
