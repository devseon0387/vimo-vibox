"use client";

import { useState } from "react";
import { FileIcon, type FileKind } from "./FileIcon";

export function Thumbnail({
  kind,
  path,
  size = "sm",
}: {
  kind: FileKind;
  path: string;
  size?: "sm" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  const isVideo = kind === "video";

  if (!isVideo || failed) {
    return <FileIcon kind={kind} />;
  }

  const box = size === "lg" ? "w-20 h-12" : "w-12 h-8";

  return (
    <span
      className={`${box} rounded-md overflow-hidden shrink-0 bg-hover relative border border-black/5`}
    >
      <img
        src={`/api/thumb?path=${encodeURIComponent(path)}`}
        alt=""
        loading="lazy"
        className="w-full h-full object-cover"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
