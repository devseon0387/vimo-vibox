"use client";

import { FileIcon, type FileKind } from "./FileIcon";
import { ThumbImg } from "./ThumbImg";

export function Thumbnail({
  kind,
  path,
  size = "sm",
}: {
  kind: FileKind;
  path: string;
  size?: "sm" | "lg";
}) {
  if (kind !== "video") {
    return <FileIcon kind={kind} />;
  }

  const box = size === "lg" ? "w-20 h-12" : "w-12 h-8";

  // 썸네일은 u1/u2 직결(:8443)로 받아 CF(LAX) 지연 우회 — 실패 시 CF, 그다음 아이콘 폴백.
  return (
    <span
      className={`${box} rounded-md overflow-hidden shrink-0 bg-hover relative border border-black/5`}
    >
      <ThumbImg
        path={path}
        className="w-full h-full object-cover"
        fallback={<FileIcon kind={kind} />}
      />
    </span>
  );
}
