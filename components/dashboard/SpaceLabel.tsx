import { Package, Users } from "lucide-react";
import type { FileSpace } from "@/lib/dashboard/queries";

/** 모든 파일 카드·코멘트·공유 활동에 일관되게 노출하는 공간 라벨. */
export function SpaceLabel({
  space,
  size = "md",
  withText = true,
}: {
  space: FileSpace;
  size?: "sm" | "md";
  withText?: boolean;
}) {
  const base = "inline-flex items-center gap-1 rounded font-bold tracking-tight";
  const sizing = size === "sm" ? "px-1 py-0.5 text-[9.5px]" : "px-1.5 py-0.5 text-[10px]";
  const style =
    space === "personal"
      ? { background: "var(--personal-soft)", color: "var(--personal-dark)" }
      : { background: "var(--team-soft)", color: "var(--team-dark)" };
  const Icon = space === "personal" ? Package : Users;
  const text = space === "personal" ? "My box" : "비모";
  const iconSize = size === "sm" ? 9 : 10;
  return (
    <span className={`${base} ${sizing}`} style={style}>
      <Icon size={iconSize} strokeWidth={2.4} />
      {withText && <span>{text}</span>}
    </span>
  );
}
